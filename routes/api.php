<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// Public endpoint for extension to verify terminal license
Route::post('/verify-terminal', function (Request $request) {
    $request->validate([
        'hardware_id' => 'required|string',
    ]);

    $terminal = \App\Models\Terminal::where('hardware_id', $request->hardware_id)
        ->with(['tenant.bankAccounts'])
        ->first();

    if (!$terminal || $terminal->status !== 'active') {
        return response()->json(['error' => 'Terminal unauthorized or revoked'], 403);
    }

    if ($terminal->tenant->status !== 'active' || 
       ($terminal->tenant->license_expires_at && $terminal->tenant->license_expires_at->isPast())) {
        return response()->json(['error' => 'Tenant subscription suspended or expired'], 403);
    }

    return response()->json([
        'status' => 'authorized',
        'tenant' => [
            'name' => $terminal->tenant->name,
            'logo' => $terminal->tenant->company_logo,
            'bank_accounts' => $terminal->tenant->bankAccounts,
        ]
    ]);
});

// Protected Super-Admin Routes
// Requires a secure admin token (Middleware to be implemented)
Route::middleware('auth.admin')->prefix('admin')->group(function () {
    
    // Tenant Management
    Route::get('/tenants', function () {
        return \App\Models\Tenant::withCount('terminals')->get();
    });
    
    Route::post('/tenants', function (Request $request) {
        // Logic to create new tenant
    });

    Route::post('/tenants/{id}/suspend', function ($id) {
        $tenant = \App\Models\Tenant::findOrFail($id);
        $tenant->update(['status' => 'suspended']);
        
        \App\Models\AuditLog::create([
            'tenant_id' => $tenant->id,
            'event_type' => 'SUBSCRIPTION_SUSPENDED',
            'actor' => 'system_admin',
            'ip_address' => request()->ip(),
            'metadata' => ['reason' => 'Manual suspension via admin panel']
        ]);
        
        return response()->json(['status' => 'success']);
    });

    // Audit Logs
    Route::get('/audit-logs', function () {
        return \App\Models\AuditLog::with('tenant')->orderBy('created_at', 'desc')->paginate(50);
    });
});
