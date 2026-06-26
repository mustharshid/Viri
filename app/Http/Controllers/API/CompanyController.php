<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Terminal;
use App\Models\BankAccount;

class CompanyController extends Controller
{
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
            'permissions' => 'nullable|array'
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

        $terminal = Terminal::create([
            'tenant_id' => $tenantId,
            'terminal_name' => $request->name,
            'hardware_id' => $hardwareId,
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(10),
            'status' => 'active',
            'permissions' => $permissions
        ]);

        return response()->json(['terminal' => $terminal]);
    }

    public function updateTerminal(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string',
            'permissions' => 'nullable|array'
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
            'permissions' => $permissions
        ]);

        return response()->json(['terminal' => $terminal]);
    }

    public function deleteTerminal(Request $request, $id)
    {
        $terminal = Terminal::where('tenant_id', $request->user()->tenant_id)->findOrFail($id);
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
        ]);

        $account = BankAccount::create([
            'tenant_id' => $tenantId,
            'bank_name' => $request->bank_name,
            'account_name' => $request->account_name,
            'account_number' => $request->account_number,
            'mib_profile_type' => $request->mib_profile_type ?? '0',
            'label' => $request->label,
        ]);

        return response()->json(['account' => $account]);
    }

    public function deleteBankAccount(Request $request, $id)
    {
        $account = BankAccount::where('tenant_id', $request->user()->tenant_id)->findOrFail($id);
        $account->delete();
        return response()->json(['message' => 'Bank account deleted']);
    }
}
