<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Tenant;
use App\Models\User;
use App\Models\BmlCredentialGroup;
use App\Models\MibCredentialGroup;
use App\Models\BankAccount;
use App\Models\Terminal;
use Illuminate\Support\Facades\Http;

class SuperadminController extends Controller
{
    public function listCompanies(Request $request)
    {
        $perPage = min((int) $request->input('per_page', 10), 200);
        $companies = Tenant::with('terminals', 'bankAccounts', 'users')
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);
        return response()->json($companies);
    }

    public function updateCompany(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:pending,active,suspended,archived',
            'subscription_tier' => 'required|string',
            'lock_timeout' => 'sometimes|integer|min:5|max:300',
            'max_terminals' => 'sometimes|integer|min:1',
            'max_bank_accounts' => 'sometimes|integer|min:1',
            'license_expires_at' => 'sometimes|nullable|date',
            'features' => 'sometimes|nullable|array',
            'custom_verifications_limit' => 'sometimes|nullable|integer|min:0',
        ]);

        $tenant = Tenant::findOrFail($id);
        
        $oldTier = $tenant->subscription_tier;
        $tenant->status = $request->status;
        $tenant->subscription_tier = $request->subscription_tier;
        
        if ($request->has('lock_timeout')) {
            $tenant->lock_timeout = $request->lock_timeout;
        }
        if ($request->has('license_expires_at')) {
            $tenant->license_expires_at = $request->license_expires_at;
        }
        if ($request->has('max_terminals')) {
            $tenant->max_terminals = $request->max_terminals;
        }
        if ($request->has('max_bank_accounts')) {
            $tenant->max_bank_accounts = $request->max_bank_accounts;
        }
        if ($request->has('custom_verifications_limit')) {
            $tenant->custom_verifications_limit = $request->custom_verifications_limit;
        }

        // Features updates
        $plan = \App\Models\SubscriptionPlan::where('tier_key', $request->subscription_tier)->first();
        if ($request->filled('features') && is_array($request->features)) {
            $tenant->features = $request->features;
        } else {
            // If features is missing or empty, or tier changed, apply plan defaults if tenant has no features
            if (($oldTier !== $request->subscription_tier || empty($tenant->features)) && $plan) {
                $tenant->features = $plan->features ?? [];
                if (!$request->has('max_terminals')) $tenant->max_terminals = $plan->max_terminals;
                if (!$request->has('max_bank_accounts')) $tenant->max_bank_accounts = $plan->max_bank_accounts;
                if (!$request->has('lock_timeout')) $tenant->lock_timeout = $plan->lock_timeout;
            }
        }

        $tenant->save();

        if ($request->status === 'active') {
            User::where('tenant_id', $tenant->id)->update(['status' => 'approved']);
        }

        return response()->json(['message' => 'Company updated successfully', 'company' => $tenant->load('users')]);
    }

    public function viewTerminalLog(Request $request, $id)
    {
        $request->validate([
            'one_time_code' => 'required|string'
        ]);

        $terminal = \App\Models\Terminal::findOrFail($id);

        if (!$terminal->allow_debug_until || now()->greaterThan($terminal->allow_debug_until)) {
            return response()->json(['error' => 'Debug access is not enabled or has expired for this terminal.'], 403);
        }

        if (!$terminal->debug_one_time_code || $terminal->debug_one_time_code !== strtoupper($request->one_time_code)) {
            return response()->json(['error' => 'Invalid debug one-time code.'], 403);
        }

        $logs = json_decode($terminal->debug_logs, true) ?? [];

        // Clear the one-time code immediately upon first successful view
        $terminal->update([
            'debug_one_time_code' => null,
            'allow_debug_until' => null
        ]);

        return response()->json([
            'terminal_name' => $terminal->terminal_name,
            'logs' => $logs
        ]);
    }

    public function updateTerminal(Request $request, $id)
    {
        $request->validate([
            'show_vbtl' => 'required|boolean'
        ]);

        $terminal = \App\Models\Terminal::findOrFail($id);
        $permissions = $terminal->permissions;
        $permissions['show_vbtl'] = (bool) $request->show_vbtl;
        $terminal->permissions = $permissions;
        $terminal->save();

        return response()->json(['message' => 'Terminal updated successfully', 'terminal' => $terminal]);
    }

    public function getSessionLogs(Request $request)
    {
        // Query builder on SessionActivityLog
        $query = \App\Models\SessionActivityLog::with(['tenant', 'terminal', 'bankAccount'])
            ->orderBy('created_at', 'desc');

        if ($request->filled('tenant_id')) {
            $query->where('tenant_id', $request->tenant_id);
        }
        if ($request->filled('terminal_id')) {
            $query->where('terminal_id', $request->terminal_id);
        }
        if ($request->filled('bank_account_id')) {
            $query->where('bank_account_id', $request->bank_account_id);
        }
        if ($request->filled('event_type')) {
            $query->where('event_type', $request->event_type);
        }
        if ($request->filled('start_date')) {
            $query->where('created_at', '>=', $request->start_date);
        }
        if ($request->filled('end_date')) {
            $query->where('created_at', '<=', $request->end_date);
        }

        $logs = $query->paginate($request->input('per_page', 50));
        
        $response = $logs->toArray();
        $response['active_terminals'] = \App\Models\Terminal::where('status', 'active')->count();

        return response()->json($response);
    }

    public function deleteCompany($id)
    {
        $tenant = Tenant::findOrFail($id);
        if ($tenant->status !== 'archived') {
            return response()->json(['error' => 'Only archived companies can be deleted.'], 400);
        }

        // Cascade delete relations
        $tenant->terminals()->delete();
        $tenant->bankAccounts()->delete();
        $tenant->users()->delete();
        $tenant->invoices()->delete();
        $tenant->auditLogs()->delete();
        
        \App\Models\SessionActivityLog::where('tenant_id', $tenant->id)->delete();
        \App\Models\SessionFetchRequest::whereHas('bankAccount', function($q) use ($tenant) {
            $q->where('tenant_id', $tenant->id);
        })->delete();

        $tenant->delete();

        return response()->json(['message' => 'Company and all associated data deleted successfully']);
    }

    public function resetPassword(Request $request, $id)
    {
        $request->validate([
            'password' => 'required|string|min:8',
        ]);

        $user = User::findOrFail($id);
        $user->password = \Illuminate\Support\Facades\Hash::make($request->password);
        $user->save();

        return response()->json(['message' => 'Password reset successfully']);
    }

    public function listSubscriptionPlans()
    {
        $plans = \App\Models\SubscriptionPlan::orderBy('price', 'asc')->get();
        return response()->json($plans);
    }

    public function createSubscriptionPlan(Request $request)
    {
        $request->validate([
            'tier_key' => 'required|string|unique:subscription_plans,tier_key',
            'name' => 'required|string',
            'price' => 'required|numeric|min:0',
            'max_terminals' => 'required|integer|min:1',
            'max_bank_accounts' => 'required|integer|min:1',
            'lock_timeout' => 'required|integer|min:5|max:300',
            'features' => 'required|array'
        ]);

        $plan = \App\Models\SubscriptionPlan::create($request->all());
        return response()->json(['message' => 'Subscription plan created successfully', 'plan' => $plan]);
    }

    public function updateSubscriptionPlan(Request $request, $id)
    {
        $request->validate([
            'tier_key' => 'required|string|unique:subscription_plans,tier_key,' . $id,
            'name' => 'required|string',
            'price' => 'required|numeric|min:0',
            'max_terminals' => 'required|integer|min:1',
            'max_bank_accounts' => 'required|integer|min:1',
            'lock_timeout' => 'required|integer|min:5|max:300',
            'features' => 'required|array'
        ]);

        $plan = \App\Models\SubscriptionPlan::findOrFail($id);
        $plan->update($request->all());
        return response()->json(['message' => 'Subscription plan updated successfully', 'plan' => $plan]);
    }

    public function deleteSubscriptionPlan($id)
    {
        $plan = \App\Models\SubscriptionPlan::findOrFail($id);
        $plan->delete();
        return response()->json(['message' => 'Subscription plan deleted successfully']);
    }

    public function runMigrations(Request $request)
    {
        \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        $migrateOutput = \Illuminate\Support\Facades\Artisan::output();

        \Illuminate\Support\Facades\Artisan::call('optimize:clear');
        $optimizeOutput = \Illuminate\Support\Facades\Artisan::output();

        return response()->json([
            'output' => "=== Migrations Output ===\n" . $migrateOutput . "\n=== Cache Clear Output ===\n" . $optimizeOutput
        ]);
    }

    public function getSystemSettings(Request $request)
    {
        $settings = \Illuminate\Support\Facades\DB::table('system_settings')->get();
        
        $serverInfo = [
            'php_version' => phpversion(),
            'laravel_version' => app()->version(),
            'mysql_version' => \Illuminate\Support\Facades\DB::select('select version() as version')[0]->version ?? 'Unknown',
            'server_os' => php_uname('s') . ' ' . php_uname('r'),
            'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
            'ini' => [
                'memory_limit' => ini_get('memory_limit') ?: '512M',
                'max_execution_time' => ini_get('max_execution_time') ?: '30 (Default)',
                'max_input_time' => ini_get('max_input_time') ?: '60 (Default)',
                'post_max_size' => ini_get('post_max_size') ?: '8M (Default)',
                'upload_max_filesize' => ini_get('upload_max_filesize') ?: '2M (Default)',
                'opcache_enable' => ini_get('opcache.enable') ? 'on' : 'off',
                'disable_functions' => ini_get('disable_functions') ?: 'opcache_get_status'
            ],
            'fpm' => [
                'pm_max_children' => 10,
                'pm_max_requests' => 0,
                'pm' => 'ondemand',
                'pm_start_servers' => 1,
                'pm_min_spare_servers' => 1,
                'pm_max_spare_servers' => 1
            ]
        ];

        return response()->json([
            'settings' => $settings,
            'server_info' => $serverInfo,
        ]);
    }

    public function updateSystemSettings(Request $request)
    {
        $request->validate([
            'settings' => 'required|array',
            'settings.*.key' => 'required|string',
            'settings.*.value' => 'required|string'
        ]);

        foreach ($request->settings as $setting) {
            $key = $setting['key'];
            $val = (int) $setting['value'];

            if ($key === 'poll_interval_holder' && $val < 1) {
                return response()->json(['error' => 'Holder interval must be at least 1 second'], 422);
            }
            if ($key === 'poll_interval_requesting' && $val < 1) {
                return response()->json(['error' => 'Requesting interval must be at least 1 second'], 422);
            }
            if ($key === 'poll_interval_idle' && $val < 5) {
                return response()->json(['error' => 'Idle interval must be at least 5 seconds'], 422);
            }

            \Illuminate\Support\Facades\DB::table('system_settings')
                ->updateOrInsert(
                    ['key' => $key],
                    [
                        'value' => $setting['value'],
                        'updated_at' => now(),
                    ]
                );
        }

        \Illuminate\Support\Facades\Cache::forget('viri_system_settings');

        return response()->json(['message' => 'System settings updated successfully']);
    }

    public function getPayments(Request $request)
    {
        $perPage = min((int) $request->input('per_page', 50), 200);
        $payments = \App\Models\PaymentReceipt::with('tenant')
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);

        return response()->json($payments);
    }

    public function approvePayment(Request $request, $id)
    {
        $request->validate([
            'subscription_tier' => 'required|string',
            'license_expires_at' => 'required|date',
            'remarks' => 'nullable|string'
        ]);

        $payment = \App\Models\PaymentReceipt::findOrFail($id);
        
        $payment->update([
            'status' => 'approved',
            'remarks' => $request->remarks ?: $payment->remarks
        ]);

        $tenant = $payment->tenant;
        $tenant->update([
            'subscription_tier' => $request->subscription_tier,
            'license_expires_at' => \Carbon\Carbon::parse($request->license_expires_at),
            'verifications_count' => 0
        ]);

        \App\Models\SessionActivityLog::create([
            'tenant_id' => $tenant->id,
            'event_type' => 'billing_payment_approved',
            'event_summary' => "Payment reference {$payment->reference_number} approved. Extended license to " . $tenant->license_expires_at->toDateString(),
            'event_detail' => [
                'payment_id' => $payment->id,
                'amount' => $payment->amount,
                'reference_number' => $payment->reference_number,
                'new_tier' => $tenant->subscription_tier,
                'new_expiry' => $tenant->license_expires_at->toIso8601String()
            ],
            'created_at' => now()
        ]);

        return response()->json([
            'message' => 'Payment approved successfully. Subscription plan updated.'
        ]);
    }

    public function rejectPayment(Request $request, $id)
    {
        $request->validate([
            'remarks' => 'required|string|max:1000'
        ]);

        $payment = \App\Models\PaymentReceipt::findOrFail($id);
        $tenant = $payment->tenant;
        $previousExpiry = $payment->previous_license_expires_at;

        $payment->update([
            'status' => 'rejected',
            'remarks' => $request->remarks
        ]);

        // Revert license expiry if previous expiry exists
        if ($previousExpiry) {
            $tenant->license_expires_at = $previousExpiry;
            $tenant->save();
        }

        return response()->json([
            'message' => 'Payment rejected and license expiry reverted if applicable.'
        ]);
    }

    public function clearStuckLock(Request $request, $id)
    {
        $bankAccount = \App\Models\BankAccount::findOrFail($id);
        
        // Clear bank account lock table record
        \App\Models\BankAccountLock::where('bank_account_id', $id)->delete();
        
        // Also clear fetch-in-progress indicators
        $bankAccount->update([
            'fetch_in_progress_until' => null,
            'fetch_started_at' => null,
            'fetch_started_by_terminal_id' => null,
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Stuck fetch lock cleared successfully'
        ]);
    }

    public function getDebugInfo()
    {
        $mibKeys = \App\Models\MibCredentialGroup::with(['terminal', 'profiles.bankAccounts'])->get()->map(function ($group) {
            $accounts = [];
            foreach ($group->profiles as $profile) {
                foreach ($profile->bankAccounts as $acc) {
                    $accounts[] = "{$acc->bank_name} {$acc->account_number} ({$profile->profile_name})";
                }
            }
            return [
                'id' => $group->id,
                'terminal_id' => $group->terminal_id,
                'terminal_name' => $group->terminal->terminal_name ?? null,
                'bank_account_id' => null,
                'account_name' => count($accounts) > 0 ? implode(', ', $accounts) : 'None linked',
                'mib_username' => $group->mib_username,
                'key1_prefix' => substr($group->key1 ?? '', 0, 8) . '...',
                'key2_prefix' => substr($group->key2 ?? '', 0, 8) . '...',
                'app_id' => $group->app_id,
                'obtained_at' => $group->obtained_at ? $group->obtained_at->toIso8601String() : null,
            ];
        });

        $bmlTokens = \App\Models\BmlCredentialGroup::with(['terminal', 'bankAccounts'])->get()->map(function ($group) {
            $accounts = [];
            foreach ($group->bankAccounts as $acc) {
                $accounts[] = "{$acc->bank_name} {$acc->account_number}";
            }
            return [
                'id' => $group->id,
                'terminal_id' => $group->terminal_id,
                'terminal_name' => $group->terminal->terminal_name ?? null,
                'bank_account_id' => null,
                'account_name' => count($accounts) > 0 ? implode(', ', $accounts) : 'None linked',
                'bml_username' => $group->bml_username,
                'device_id' => $group->device_id,
                'token_type' => $group->token_type,
                'last_grant' => $group->last_grant,
                'obtained_at' => $group->obtained_at ? $group->obtained_at->toIso8601String() : null,
                'expires_at' => $group->expires_at ? $group->expires_at->toIso8601String() : null,
                'has_access_token' => !empty($group->access_token),
                'has_refresh_token' => !empty($group->refresh_token),
            ];
        });

        return response()->json([
            'mib_keys' => $mibKeys,
            'bml_tokens' => $bmlTokens,
            'total_mib_keys' => count($mibKeys),
            'total_bml_tokens' => count($bmlTokens),
        ]);
    }

    // =========================================================================
    // CREDENTIAL INSPECTOR (for superadmin debugging)
    // =========================================================================

    public function getCredentials()
    {
        $bmlGroups = BmlCredentialGroup::with(['terminal', 'bankAccounts', 'tenant'])->get()->map(function ($g) {
            $isExpired = $g->expires_at && $g->expires_at->isPast();
            return [
                'id'              => $g->id,
                'tenant_name'     => $g->tenant?->name,
                'terminal_name'   => $g->terminal?->terminal_name,
                'bml_username'    => $g->bml_username,
                'profile_type'    => $g->profile_type,
                'device_id'       => $g->device_id,
                'access_token'    => $g->access_token,
                'refresh_token'   => $g->refresh_token,
                'has_access_token'  => !empty($g->access_token),
                'has_refresh_token' => !empty($g->refresh_token),
                'token_type'      => $g->token_type,
                'last_grant'      => $g->last_grant,
                'expires_in'      => $g->expires_in,
                'expires_at'      => $g->expires_at?->toIso8601String(),
                'expired'         => $isExpired,
                'obtained_at'     => $g->obtained_at?->toIso8601String(),
                'linked_accounts' => $g->bankAccounts->map(fn ($a) => [
                    'id'             => $a->id,
                    'account_number' => $a->account_number,
                    'account_name'   => $a->account_name,
                    'bank_name'      => $a->bank_name,
                ]),
            ];
        });

        $mibGroups = MibCredentialGroup::with(['terminal', 'profiles.bankAccounts', 'tenant'])->get()->map(function ($g) {
            return [
                'id'            => $g->id,
                'tenant_name'   => $g->tenant?->name,
                'terminal_name' => $g->terminal?->terminal_name,
                'mib_username'  => $g->mib_username,
                'app_id'        => $g->app_id,
                'key1'          => $g->key1,
                'key2'          => $g->key2,
                'has_key1'      => !empty($g->key1),
                'has_key2'      => !empty($g->key2),
                'obtained_at'   => $g->obtained_at?->toIso8601String(),
                'profiles'      => $g->profiles->map(fn ($p) => [
                    'profile_id'   => $p->profile_id,
                    'profile_type' => $p->profile_type,
                    'profile_name' => $p->profile_name,
                    'linked_accounts' => $p->bankAccounts->map(fn ($a) => [
                        'id'             => $a->id,
                        'account_number' => $a->account_number,
                        'account_name'   => $a->account_name,
                    ]),
                ]),
            ];
        });

        return response()->json([
            'bml_groups' => $bmlGroups,
            'mib_groups' => $mibGroups,
            'total_bml'  => $bmlGroups->count(),
            'total_mib'  => $mibGroups->count(),
        ]);
    }

    public function testBmlCredentials(Request $request, $id)
    {
        $group = BmlCredentialGroup::with('tenant', 'bankAccounts')->find($id);
        if (!$group) {
            return response()->json(['error' => 'Credential group not found'], 404);
        }

        if (empty($group->access_token)) {
            return response()->json([
                'valid'  => false,
                'error'  => 'No access token stored.',
                'status' => 'no_token',
            ]);
        }

        $results = [];

        // Attempt to call BML dashboard API with the stored token
        try {
            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . $group->access_token,
                'Accept'        => 'application/json',
            ])->timeout(15)->get('https://www.bankofmaldives.com.mv/internetbanking/api/dashboard');

            $results['dashboard_api'] = [
                'status_code' => $response->status(),
                'success'     => $response->successful(),
                'body'        => $response->successful()
                    ? '(dashboard data received — token is active)'
                    : ($response->body() ?: '(empty response)'),
            ];
        } catch (\Exception $e) {
            $results['dashboard_api'] = [
                'success'     => false,
                'error'       => $e->getMessage(),
            ];
        }

        $tokenExpired = $group->expires_at && $group->expires_at->isPast();
        $allSuccessful = collect($results)->every(fn ($r) => ($r['success'] ?? false) === true);

        return response()->json([
            'valid'          => $allSuccessful && !$tokenExpired,
            'token_expired'  => $tokenExpired,
            'bml_username'   => $group->bml_username,
            'device_id'      => $group->device_id,
            'expires_at'     => $group->expires_at?->toIso8601String(),
            'results'        => $results,
        ]);
    }

    public function testMibCredentials(Request $request, $id)
    {
        $group = MibCredentialGroup::with('tenant', 'profiles.bankAccounts')->find($id);
        if (!$group) {
            return response()->json(['error' => 'Credential group not found'], 404);
        }

        $results = [];

        // Attempt to reach MIB's API with stored credentials
        try {
            $response = Http::withHeaders([
                'Accept' => 'application/json',
            ])->timeout(15)->get('https://faisanet.mib.com.mv/accounts');

            $results['mib_api_reachability'] = [
                'status_code' => $response->status(),
                'success'     => $response->successful(),
                'note'        => $response->successful()
                    ? 'MIB server is reachable. Full key validation requires the Chrome Extension (DH crypto).'
                    : 'MIB server returned status ' . $response->status(),
            ];
        } catch (\Exception $e) {
            $results['mib_api_reachability'] = [
                'success' => false,
                'error'   => $e->getMessage(),
            ];
        }

        return response()->json([
            'valid'       => false,
            'mib_username' => $group->mib_username,
            'app_id'      => $group->app_id,
            'has_key1'    => !empty($group->key1),
            'has_key2'    => !empty($group->key2),
            'note'        => 'MIB uses Diffie-Hellman device keys. Full validation requires the Chrome Extension to perform the DH key exchange. Server-side check confirms reachability only.',
            'results'     => $results,
        ]);
    }
}
