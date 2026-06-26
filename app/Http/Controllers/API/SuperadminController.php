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
        $companies = Tenant::with('terminals', 'bankAccounts')
            ->orderBy('created_at', 'desc')
            ->get();
        return response()->json($companies);
    }

    public function updateCompany(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:pending,active,suspended',
            'subscription_tier' => 'required|in:free,499,999,1999',
            'lock_timeout' => 'sometimes|integer|min:5|max:300',
        ]);

        $tenant = Tenant::findOrFail($id);
        $tenant->status = $request->status;
        $tenant->subscription_tier = $request->subscription_tier;
        if ($request->has('lock_timeout')) {
            $tenant->lock_timeout = $request->lock_timeout;
        }
        $tenant->save();

        // Also approve the primary user if it's active
        if ($request->status === 'active') {
            User::where('tenant_id', $tenant->id)->update(['status' => 'approved']);
        }

        return response()->json(['message' => 'Company updated successfully', 'company' => $tenant]);
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
}
