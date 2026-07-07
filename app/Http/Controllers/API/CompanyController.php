<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Models\Terminal;
use App\Models\BankAccount;
use App\Models\AuditLog;

class CompanyController extends Controller
{
    public function getSyncHealth(Request $request)
    {
        $health = \Illuminate\Support\Facades\Cache::get('sync_health_summary') ?: [
            'confidence_score' => 100,
            'efficiency_score' => 100,
            'status' => 'excellent',
            'failures_24h' => 0,
            'avg_latency_ms' => 0,
            'total_requests' => 0,
            'total_fetches' => 0,
            'backlog' => 0,
        ];
        return response()->json($health);
    }
    public function getAuditLogs(Request $request)
    {
        $tenantId = $request->user()->tenant_id;
        $logs = AuditLog::where('tenant_id', $tenantId)
            ->orderBy('created_at', 'desc')
            ->limit(500)
            ->get();
        return response()->json($logs);
    }

    // === TERMINALS ===
    public function getTerminals(Request $request)
    {
        $tenantId = $request->user()->tenant_id;
        $terminals = Terminal::where('tenant_id', $tenantId)->get();
        return response()->json($terminals);
    }

    public function createTerminal(Request $request)
    {
        $request->validate([
            'name' => 'required|string',
            'permissions' => 'nullable|array',
            'settings_pin' => 'nullable|string|max:6'
        ]);

        $tenant = $request->user()->tenant;
        $tenantId = $tenant->id;

        // Check subscription terminal limits
        $currentTerminals = Terminal::where('tenant_id', $tenantId)->count();
        $maxTerminals = $tenant->max_terminals ?? 1;

        if ($currentTerminals >= $maxTerminals) {
            return response()->json([
                'message' => 'Cashier terminal limit reached for your subscription plan. Please contact support or upgrade.'
            ], 403);
        }

        // Generate a random hardware ID
        $hardwareId = 'term_' . bin2hex(random_bytes(8));
        // Generate a 6-digit pairing code
        $pairingCode = str_pad(mt_rand(0, 999999), 6, '0', STR_PAD_LEFT);

        $permissions = $request->input('permissions', []);
        $tier = $tenant->subscription_tier;
        $features = $tenant->features;
        $isFreeOr499 = ($tier === 'free' || $tier === '499');

        $hasFeature = function($key) use ($features, $isFreeOr499) {
            if ($features === null) {
                if ($key === 'verification_enabled') return true;
                if ($isFreeOr499) return false;
                return true;
            }
            return filter_var($features[$key] ?? false, FILTER_VALIDATE_BOOLEAN);
        };

        $permissions = [
            'verification_enabled' => $hasFeature('verification_enabled'),
            'ledger_enabled' => $hasFeature('ledger_enabled') && filter_var($permissions['ledger_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'ledger_show_balance' => $hasFeature('ledger_show_balance') && filter_var($permissions['ledger_show_balance'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'ledger_show_debit' => $hasFeature('ledger_show_debit') && filter_var($permissions['ledger_show_debit'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'reports_enabled' => $hasFeature('reports_enabled') && filter_var($permissions['reports_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'show_vbtl' => filter_var($permissions['show_vbtl'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'share_pwa_logs' => filter_var($permissions['share_pwa_logs'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'terminal_pin' => isset($permissions['terminal_pin']) && $permissions['terminal_pin'] !== '' ? (string)$permissions['terminal_pin'] : null
        ];

        $terminal = Terminal::create([
            'tenant_id' => $tenantId,
            'terminal_name' => $request->name,
            'hardware_id' => $hardwareId,
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(10),
            'settings_pin' => $request->settings_pin,
            'status' => 'active',
            'permissions' => $permissions
        ]);

        \App\Models\AuditLog::create([
            'tenant_id' => $tenantId,
            'event_type' => 'terminal_created',
            'actor' => $request->user()->name,
            'ip_address' => $request->ip(),
            'metadata' => ['terminal_id' => $terminal->id, 'terminal_name' => $terminal->terminal_name]
        ]);

        return response()->json(['terminal' => $terminal]);
    }

    public function updateTerminal(Request $request, $id)
    {
        try {
            $request->validate([
                'name' => 'required|string',
                'permissions' => 'nullable|array',
                'settings_pin' => 'nullable|string|max:6'
            ]);

            $tenant = $request->user()->tenant;
            $terminal = Terminal::where('tenant_id', $tenant->id)->findOrFail($id);

            $permissions = $request->input('permissions', []);
            $tier = $tenant->subscription_tier;
            $features = $tenant->features;
            $isFreeOr499 = ($tier === 'free' || $tier === '499');

            $hasFeature = function($key) use ($features, $isFreeOr499) {
                if ($features === null) {
                    if ($key === 'verification_enabled') return true;
                    if ($isFreeOr499) return false;
                    return true;
                }
                return filter_var($features[$key] ?? false, FILTER_VALIDATE_BOOLEAN);
            };

            $permissions = [
                'verification_enabled' => $hasFeature('verification_enabled'),
                'ledger_enabled' => $hasFeature('ledger_enabled') && filter_var($permissions['ledger_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'ledger_show_balance' => $hasFeature('ledger_show_balance') && filter_var($permissions['ledger_show_balance'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'ledger_show_debit' => $hasFeature('ledger_show_debit') && filter_var($permissions['ledger_show_debit'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'reports_enabled' => $hasFeature('reports_enabled') && filter_var($permissions['reports_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'show_vbtl' => filter_var($permissions['show_vbtl'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'share_pwa_logs' => filter_var($permissions['share_pwa_logs'] ?? true, FILTER_VALIDATE_BOOLEAN),
                'terminal_pin' => isset($permissions['terminal_pin']) && $permissions['terminal_pin'] !== '' ? (string)$permissions['terminal_pin'] : null
            ];

            $terminal->update([
                'terminal_name' => $request->name,
                'settings_pin' => $request->settings_pin,
                'permissions' => $permissions
            ]);

            try {
                \App\Models\AuditLog::create([
                    'tenant_id' => $tenant->id,
                    'event_type' => 'terminal_updated',
                    'actor' => $request->user()->name,
                    'ip_address' => $request->ip(),
                    'metadata' => ['terminal_id' => $terminal->id, 'terminal_name' => $terminal->terminal_name]
                ]);
            } catch (\Exception $auditEx) {
                // Audit log failure should not block terminal update
            }

            return response()->json(['terminal' => $terminal]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['message' => implode(' ', $e->validator->errors()->all())], 422);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to update terminal: ' . $e->getMessage()], 500);
        }
    }

    public function deleteTerminal(Request $request, $id)
    {
        $terminal = Terminal::where('tenant_id', $request->user()->tenant_id)->findOrFail($id);
        
        \App\Models\AuditLog::create([
            'tenant_id' => $request->user()->tenant_id,
            'event_type' => 'terminal_deleted',
            'actor' => $request->user()->name,
            'ip_address' => $request->ip(),
            'metadata' => ['terminal_id' => $terminal->id, 'terminal_name' => $terminal->terminal_name]
        ]);

        $terminal->delete();
        return response()->json(['message' => 'Terminal deleted']);
    }

    public function enableDebug(Request $request, $id)
    {
        $terminal = Terminal::where('tenant_id', $request->user()->tenant_id)->findOrFail($id);

        $code = strtoupper(substr(md5(uniqid(mt_rand(), true)), 0, 6));
        $until = now()->addHours(2);

        $terminal->update([
            'debug_one_time_code' => $code,
            'allow_debug_until' => $until
        ]);

        return response()->json([
            'message' => 'Debug access enabled for 2 hours.',
            'debug_one_time_code' => $code,
            'allow_debug_until' => $until->toIso8601String()
        ]);
    }

    public function regeneratePairingCode(Request $request, $id)
    {
        $tenantId = $request->user()->tenant_id;
        $terminal = Terminal::where('tenant_id', $tenantId)->findOrFail($id);

        // Generate a 6-digit pairing code
        $pairingCode = str_pad(mt_rand(0, 999999), 6, '0', STR_PAD_LEFT);

        $terminal->update([
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(10),
        ]);

        return response()->json([
            'message' => 'Pairing code generated successfully.',
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => $terminal->pairing_code_expires_at->toIso8601String()
        ]);
    }

    // === BANK ACCOUNTS ===
    public function getBankAccounts(Request $request)
    {
        $tenantId = $request->user()->tenant_id;
        $accounts = BankAccount::where('tenant_id', $tenantId)->get();
        return response()->json($accounts);
    }

    public function createBankAccount(Request $request)
    {
        $tenantId = $request->user()->tenant_id;
        $tenant = $request->user()->tenant;

        // Check subscription limits
        $currentAccounts = BankAccount::where('tenant_id', $tenantId)->count();
        $limit = $tenant->max_bank_accounts ?? 1;

        if ($currentAccounts >= $limit) {
            return response()->json(['message' => 'Bank account limit reached for your subscription tier.'], 403);
        }

        $request->validate([
            'bank_name' => 'required|string',
            'account_name' => 'required|string',
            'account_number' => 'required|string',
            'mib_profile_type' => 'nullable|string|in:0,1',
            'label' => 'nullable|string',
            'currency' => 'nullable|string|in:MVR,USD',
        ]);

        $account = BankAccount::create([
            'tenant_id' => $tenantId,
            'bank_name' => $request->bank_name,
            'account_name' => $request->account_name,
            'account_number' => $request->account_number,
            'mib_profile_type' => $request->mib_profile_type ?? '0',
            'label' => $request->label,
            'currency' => $request->currency ?? 'MVR',
        ]);

        return response()->json(['account' => $account]);
    }

    public function deleteBankAccount(Request $request, $id)
    {
        $account = BankAccount::where('tenant_id', $request->user()->tenant_id)->findOrFail($id);
        $account->delete();
        return response()->json(['message' => 'Bank account deleted']);
    }

    public function resetBankAccountFailures(Request $request, $id)
    {
        $tenantId = $request->user()->tenant_id;
        $account = BankAccount::where('tenant_id', $tenantId)->findOrFail($id);

        if ($account->login_credentials_hash) {
            BankAccount::where('tenant_id', $tenantId)
                ->where('login_credentials_hash', $account->login_credentials_hash)
                ->update(['login_failures' => 0]);
        } else {
            $account->update(['login_failures' => 0]);
        }

        return response()->json(['message' => 'Login failures reset successfully']);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'phone_number' => 'required|string|max:255',
            'password' => 'nullable|string|min:8|confirmed',
            'expiry_warning_days' => 'nullable|integer|min:0|max:90'
        ]);

        $user->phone_number = $request->phone_number;
        if ($request->filled('password')) {
            $user->password = Hash::make($request->password);
        }
        $user->save();

        if ($request->has('expiry_warning_days')) {
            $tenant = $user->tenant;
            $features = $tenant->features ?? [];
            $features['expiry_warning_days'] = (int) $request->expiry_warning_days;
            $tenant->features = $features;
            $tenant->save();
        }

        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => $user->load('tenant')
        ]);
    }

    public function disableDebug(Request $request, $id)
    {
        $terminal = Terminal::where('tenant_id', $request->user()->tenant_id)->findOrFail($id);

        $terminal->update([
            'debug_one_time_code' => null,
            'allow_debug_until' => null
        ]);

        return response()->json([
            'message' => 'Debug access revoked successfully.'
        ]);
    }

    public function getPayments(Request $request)
    {
        $payments = \App\Models\PaymentReceipt::where('tenant_id', $request->user()->tenant_id)
            ->orderBy('created_at', 'desc')
            ->get();
            
        return response()->json($payments);
    }

    public function storePayment(Request $request)
    {
        $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'reference_number' => 'required|string|max:255',
            'receipt_slip' => 'required|image|mimes:jpeg,png|max:5120',
            'remarks' => 'nullable|string|max:1000'
        ]);

        $user = $request->user();
        
        if ($request->hasFile('receipt_slip')) {
            $path = $request->file('receipt_slip')->store('receipts', 'public');
            $receiptSlipPath = '/storage/' . $path;
        } else {
            return response()->json(['error' => 'Receipt slip file is required'], 400);
        }

        // Auto-renew license for 1 month upon payment receipt upload
        $tenant = $user->tenant;
        $previousExpiry = $tenant->license_expires_at; // could be null
        // Determine new expiry date
        if ($previousExpiry && $previousExpiry->gt(now())) {
            $newExpiry = (clone $previousExpiry)->addMonth();
        } else {
            $newExpiry = now()->addMonth();
        }
        // Update tenant's license expiry
        $tenant->license_expires_at = $newExpiry;
        $tenant->save();

        $payment = \App\Models\PaymentReceipt::create([
            'tenant_id' => $user->tenant_id,
            'amount' => $request->amount,
            'reference_number' => $request->reference_number,
            'receipt_slip_path' => $receiptSlipPath,
            'status' => 'pending',
            'remarks' => $request->remarks,
            // Store previous expiry for potential rollback on rejection
            'previous_license_expires_at' => $previousExpiry
        ]);

        return response()->json([
            'message' => 'Payment receipt uploaded successfully. Awaiting superadmin verification.',
            'payment' => $payment
        ]);
    }
}
