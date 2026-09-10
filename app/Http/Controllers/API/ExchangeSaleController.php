<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\ClaimedSale;
use App\Models\CounterShift;
use App\Models\ExchangeSale;
use App\Models\KycCustomer;
use App\Models\KycRecord;
use App\Models\Terminal;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ExchangeSaleController extends Controller
{
    private function resolveTerminal(Request $request): ?Terminal
    {
        $hardwareId = $request->input('hardware_id') ?: $request->header('X-Hardware-Id');
        if (! $hardwareId) {
            return null;
        }

        $terminal = Terminal::where('hardware_id', $hardwareId)->first();
        if (! $terminal || $terminal->status !== 'active') {
            return null;
        }

        return $terminal;
    }

    private function findOrCreateActiveShift(Terminal $terminal): CounterShift
    {
        return DB::transaction(function () use ($terminal) {
            $shift = CounterShift::where('terminal_id', $terminal->id)
                ->where('status', 'open')
                ->lockForUpdate()
                ->orderBy('opened_at', 'desc')
                ->first();

            if ($shift) {
                return $shift;
            }

            $today = now()->toDateString();
            $lastShiftNumToday = CounterShift::where('terminal_id', $terminal->id)
                ->whereDate('opened_at', $today)
                ->lockForUpdate()
                ->max('shift_number') ?? 0;

            return CounterShift::create([
                'tenant_id' => $terminal->tenant_id,
                'terminal_id' => $terminal->id,
                'shift_number' => $lastShiftNumToday + 1,
                'shift_date' => $today,
                'opened_at' => now(),
                'opened_by' => $terminal->terminal_name,
                'status' => 'open',
            ]);
        });
    }

    public function index(Request $request): JsonResponse
    {
        $terminal = $this->resolveTerminal($request);
        if (! $terminal) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        $query = ExchangeSale::where('tenant_id', $terminal->tenant_id)
            ->with([
                'terminal:id,terminal_name',
                'kycCustomer:id,full_name,nic_number,passport_number',
                'receivedBankAccount:id,account_name,account_number,bank_name,currency',
                'sentBankAccount:id,account_name,account_number,bank_name,currency',
            ]);

        if ($request->filled('shift_id') && $request->shift_id !== 'all') {
            $query->where('shift_id', $request->shift_id);
        } elseif ($request->boolean('today_only', false)) {
            $query->whereDate('created_at', now()->toDateString());
        }

        if ($request->filled('search')) {
            $s = '%' . $request->search . '%';
            $query->where(function ($q) use ($s) {
                $q->where('receipt_number', 'like', $s)
                    ->orWhere('customer_name', 'like', $s)
                    ->orWhere('customer_id_number', 'like', $s)
                    ->orWhere('received_transaction_id', 'like', $s)
                    ->orWhere('sent_transaction_id', 'like', $s);
            });
        }

        $sales = $query->orderBy('created_at', 'desc')->take(100)->get();

        return response()->json($sales);
    }

    private function parseTokens(?string $raw, ?array $txList = null): array
    {
        $tokens = [];
        if ($raw) {
            $parts = preg_split('/[\r\n,]+/', $raw);
            foreach ($parts as $p) {
                $trimmed = trim($p);
                if ($trimmed !== '') $tokens[] = $trimmed;
            }
        }
        if (is_array($txList)) {
            foreach ($txList as $tx) {
                if (!empty($tx['hash'])) $tokens[] = trim($tx['hash']);
                if (!empty($tx['reference'])) $tokens[] = trim($tx['reference']);
            }
        }
        return array_values(array_unique($tokens));
    }

    public function getClaimedTransactions(Request $request): JsonResponse
    {
        $terminal = $this->resolveTerminal($request);
        if (! $terminal) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        // Helper to extract clean tokens from strings (comma or newline separated)
        $tokenize = function (array $rawList) {
            $tokens = [];
            foreach ($rawList as $raw) {
                if (empty($raw)) continue;
                $parts = preg_split('/[\r\n,]+/', (string)$raw);
                foreach ($parts as $p) {
                    $trimmed = trim($p);
                    if ($trimmed !== '') {
                        $tokens[] = $trimmed;
                    }
                }
            }
            return $tokens;
        };

        // Collect all claimed transaction IDs and hashes across exchange_sales and claimed_sales
        $exchangeReceivedIds = ExchangeSale::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'completed')
            ->whereNotNull('received_transaction_id')
            ->pluck('received_transaction_id')
            ->toArray();

        $exchangeReceivedHashes = ExchangeSale::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'completed')
            ->whereNotNull('received_transaction_hash')
            ->pluck('received_transaction_hash')
            ->toArray();

        $exchangeSentIds = ExchangeSale::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'completed')
            ->whereNotNull('sent_transaction_id')
            ->pluck('sent_transaction_id')
            ->toArray();

        $exchangeSentHashes = ExchangeSale::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'completed')
            ->whereNotNull('sent_transaction_hash')
            ->pluck('sent_transaction_hash')
            ->toArray();

        $legacyClaimedIds = ClaimedSale::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'claimed')
            ->pluck('transaction_id')
            ->toArray();

        // Also check JSON columns received_transactions and sent_transactions
        $jsonRows = ExchangeSale::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'completed')
            ->where(function($q) {
                $q->whereNotNull('received_transactions')->orWhereNotNull('sent_transactions');
            })
            ->get(['received_transactions', 'sent_transactions']);

        $jsonTokens = [];
        foreach ($jsonRows as $row) {
            if (is_array($row->received_transactions)) {
                foreach ($row->received_transactions as $tx) {
                    if (!empty($tx['hash'])) $jsonTokens[] = trim($tx['hash']);
                    if (!empty($tx['reference'])) $jsonTokens[] = trim($tx['reference']);
                    if (!empty($tx['details'])) $jsonTokens[] = trim($tx['details']);
                }
            }
            if (is_array($row->sent_transactions)) {
                foreach ($row->sent_transactions as $tx) {
                    if (!empty($tx['hash'])) $jsonTokens[] = trim($tx['hash']);
                    if (!empty($tx['reference'])) $jsonTokens[] = trim($tx['reference']);
                    if (!empty($tx['details'])) $jsonTokens[] = trim($tx['details']);
                }
            }
        }

        $allClaimed = array_values(array_unique(array_filter(array_merge(
            $tokenize($exchangeReceivedIds),
            $tokenize($exchangeReceivedHashes),
            $tokenize($exchangeSentIds),
            $tokenize($exchangeSentHashes),
            $tokenize($legacyClaimedIds),
            $jsonTokens
        ))));

        return response()->json([
            'claimed_keys' => $allClaimed,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $terminal = $this->resolveTerminal($request);
        if (! $terminal) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        $request->validate([
            'sale_type' => 'required|in:buy,sell',
            'base_currency' => 'required|string|max:10',
            'quote_currency' => 'required|string|max:10',
            'base_amount' => 'required|numeric|gt:0',
            'exchange_rate' => 'required|numeric|gt:0',
            'quote_amount' => 'required|numeric|gt:0',

            'received_payment_type' => 'required|in:cash,bank',
            'received_bank_account_id' => 'nullable|integer',
            'received_transaction_id' => 'nullable|string',
            'received_transaction_hash' => 'nullable|string',
            'received_transactions' => 'nullable|array',
            'received_amount' => 'required|numeric|gt:0',
            'received_currency' => 'required|string|max:10',

            'sent_payment_type' => 'required|in:cash,bank',
            'sent_bank_account_id' => 'nullable|integer',
            'sent_transaction_id' => 'nullable|string',
            'sent_transaction_hash' => 'nullable|string',
            'sent_transactions' => 'nullable|array',
            'sent_amount' => 'required|numeric|gt:0',
            'sent_currency' => 'required|string|max:10',

            'kyc_customer_id' => 'nullable|integer',
            'customer_name' => 'nullable|string|max:191',
            'customer_id_number' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'is_suspicious' => 'nullable|boolean',
            'str_notes' => 'nullable|string',
        ]);

        $tenantId = $terminal->tenant_id;

        // 1. Strict De-Duplication Check for Received Bank Transaction
        if ($request->received_payment_type === 'bank') {
            $recvTokens = $this->parseTokens($request->received_transaction_id, $request->received_transactions);
            $recvHashTokens = $this->parseTokens($request->received_transaction_hash);
            $allRecvTokens = array_values(array_unique(array_merge($recvTokens, $recvHashTokens)));

            if (!empty($allRecvTokens)) {
                $alreadyClaimed = ExchangeSale::where('tenant_id', $tenantId)
                    ->where('status', 'completed')
                    ->where(function ($q) use ($allRecvTokens) {
                        foreach ($allRecvTokens as $token) {
                            $q->orWhere('received_transaction_id', 'like', "%{$token}%")
                              ->orWhere('received_transaction_hash', 'like', "%{$token}%")
                              ->orWhere('sent_transaction_id', 'like', "%{$token}%")
                              ->orWhere('sent_transaction_hash', 'like', "%{$token}%");
                        }
                    })
                    ->exists();

                if ($alreadyClaimed) {
                    return response()->json(['error' => 'One or more of the selected received bank transactions have already been claimed in another sale.'], 409);
                }
            }
        }

        // 2. Strict De-Duplication Check for Sent Bank Transaction
        if ($request->sent_payment_type === 'bank') {
            $sentTokens = $this->parseTokens($request->sent_transaction_id, $request->sent_transactions);
            $sentHashTokens = $this->parseTokens($request->sent_transaction_hash);
            $allSentTokens = array_values(array_unique(array_merge($sentTokens, $sentHashTokens)));

            if (!empty($allSentTokens)) {
                $alreadyClaimed = ExchangeSale::where('tenant_id', $tenantId)
                    ->where('status', 'completed')
                    ->where(function ($q) use ($allSentTokens) {
                        foreach ($allSentTokens as $token) {
                            $q->orWhere('sent_transaction_id', 'like', "%{$token}%")
                              ->orWhere('sent_transaction_hash', 'like', "%{$token}%")
                              ->orWhere('received_transaction_id', 'like', "%{$token}%")
                              ->orWhere('received_transaction_hash', 'like', "%{$token}%");
                        }
                    })
                    ->exists();

                if ($alreadyClaimed) {
                    return response()->json(['error' => 'One or more of the selected sent bank transactions have already been claimed in another sale.'], 409);
                }
            }
        }

        $activeShift = $this->findOrCreateActiveShift($terminal);

        return DB::transaction(function () use ($request, $terminal, $activeShift, $tenantId) {
            // Generate unique receipt number
            $today = now()->format('Ymd');
            $randomSuffix = strtoupper(Str::random(4));
            $receiptNumber = 'SAL-' . $today . '-' . $randomSuffix;

            // Resolve Customer info
            $kycCustomer = null;
            if ($request->filled('kyc_customer_id')) {
                $kycCustomer = KycCustomer::where('tenant_id', $tenantId)->find($request->kyc_customer_id);
            }

            $customerName = $kycCustomer ? $kycCustomer->full_name : ($request->customer_name ?: 'Walk-in Customer');
            $customerIdNumber = $kycCustomer ? ($kycCustomer->nic_number ?: $kycCustomer->passport_number) : ($request->customer_id_number ?: null);

            // Create Exchange Sale Record
            $sale = ExchangeSale::create([
                'tenant_id' => $tenantId,
                'terminal_id' => $terminal->id,
                'shift_id' => $activeShift->id,
                'kyc_customer_id' => $kycCustomer?->id,
                'receipt_number' => $receiptNumber,
                'sale_type' => $request->sale_type,
                'base_currency' => strtoupper($request->base_currency),
                'quote_currency' => strtoupper($request->quote_currency),
                'base_amount' => $request->base_amount,
                'exchange_rate' => $request->exchange_rate,
                'quote_amount' => $request->quote_amount,
                'received_payment_type' => $request->received_payment_type,
                'received_bank_account_id' => $request->received_bank_account_id,
                'received_transaction_id' => $request->received_transaction_id,
                'received_transaction_hash' => $request->received_transaction_hash,
                'received_transactions' => $request->received_transactions,
                'received_amount' => $request->received_amount,
                'received_currency' => strtoupper($request->received_currency),
                'sent_payment_type' => $request->sent_payment_type,
                'sent_bank_account_id' => $request->sent_bank_account_id,
                'sent_transaction_id' => $request->sent_transaction_id,
                'sent_transaction_hash' => $request->sent_transaction_hash,
                'sent_transactions' => $request->sent_transactions,
                'sent_amount' => $request->sent_amount,
                'sent_currency' => strtoupper($request->sent_currency),
                'customer_name' => $customerName,
                'customer_id_number' => $customerIdNumber,
                'notes' => $request->notes,
                'created_by_name' => $terminal->terminal_name,
                'status' => 'completed',
            ]);

            // Auto-create linked KYC / AML record
            if ($kycCustomer) {
                // Calculate compliance requirements
                $isHighRisk = $kycCustomer->is_pep || $kycCustomer->is_high_risk_country;
                $mvrTotal = (strtoupper($request->base_currency) === 'MVR') ? $request->base_amount : $request->quote_amount;
                $cashComponentMvr = 0;

                if ($request->received_payment_type === 'cash') {
                    $cashComponentMvr += (strtoupper($request->received_currency) === 'MVR') ? $request->received_amount : ($request->received_amount * $request->exchange_rate);
                }
                if ($request->sent_payment_type === 'cash') {
                    $cashComponentMvr += (strtoupper($request->sent_currency) === 'MVR') ? $request->sent_amount : ($request->sent_amount * $request->exchange_rate);
                }

                $requiresCtr = ($cashComponentMvr >= 200000);
                $requiresEdd = $isHighRisk || ($mvrTotal >= 50000);
                $isSuspicious = $request->boolean('is_suspicious', false);

                $cashierUserId = $request->user()?->id ?? $terminal->tenant?->users()->first()?->id;

                $kycRecord = KycRecord::create([
                    'tenant_id' => $tenantId,
                    'terminal_id' => $terminal->id,
                    'cashier_user_id' => $cashierUserId,
                    'kyc_customer_id' => $kycCustomer->id,
                    'transaction_type' => 'money_changing',
                    'transaction_amount' => $request->base_amount,
                    'transaction_currency' => strtoupper($request->base_currency),
                    'transaction_reference' => $receiptNumber,
                    'transaction_purpose' => 'Currency Exchange: ' . strtoupper($request->sale_type) . ' ' . strtoupper($request->base_currency) . ' @ ' . $request->exchange_rate,
                    'cdd_type' => $requiresEdd ? 'enhanced' : 'standard',
                    'is_not_physically_present' => false,
                    'edd_status' => $requiresEdd ? 'pending_approval' : 'not_required',
                    'requires_ctr' => $requiresCtr,
                    'is_suspicious' => $isSuspicious,
                    'str_notes' => $isSuspicious ? ($request->str_notes ?: 'Flagged during sales checkout') : null,
                    'expires_at' => now()->addYears(5),
                ]);

                $sale->update(['kyc_record_id' => $kycRecord->id]);
            }

            return response()->json([
                'status' => 'success',
                'sale' => $sale->load([
                    'terminal:id,terminal_name',
                    'kycCustomer:id,full_name,nic_number,passport_number,nationality',
                    'kycRecord',
                    'receivedBankAccount:id,account_name,account_number,bank_name,currency',
                    'sentBankAccount:id,account_name,account_number,bank_name,currency',
                ]),
            ], 201);
        });
    }

    public function void(Request $request, int $id): JsonResponse
    {
        $terminal = $this->resolveTerminal($request);
        if (! $terminal) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        $sale = ExchangeSale::where('tenant_id', $terminal->tenant_id)->findOrFail($id);

        if ($sale->status === 'voided') {
            return response()->json(['error' => 'Sale is already voided'], 422);
        }

        $sale->update([
            'status' => 'voided',
            'voided_at' => now(),
            'voided_by_name' => $terminal->terminal_name,
            'void_reason' => $request->input('reason', 'Voided by cashier'),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Sale voided successfully. Claimed bank transactions have been released.',
            'sale' => $sale,
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $terminal = $this->resolveTerminal($request);
        if (! $terminal) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        $sale = ExchangeSale::where('tenant_id', $terminal->tenant_id)->findOrFail($id);

        if ($sale->kyc_record_id) {
            KycRecord::where('tenant_id', $terminal->tenant_id)->where('id', $sale->kyc_record_id)->delete();
        }

        $receiptNumber = $sale->receipt_number;
        $sale->delete();

        return response()->json([
            'status' => 'success',
            'message' => "Sale {$receiptNumber} deleted successfully. Claimed bank transactions have been released.",
        ]);
    }
}
