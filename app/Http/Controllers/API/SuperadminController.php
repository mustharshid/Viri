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
            'subscription_tier' => 'required|in:free,499,999,1999',
            'lock_timeout' => 'sometimes|integer|min:5|max:300',
            'max_terminals' => 'sometimes|integer|min:1',
        ]);

        $tenant = Tenant::findOrFail($id);
        $tenant->status = $request->status;
        $tenant->subscription_tier = $request->subscription_tier;
        if ($request->has('lock_timeout')) {
            $tenant->lock_timeout = $request->lock_timeout;
        }

        // Handle max terminals updating and dynamic baselines
        $maxTerminals = $request->has('max_terminals') ? $request->max_terminals : ($tenant->max_terminals ?? 1);
        if ($tenant->subscription_tier === 'free' || $tenant->subscription_tier === '499') {
            $maxTerminals = 1;
        } elseif ($tenant->subscription_tier === '999') {
            if ($maxTerminals < 1) {
                $maxTerminals = 1;
            }
        } elseif ($tenant->subscription_tier === '1999') {
            if ($maxTerminals < 2) {
                $maxTerminals = 2;
            }
        }
        $tenant->max_terminals = $maxTerminals;

        $tenant->save();

        // Also approve the primary user if it's active
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
}
