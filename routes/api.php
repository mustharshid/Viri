<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\API\AuthController;
use App\Http\Controllers\API\CompanyController;
use App\Http\Controllers\API\SuperadminController;
use App\Http\Controllers\API\TerminalPairingController;
use App\Http\Controllers\API\BankAccountLockController;

/*
|--------------------------------------------------------------------------
| Public Auth Routes
|--------------------------------------------------------------------------
*/
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/terminal/pair', [TerminalPairingController::class, 'pair']);

/*
|--------------------------------------------------------------------------
| Authenticated SaaS Routes
|--------------------------------------------------------------------------
*/
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Superadmin Routes
    // Note: In production, add a role middleware here
    Route::get('/admin/companies', [SuperadminController::class, 'listCompanies']);
    Route::put('/admin/companies/{id}', [SuperadminController::class, 'updateCompany']);
    Route::delete('/admin/companies/{id}', [SuperadminController::class, 'deleteCompany']);
    Route::put('/admin/terminals/{id}', [SuperadminController::class, 'updateTerminal']);
    Route::post('/admin/terminals/{id}/view-log', [SuperadminController::class, 'viewTerminalLog']);
    Route::post('/admin/users/{id}/reset-password', [SuperadminController::class, 'resetPassword']);
    
    // Subscription Plans CRUD
    Route::get('/admin/subscription-plans', [SuperadminController::class, 'listSubscriptionPlans']);
    Route::post('/admin/subscription-plans', [SuperadminController::class, 'createSubscriptionPlan']);
    Route::put('/admin/subscription-plans/{id}', [SuperadminController::class, 'updateSubscriptionPlan']);
    Route::delete('/admin/subscription-plans/{id}', [SuperadminController::class, 'deleteSubscriptionPlan']);

    // Admin DB Migration Runner
    Route::post('/admin/run-migrations', [SuperadminController::class, 'runMigrations']);

    Route::get('/company/terminals', [CompanyController::class, 'getTerminals']);
    Route::post('/company/terminals', [CompanyController::class, 'createTerminal']);
    Route::put('/company/terminals/{id}', [CompanyController::class, 'updateTerminal']);
    Route::delete('/company/terminals/{id}', [CompanyController::class, 'deleteTerminal']);
    Route::post('/company/terminals/{id}/enable-debug', [CompanyController::class, 'enableDebug']);
    Route::post('/company/terminals/{id}/regenerate-pairing-code', [CompanyController::class, 'regeneratePairingCode']);

    Route::get('/company/bank-accounts', [CompanyController::class, 'getBankAccounts']);
    Route::post('/company/bank-accounts', [CompanyController::class, 'createBankAccount']);
    Route::delete('/company/bank-accounts/{id}', [CompanyController::class, 'deleteBankAccount']);
    Route::post('/company/bank-accounts/{id}/reset-failures', [CompanyController::class, 'resetBankAccountFailures']);
    Route::put('/company/profile', [CompanyController::class, 'updateProfile']);
    
    Route::get('/company/audit-logs', [CompanyController::class, 'getAuditLogs']);

    // Session activity logs for Superadmin
    Route::get('/admin/session-logs', [SuperadminController::class, 'getSessionLogs']);
});

/*
|--------------------------------------------------------------------------
| Viri Cashier Terminal API (Requires hardware_id)
|--------------------------------------------------------------------------
|
*/

// Session Holder Management Routes
Route::post('/terminal/session/claim',      [\App\Http\Controllers\API\SessionController::class, 'claimSession']);
Route::post('/terminal/session/heartbeat',  [\App\Http\Controllers\API\SessionController::class, 'heartbeat']);
Route::post('/terminal/session/release',    [\App\Http\Controllers\API\SessionController::class, 'releaseSession']);
Route::post('/terminal/session/status',     [\App\Http\Controllers\API\SessionController::class, 'getStatus']);
Route::post('/terminal/session/request',    [\App\Http\Controllers\API\SessionController::class, 'submitRequest']);
Route::post('/terminal/session/pending',    [\App\Http\Controllers\API\SessionController::class, 'getPendingRequests']);
Route::post('/terminal/session/fulfill',    [\App\Http\Controllers\API\SessionController::class, 'fulfillRequest']);
Route::get('/terminal/session/result/{id}', [\App\Http\Controllers\API\SessionController::class, 'pollResult']);
Route::post('/terminal/session/log',        [\App\Http\Controllers\API\SessionController::class, 'logEvent']);


