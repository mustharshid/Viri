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

        if ($tier === 'free' || $tier === '499') {
            $permissions = [
                'verification_enabled' => true,
                'ledger_enabled' => false,
                'ledger_show_balance' => false,
                'ledger_show_debit' => false,
                'reports_enabled' => false,
                'show_vbtl' => false
            ];
        } else {
            $permissions = [
                'verification_enabled' => true,
                'ledger_enabled' => filter_var($permissions['ledger_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'ledger_show_balance' => filter_var($permissions['ledger_show_balance'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'ledger_show_debit' => filter_var($permissions['ledger_show_debit'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'reports_enabled' => filter_var($permissions['reports_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'show_vbtl' => false
            ];
        }

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
        $request->validate([
            'name' => 'required|string',
            'permissions' => 'nullable|array',
            'settings_pin' => 'nullable|string|max:6'
        ]);

        $tenant = $request->user()->tenant;
        $terminal = Terminal::where('tenant_id', $tenant->id)->findOrFail($id);

        $permissions = $request->input('permissions', []);
        $tier = $tenant->subscription_tier;

        if ($tier === 'free' || $tier === '499') {
            $permissions = [
                'verification_enabled' => true,
                'ledger_enabled' => false,
                'ledger_show_balance' => false,
                'ledger_show_debit' => false,
                'reports_enabled' => false
            ];
        } else {
            $permissions = [
                'verification_enabled' => true,
                'ledger_enabled' => filter_var($permissions['ledger_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'ledger_show_balance' => filter_var($permissions['ledger_show_balance'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'ledger_show_debit' => filter_var($permissions['ledger_show_debit'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'reports_enabled' => filter_var($permissions['reports_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN)
            ];
        }

        $terminal->update([
            'terminal_name' => $request->name,
            'settings_pin' => $request->settings_pin,
            'permissions' => $permissions
        ]);

        \App\Models\AuditLog::create([
            'tenant_id' => $tenant->id,
            'event_type' => 'terminal_updated',
            'actor' => $request->user()->name,
            'ip_address' => $request->ip(),
            'metadata' => ['terminal_id' => $terminal->id, 'terminal_name' => $terminal->terminal_name]
        ]);

        return response()->json(['terminal' => $terminal]);
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
        $limit = 2; // Free
        if ($tenant->subscription_tier === '499') $limit = 2;
        if ($tenant->subscription_tier === '999') $limit = 4;
        if ($tenant->subscription_tier === '1999') $limit = 20;

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
        ]);

        $user->phone_number = $request->phone_number;
        if ($request->filled('password')) {
            $user->password = Hash::make($request->password);
        }
        $user->save();

        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => $user->load('tenant')
        ]);
    }
}
