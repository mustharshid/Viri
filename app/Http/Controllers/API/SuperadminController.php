<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Tenant;
use App\Models\User;

class SuperadminController extends Controller
{
    public function __construct()
    {
        // Add middleware to check if user is superadmin
    }

    public function listCompanies()
    {
        $companies = Tenant::with('terminals', 'bankAccounts', 'users')
            ->orderBy('created_at', 'desc')
            ->get();
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
            'features' => 'sometimes|array',
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

        // Features updates
        $plan = \App\Models\SubscriptionPlan::where('tier_key', $request->subscription_tier)->first();
        if ($request->has('features')) {
            $tenant->features = $request->features;
        } elseif ($oldTier !== $request->subscription_tier && $plan) {
            // Tier changed and no custom features sent, auto-apply defaults from new tier
            $tenant->features = $plan->features;
            $tenant->max_terminals = $plan->max_terminals;
            $tenant->max_bank_accounts = $plan->max_bank_accounts;
            $tenant->lock_timeout = $plan->lock_timeout;
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
        $response['session_holders'] = \App\Models\BankAccount::whereNotNull('session_holder_terminal_id')->with('tenant')->get();
        
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
        if ($request->user()->role !== 'superadmin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }
        
        \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        
        return response()->json([
            'output' => \Illuminate\Support\Facades\Artisan::output()
        ]);
    }

    public function getSystemSettings(Request $request)
    {
        if ($request->user()->role !== 'superadmin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $settings = \Illuminate\Support\Facades\DB::table('system_settings')->get();
        return response()->json(['settings' => $settings]);
    }

    public function updateSystemSettings(Request $request)
    {
        if ($request->user()->role !== 'superadmin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $request->validate([
            'settings' => 'required|array',
            'settings.*.key' => 'required|string',
            'settings.*.value' => 'required|string'
        ]);

        foreach ($request->settings as $setting) {
            \Illuminate\Support\Facades\DB::table('system_settings')
                ->where('key', $setting['key'])
                ->update([
                    'value' => $setting['value'],
                    'updated_at' => now()
                ]);
        }

        return response()->json(['message' => 'System settings updated successfully']);
    }

    public function getPayments(Request $request)
    {
        if ($request->user()->role !== 'superadmin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $payments = \App\Models\PaymentReceipt::with('tenant')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($payments);
    }

    public function approvePayment(Request $request, $id)
    {
        if ($request->user()->role !== 'superadmin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

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
        if ($request->user()->role !== 'superadmin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

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
}