Route::post('/verify-terminal', function (Request $request) {
    $request->validate([
        'hardware_id' => 'required|string'
    ]);

    $terminal = \App\Models\Terminal::where('hardware_id', $request->hardware_id)
        ->with(['tenant.bankAccounts.sessionHolder'])
        ->first();

    if (!$terminal || $terminal->status !== 'active') {
        return response()->json(['error' => 'Terminal unauthorized or revoked'], 403);
    }

    $tenant = $terminal->tenant;

    if ($tenant->status !== 'active') {
        return response()->json(['error' => 'Company account pending approval or suspended'], 403);
    }

    $limits = [
        'free' => 20,
        '499' => 300,
        '999' => PHP_INT_MAX,
        '1999' => PHP_INT_MAX,
    ];
    $tier = $tenant->subscription_tier ?? 'free';
    $limit = $limits[$tier] ?? 20;

    $creditsExhausted = ($tenant->verifications_count >= $limit);

    $subscriptionExpired = false;
    if ($tenant->license_expires_at && \Carbon\Carbon::parse($tenant->license_expires_at)->isPast()) {
        $subscriptionExpired = true;
    }

    if (!$creditsExhausted && !$subscriptionExpired && $request->input('action') === 'verify') {
        // Increment count
        $tenant->increment('verifications_count');
    }

    return response()->json([
        'status' => 'authorized',
        'credits_exhausted' => $creditsExhausted,
        'subscription_expired' => $subscriptionExpired,
        'tenant' => [
            'name' => $tenant->name,
            'logo' => $tenant->company_logo,
            'tier' => $tier,
            'lock_timeout' => $tenant->lock_timeout ?? 20,
            'verifications_used' => $tenant->verifications_count,
            'extension_id' => env('VIRI_EXTENSION_ID', 'viri_default_extension_id'),
            'bank_accounts' => $tenant->bankAccounts->map(function($account) {
                return [
                    'id' => $account->id,
                    'bank_name' => $account->bank_name,
                    'account_name' => $account->account_name,
                    'account_number' => $account->account_number,
                    'mib_profile_type' => $account->mib_profile_type ?? '0',
                    'is_default' => $account->is_default,
                    'label' => $account->label,
                    'currency' => $account->currency,
                    'login_failures' => $account->login_failures,
                    'login_credentials_hash' => $account->login_credentials_hash,
                    'session_holder_terminal_id' => $account->session_holder_terminal_id,
                    'session_holder_name' => $account->sessionHolder?->terminal_name,
                    'session_claimed_at' => $account->session_claimed_at ? $account->session_claimed_at->toIso8601String() : null,
                    'session_last_heartbeat_at' => $account->session_last_heartbeat_at ? $account->session_last_heartbeat_at->toIso8601String() : null,
                ];
            })
        ],
        'terminal_name' => $terminal->terminal_name,
        'settings_pin' => $terminal->settings_pin,
        'terminal_pin' => $terminal->permissions['terminal_pin'] ?? null,
        'credentials' => $terminal->credentials,
        'should_upload_logs' => (isset($terminal->permissions['share_pwa_logs']) ? $terminal->permissions['share_pwa_logs'] : true) || ($terminal->allow_debug_until && now()->lessThan($terminal->allow_debug_until)),
        'permissions' => [
            'verification_enabled' => (bool) ($tenant->features['verification_enabled'] ?? true),
            'ledger_enabled' => (bool) ($tenant->features['ledger_enabled'] ?? (($tier === 'free' || $tier === '499') ? false : ($terminal->permissions['ledger_enabled'] ?? true))),
            'ledger_show_balance' => (bool) ($tenant->features['ledger_show_balance'] ?? (($tier === 'free' || $tier === '499') ? false : ($terminal->permissions['ledger_show_balance'] ?? true))),
            'ledger_show_debit' => (bool) ($tenant->features['ledger_show_debit'] ?? (($tier === 'free' || $tier === '499') ? false : ($terminal->permissions['ledger_show_debit'] ?? true))),
            'reports_enabled' => (bool) ($tenant->features['reports_enabled'] ?? (($tier === 'free' || $tier === '499') ? false : ($terminal->permissions['reports_enabled'] ?? false))),
            'share_pwa_logs' => (bool) ($terminal->permissions['share_pwa_logs'] ?? true),
            'show_vbtl' => (bool) ($terminal->permissions['show_vbtl'] ?? false)
        ]
    ]);
});

Route::post('/terminal/lock-account', [BankAccountLockController::class, 'lockAccount']);
Route::post('/terminal/heartbeat', [BankAccountLockController::class, 'heartbeat']);
Route::post('/terminal/unlock-account', [BankAccountLockController::class, 'unlockAccount']);
Route::post('/terminal/status/log', [TerminalPairingController::class, 'logStatus']);
Route::post('/terminal/logs', [TerminalPairingController::class, 'uploadLogs']);
Route::post('/terminal/credentials', [TerminalPairingController::class, 'saveCredentials']);
Route::post('/terminal/bank-accounts/increment-failures', [BankAccountLockController::class, 'incrementFailures']);
Route::post('/terminal/bank-accounts/reset-failures', [BankAccountLockController::class, 'resetFailures']);
Route::post('/terminal/bank-accounts/map-credentials', [BankAccountLockController::class, 'mapCredentials']);

Route::post('/terminal/update-pin', function (Request $request) {
    $request->validate([
        'hardware_id' => 'required|string',
        'terminal_pin' => 'nullable|string|max:4'
    ]);
    $terminal = \App\Models\Terminal::where('hardware_id', $request->hardware_id)->first();
    if ($terminal) {
        $permissions = $terminal->permissions;
        $permissions['terminal_pin'] = $request->terminal_pin ? (string)$request->terminal_pin : null;
        $terminal->permissions = $permissions;
        $terminal->save();
        return response()->json(['status' => 'success']);
    }
    return response()->json(['error' => 'Terminal not found'], 404);
});
