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

        $terminal = Terminal::create([
            'tenant_id' => $tenantId,
            'terminal_name' => $request->name,
            'hardware_id' => $hardwareId,
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(10),
            'status' => 'active'
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
        ]);

        $account = BankAccount::create([
            'tenant_id' => $tenantId,
            'bank_name' => $request->bank_name,
            'account_name' => $request->account_name,
            'account_number' => $request->account_number,
            'mib_profile_type' => $request->mib_profile_type ?? '0',
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
