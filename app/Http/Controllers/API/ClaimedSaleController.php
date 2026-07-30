<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\ClaimedSale;
use App\Models\CounterShift;
use App\Models\LedgerReport;
use App\Models\Terminal;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class ClaimedSaleController extends Controller
{
    private function resolveTerminal(Request $request): ?Terminal
    {
        $terminal = Terminal::where('hardware_id', $request->hardware_id)->first();

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

            $lastShiftNum = CounterShift::where('terminal_id', $terminal->id)
                ->lockForUpdate()
                ->max('shift_number') ?? 0;

            return CounterShift::create([
                'tenant_id' => $terminal->tenant_id,
                'terminal_id' => $terminal->id,
                'shift_number' => $lastShiftNum + 1,
                'opened_at' => now(),
                'opened_by' => $terminal->terminal_name,
                'status' => 'open',
            ]);
        });
    }

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'shift_id' => 'nullable|integer',
            'date' => 'nullable|string',
            'from_date' => 'nullable|string',
            'to_date' => 'nullable|string',
        ]);

        $terminal = $this->resolveTerminal($request);

        if (! $terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $activeShift = CounterShift::where('terminal_id', $terminal->id)
            ->where('status', 'open')
            ->orderBy('opened_at', 'desc')
            ->first();

        $archivedShifts = CounterShift::where('terminal_id', $terminal->id)
            ->orderBy('shift_number', 'desc')
            ->take(50)
            ->get();

        $query = ClaimedSale::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'claimed')
            ->with(['terminal:id,terminal_name', 'shift:id,shift_number', 'bankAccount:id,account_name,account_number,currency']);

        if ($request->filled('date')) {
            $query->whereDate('claimed_at', $request->date);
        }

        if ($request->filled('from_date') && $request->filled('to_date')) {
            $query->whereBetween('claimed_at', [
                Carbon::parse($request->from_date)->startOfDay(),
                Carbon::parse($request->to_date)->endOfDay(),
            ]);
        }

        if ($request->filled('shift_id') && $request->shift_id !== 'all') {
            $query->where('shift_id', $request->shift_id);
        }

        $hasExplicitFilter = $request->filled('date')
            || ($request->filled('from_date') && $request->filled('to_date'))
            || ($request->filled('shift_id') && $request->shift_id !== 'all');

        if (! $hasExplicitFilter && $activeShift) {
            $query->where('shift_id', $activeShift->id);
        }

        $claimedSales = $query->orderBy('claimed_at', 'desc')->get();

        $allClaimedMap = [];
        $allClaims = ClaimedSale::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'claimed')
            ->where('claimed_at', '>=', now()->subDays(90))
            ->pluck('terminal_id', 'transaction_id');

        if ($allClaims->isNotEmpty()) {
            $terminalNames = Terminal::where('tenant_id', $terminal->tenant_id)
                ->pluck('terminal_name', 'id');

            foreach ($allClaims as $transactionId => $claimTerminalId) {
                $allClaimedMap[$transactionId] = [
                    'is_this_terminal' => ($claimTerminalId == $terminal->id),
                    'terminal_name' => $terminalNames[$claimTerminalId] ?? 'Counter',
                ];
            }
        }

        return response()->json([
            'status' => 'success',
            'terminal' => [
                'id' => $terminal->id,
                'terminal_name' => $terminal->terminal_name,
            ],
            'active_shift' => $activeShift,
            'archived_shifts' => $archivedShifts,
            'claimed_sales' => $claimedSales,
            'all_claimed_map' => $allClaimedMap,
        ]);
    }

    public function claim(Request $request): JsonResponse
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'transaction_id' => 'required|string',
            'bank_type' => 'required|string',
            'bank_account_id' => 'nullable|integer',
            'account_number' => 'nullable|string',
            'blaz_number' => 'nullable|string',
            'reference_number' => 'nullable|string',
            'transaction_date' => 'nullable|string',
            'amount' => 'required|numeric',
            'currency' => 'nullable|string',
            'payer_name' => 'nullable|string',
            'description' => 'nullable|string',
            'sale_reference' => 'nullable|string',
            'notes' => 'nullable|string',
            'claimed_by_name' => 'nullable|string',
        ]);

        $terminal = $this->resolveTerminal($request);

        if (! $terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $permissions = $terminal->permissions;
        if (isset($permissions['sales_claiming_enabled']) && ! $permissions['sales_claiming_enabled']) {
            return response()->json(['error' => 'Sales claiming is disabled for this terminal'], 403);
        }

        $activeShift = $this->findOrCreateActiveShift($terminal);

        try {
            $claimedSale = ClaimedSale::create([
                'tenant_id' => $terminal->tenant_id,
                'terminal_id' => $terminal->id,
                'shift_id' => $activeShift->id,
                'bank_account_id' => $request->bank_account_id,
                'account_number' => $request->account_number,
                'bank_type' => $request->bank_type,
                'transaction_id' => $request->transaction_id,
                'blaz_number' => $request->blaz_number,
                'reference_number' => $request->reference_number,
                'transaction_date' => $request->transaction_date ? Carbon::parse($request->transaction_date) : now(),
                'amount' => $request->amount,
                'currency' => strtoupper($request->currency ?? 'MVR'),
                'payer_name' => $request->payer_name,
                'description' => $request->description,
                'sale_reference' => $request->sale_reference,
                'notes' => $request->notes,
                'claimed_by_name' => $request->claimed_by_name ?? $terminal->terminal_name,
                'claimed_at' => now(),
                'status' => 'claimed',
            ]);
        } catch (QueryException $e) {
            $existing = ClaimedSale::where('tenant_id', $terminal->tenant_id)
                ->where('transaction_id', $request->transaction_id)
                ->with('terminal:id,terminal_name')
                ->first();

            if ($existing) {
                $claimedBy = $existing->terminal?->terminal_name ?? 'another counter';

                return response()->json([
                    'error' => "Transaction already claimed by {$claimedBy}",
                    'claimed_sale' => $existing,
                ], 409);
            }
            throw $e;
        }

        return response()->json([
            'status' => 'success',
            'claimed_sale' => $claimedSale->load(['terminal:id,terminal_name', 'bankAccount:id,account_name,account_number']),
        ]);
    }

    public function unclaim(Request $request): JsonResponse
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'transaction_id' => 'required|string',
            'settings_pin' => 'nullable|string',
        ]);

        $terminal = $this->resolveTerminal($request);

        if (! $terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        if (! empty($terminal->settings_pin)) {
            $inputPin = $request->settings_pin ? (string) $request->settings_pin : '';
            $isPlainMatch = ($terminal->settings_pin === $inputPin);
            $isHashMatch = false;
            if (! $isPlainMatch && str_starts_with($terminal->settings_pin, '$2y$')) {
                try {
                    $isHashMatch = Hash::check($inputPin, $terminal->settings_pin);
                } catch (\Throwable $e) {
                    $isHashMatch = false;
                }
            }

            if (! $isPlainMatch && ! $isHashMatch) {
                return response()->json(['error' => 'Invalid Counter Settings PIN. Unclaiming denied.'], 401);
            }
        }

        $claimedSale = ClaimedSale::where('tenant_id', $terminal->tenant_id)
            ->where('transaction_id', $request->transaction_id)
            ->first();

        if (! $claimedSale) {
            return response()->json(['error' => 'Claimed sale record not found'], 404);
        }

        $claimedSale->delete();

        return response()->json(['status' => 'success', 'message' => 'Deposit item unclaimed successfully']);
    }

    public function openShift(Request $request): JsonResponse
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'opened_by' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $terminal = $this->resolveTerminal($request);

        if (! $terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $existing = CounterShift::where('terminal_id', $terminal->id)
            ->where('status', 'open')
            ->first();

        if ($existing) {
            return response()->json(['status' => 'success', 'shift' => $existing, 'message' => 'Shift is already open']);
        }

        $shift = DB::transaction(function () use ($terminal, $request) {
            $lastShiftNum = CounterShift::where('terminal_id', $terminal->id)
                ->lockForUpdate()
                ->max('shift_number') ?? 0;

            return CounterShift::create([
                'tenant_id' => $terminal->tenant_id,
                'terminal_id' => $terminal->id,
                'shift_number' => $lastShiftNum + 1,
                'opened_at' => now(),
                'opened_by' => $request->opened_by ?? $terminal->terminal_name,
                'notes' => $request->notes,
                'status' => 'open',
            ]);
        });

        return response()->json(['status' => 'success', 'shift' => $shift]);
    }

    public function closeShift(Request $request): JsonResponse
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'closed_by' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $terminal = $this->resolveTerminal($request);

        if (! $terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $result = DB::transaction(function () use ($terminal, $request) {
            $shift = CounterShift::where('terminal_id', $terminal->id)
                ->where('status', 'open')
                ->lockForUpdate()
                ->orderBy('opened_at', 'desc')
                ->first();

            if (! $shift) {
                return ['error' => 'No active open shift found to close', 'code' => 404];
            }

            $claimedSales = ClaimedSale::where('shift_id', $shift->id)
                ->where('status', 'claimed')
                ->lockForUpdate()
                ->get();

            $totalMvr = $claimedSales->where('currency', 'MVR')->sum('amount');
            $totalUsd = $claimedSales->where('currency', 'USD')->sum('amount');
            $totalCount = $claimedSales->count();

            $shift->update([
                'closed_at' => now(),
                'closed_by' => $request->closed_by ?? $terminal->terminal_name,
                'total_claimed_amount_mvr' => $totalMvr,
                'total_claimed_amount_usd' => $totalUsd,
                'total_claimed_count' => $totalCount,
                'notes' => $request->notes ?? $shift->notes,
                'status' => 'closed',
            ]);

            LedgerReport::create([
                'tenant_id' => $terminal->tenant_id,
                'terminal_id' => $terminal->id,
                'report_type' => 'shift_report',
                'date' => now()->toDateString(),
                'bank' => 'Counter Shift',
                'account_name' => "Shift #{$shift->shift_number} — {$terminal->terminal_name}",
                'account_number' => null,
                'encrypted_payload' => json_encode([
                    'type' => 'shift_report',
                    'shift_number' => $shift->shift_number,
                    'opened_at' => $shift->opened_at->toIso8601String(),
                    'closed_at' => now()->toIso8601String(),
                    'total_claimed_mvr' => (float) $totalMvr,
                    'total_claimed_usd' => (float) $totalUsd,
                    'total_claimed_count' => $totalCount,
                    'transactions' => $claimedSales->map(fn ($s) => [
                        'claimed_at' => $s->claimed_at?->toIso8601String(),
                        'transaction_id' => $s->transaction_id,
                        'currency' => $s->currency,
                        'amount' => (float) $s->amount,
                        'payer_name' => $s->payer_name,
                        'description' => $s->description,
                        'sale_reference' => $s->sale_reference,
                    ])->values()->toArray(),
                ]),
            ]);

            $lastShiftNum = CounterShift::where('terminal_id', $terminal->id)
                ->lockForUpdate()
                ->max('shift_number') ?? 0;

            $nextShift = CounterShift::create([
                'tenant_id' => $terminal->tenant_id,
                'terminal_id' => $terminal->id,
                'shift_number' => $lastShiftNum + 1,
                'opened_at' => now(),
                'opened_by' => $terminal->terminal_name,
                'status' => 'open',
            ]);

            return [
                'status' => 'success',
                'closed_shift' => $shift,
                'new_shift' => $nextShift,
                'sales' => $claimedSales,
            ];
        });

        if (isset($result['error'])) {
            return response()->json(['error' => $result['error']], $result['code']);
        }

        return response()->json($result);
    }

    public function monthlyReport(Request $request): JsonResponse
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'year' => 'required|integer|min:2000|max:2099',
            'month' => 'required|integer|min:1|max:12',
        ]);

        $terminal = $this->resolveTerminal($request);

        if (! $terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $startDate = Carbon::create($request->integer('year'), $request->integer('month'), 1)->startOfDay();
        $endDate = (clone $startDate)->endOfMonth()->endOfDay();

        $aggregation = ClaimedSale::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'claimed')
            ->whereBetween('claimed_at', [$startDate, $endDate])
            ->selectRaw('currency, COUNT(*) as count, SUM(amount) as total')
            ->groupBy('currency')
            ->pluck('total', 'currency');

        $claimedSales = ClaimedSale::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'claimed')
            ->whereBetween('claimed_at', [$startDate, $endDate])
            ->with(['bankAccount:id,account_name,account_number,currency'])
            ->orderBy('claimed_at')
            ->get();

        return response()->json([
            'year' => $request->integer('year'),
            'month' => $request->integer('month'),
            'terminal_name' => $terminal->terminal_name,
            'totals' => [
                'total_count' => $claimedSales->count(),
                'total_mvr' => (float) ($aggregation['MVR'] ?? 0),
                'total_usd' => (float) ($aggregation['USD'] ?? 0),
            ],
            'claimed_sales' => $claimedSales,
        ]);
    }

    public function shiftReports(Request $request): JsonResponse
    {
        $request->validate([
            'hardware_id' => 'nullable|string',
            'tenant_id' => 'nullable|integer',
            'terminal_id' => 'nullable|integer',
        ]);

        if ($request->filled('hardware_id')) {
            $terminal = Terminal::where('hardware_id', $request->hardware_id)->first();
            if (! $terminal) {
                return response()->json(['error' => 'Terminal unauthorized'], 403);
            }
            $tenantId = $terminal->tenant_id;
            $terminalId = $terminal->id;
        } else {
            $tenantId = $request->tenant_id;
            $terminalId = $request->terminal_id;
        }

        $query = CounterShift::with(['terminal:id,terminal_name', 'claimedSales']);

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }
        if ($terminalId) {
            $query->where('terminal_id', $terminalId);
        }

        $shifts = $query->orderBy('opened_at', 'desc')->take(50)->get();

        return response()->json([
            'status' => 'success',
            'shifts' => $shifts,
        ]);
    }
}
