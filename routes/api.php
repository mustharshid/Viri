<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;

use App\Http\Controllers\API\AuthController;
use App\Http\Controllers\API\CompanyController;
use App\Http\Controllers\API\CredentialSyncController;
use App\Http\Controllers\API\SuperadminController;
use App\Http\Controllers\API\TerminalPairingController;
use App\Http\Controllers\API\BankAccountLockController;
use App\Http\Controllers\API\BmlOAuthController;


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

    // Superadmin Routes (role-gated)
    Route::middleware('auth.admin')->prefix('admin')->group(function () {
        Route::get('/companies', [SuperadminController::class, 'listCompanies']);
        Route::put('/companies/{id}', [SuperadminController::class, 'updateCompany']);
        Route::delete('/companies/{id}', [SuperadminController::class, 'deleteCompany']);
        Route::put('/terminals/{id}', [SuperadminController::class, 'updateTerminal']);
        Route::post('/terminals/{id}/view-log', [SuperadminController::class, 'viewTerminalLog']);
        Route::post('/users/{id}/reset-password', [SuperadminController::class, 'resetPassword']);
        Route::get('/subscription-plans', [SuperadminController::class, 'listSubscriptionPlans']);
        Route::post('/subscription-plans', [SuperadminController::class, 'createSubscriptionPlan']);
        Route::put('/subscription-plans/{id}', [SuperadminController::class, 'updateSubscriptionPlan']);
        Route::delete('/subscription-plans/{id}', [SuperadminController::class, 'deleteSubscriptionPlan']);
        Route::post('/run-migrations', [SuperadminController::class, 'runMigrations']);
        Route::get('/session-logs', [SuperadminController::class, 'getSessionLogs']);
        Route::get('/system-settings', [SuperadminController::class, 'getSystemSettings']);
        Route::post('/system-settings', [SuperadminController::class, 'updateSystemSettings']);
        Route::get('/payments', [SuperadminController::class, 'getPayments']);
        Route::post('/payments/{id}/approve', [SuperadminController::class, 'approvePayment']);
        Route::post('/payments/{id}/reject', [SuperadminController::class, 'rejectPayment']);
        Route::post('/bank-accounts/{id}/clear-lock', [SuperadminController::class, 'clearStuckLock']);
        Route::get('/debug-info', [SuperadminController::class, 'getDebugInfo']);
    });

    // Company Routes
    Route::get('/company/terminals', [CompanyController::class, 'getTerminals']);
    Route::post('/company/terminals', [CompanyController::class, 'createTerminal']);
    Route::put('/company/terminals/{id}', [CompanyController::class, 'updateTerminal']);
    Route::delete('/company/terminals/{id}', [CompanyController::class, 'deleteTerminal']);
    Route::post('/company/terminals/{id}/enable-debug', [CompanyController::class, 'enableDebug']);
    Route::post('/company/terminals/{id}/disable-debug', [CompanyController::class, 'disableDebug']);
    Route::post('/company/terminals/{id}/regenerate-pairing-code', [CompanyController::class, 'regeneratePairingCode']);

    Route::get('/company/bank-accounts', [CompanyController::class, 'getBankAccounts']);
    Route::post('/company/bank-accounts', [CompanyController::class, 'createBankAccount']);
    Route::put('/company/bank-accounts/{id}', [CompanyController::class, 'updateBankAccount']);
    Route::delete('/company/bank-accounts/{id}', [CompanyController::class, 'deleteBankAccount']);
    Route::post('/company/bank-accounts/{id}/reset-failures', [CompanyController::class, 'resetBankAccountFailures']);
    Route::get('/company/bank-accounts/sibling-check', [\App\Http\Controllers\API\MibKeysController::class, 'getSiblingCheck']);
    Route::get('/company/bank-accounts/credential-siblings', [\App\Http\Controllers\API\MibKeysController::class, 'getCredentialSiblings']);
    Route::put('/company/profile', [CompanyController::class, 'updateProfile']);
    Route::get('/company/payments', [CompanyController::class, 'getPayments']);
    Route::post('/company/payments', [CompanyController::class, 'storePayment']);
    
    Route::get('/company/audit-logs', [CompanyController::class, 'getAuditLogs']);

    // Credential Sync (Company Dashboard)
    Route::post('/company/credential-sync/initiate',            [CredentialSyncController::class, 'initiate']);
    Route::get('/company/credential-sync/{id}/status',          [CredentialSyncController::class, 'status']);
    Route::post('/company/credential-sync/{id}/trigger-import', [CredentialSyncController::class, 'triggerImport']);
    Route::delete('/company/credential-sync/{id}',              [CredentialSyncController::class, 'cancel']);
});

/*
|--------------------------------------------------------------------------
| Viri Cashier Terminal API (Requires hardware_id)
|--------------------------------------------------------------------------
|
*/

// Real-Time Signaling Endpoints (non-cache)
Route::post('/terminal/session/acknowledge', function (\Illuminate\Http\Request $request) {
    $request->validate([
        'hardware_id' => 'required|string',
        'request_id'  => 'required|integer',
    ]);
    $terminal = \App\Models\Terminal::where('hardware_id', $request->hardware_id)
        ->where('status', 'active')->first();
    if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);
    $fetchReq = \App\Models\SessionFetchRequest::find($request->request_id);
    if (!$fetchReq) return response()->json(['error' => 'Request not found'], 404);
    $account = $fetchReq->bankAccount;
    if (!$account || $account->session_holder_terminal_id !== $terminal->id)
        return response()->json(['error' => 'Not the session holder for this account'], 403);
    $fetchReq->update(['status' => 'syncing']);
    return response()->json(['status' => 'ok']);
});

// Session Request & Fulfillment Routes (used by extension-based verification)
Route::post('/terminal/session/request',    [\App\Http\Controllers\API\SessionController::class, 'submitRequest']);
Route::post('/terminal/session/pending',    [\App\Http\Controllers\API\SessionController::class, 'getPendingRequests']);
Route::post('/terminal/session/fulfill',    [\App\Http\Controllers\API\SessionController::class, 'fulfillRequest']);
Route::get('/terminal/session/result/{id}', [\App\Http\Controllers\API\SessionController::class, 'pollResult']);
Route::post('/terminal/session/log',        [\App\Http\Controllers\API\SessionController::class, 'logEvent']);
Route::post('/terminal/session/activity',   [\App\Http\Controllers\API\SessionController::class, 'recordActivity']);
Route::post('/terminal/session/bml-auth',   [\App\Http\Controllers\API\SessionController::class, 'updateBmlAuth']);
Route::post('/terminal/account/fingerprint-check', [\App\Http\Controllers\API\SessionController::class, 'checkFingerprint']);


// BML OAuth Routes (Terminal API)
Route::post('/bml/oauth/store', [BmlOAuthController::class, 'store']);
Route::get('/bml/oauth/tokens', [BmlOAuthController::class, 'getTokens']);
Route::post('/bml/oauth/update', [BmlOAuthController::class, 'updateTokens']);

// MIB Device Credentials (Keys) Endpoints
Route::post('/mib/keys/store', [\App\Http\Controllers\API\MibKeysController::class, 'store']);
Route::get('/mib/keys', [\App\Http\Controllers\API\MibKeysController::class, 'getKeys']);
Route::get('/terminal/bank-accounts/sibling-check', [\App\Http\Controllers\API\MibKeysController::class, 'getSiblingCheck']);
Route::get('/terminal/bank-accounts/credential-siblings', [\App\Http\Controllers\API\MibKeysController::class, 'getCredentialSiblings']);


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
    $limit = $tenant->custom_verifications_limit ?? ($limits[$tier] ?? 20);

    $creditsExhausted = ($tenant->verifications_count >= $limit);

    $subscriptionExpired = false;
    if ($tenant->license_expires_at && \Carbon\Carbon::parse($tenant->license_expires_at)->isPast()) {
        $subscriptionExpired = true;
    }

    if (!$creditsExhausted && !$subscriptionExpired && $request->input('action') === 'verify') {
        // Increment count
        $tenant->increment('verifications_count');
    }

    $settings = \Illuminate\Support\Facades\Cache::remember('viri_system_settings', 300, function () {
        return \Illuminate\Support\Facades\DB::table('system_settings')->pluck('value', 'key')->all();
    });

    $holderInterval = max(1, (int) ($settings['poll_interval_holder'] ?? 1));
    $requestingInterval = max(1, (int) ($settings['poll_interval_requesting'] ?? 1));
    $idleInterval = max(5, (int) ($settings['poll_interval_idle'] ?? 15));
    $idleInterval = max($idleInterval, max($holderInterval, $requestingInterval) + 1);

    $appConfig = [
        'session_status_poll_interval' => (int) ($settings['session_status_poll_interval'] ?? 12),
        'credential_sync_poll_interval' => (int) ($settings['credential_sync_poll_interval'] ?? 60),
        'version_check_interval' => (int) ($settings['version_check_interval'] ?? 120),
        'active_session_heartbeat_interval' => (int) ($settings['active_session_heartbeat_interval'] ?? 5),
        'realtime_event_poll_interval' => (int) ($settings['realtime_event_poll_interval'] ?? 3),
        'poll_interval_holder' => $holderInterval,
        'poll_interval_requesting' => $requestingInterval,
        'poll_interval_idle' => $idleInterval,
        'debug_log_mib_html' => (bool) ($settings['debug_log_mib_html'] ?? false),
        'bml_login_procedure' => 'api',
        'mib_login_procedure' => 'api',
    ];

    $activeTerminalsCount = 1;
    $operationMode = 'Single Terminal';

    $bankAccounts = $tenant->bankAccounts;
    $totalConfidence = 0;
    $totalEfficiency = 0;
    $worstStatus = 'excellent';
    $totalFailures = 0;
    $totalRequests = 0;
    $totalFetches = 0;
    $totalBacklog = 0;
    $count = count($bankAccounts);

    foreach ($bankAccounts as $acct) {
        $acctSummary = \Illuminate\Support\Facades\Cache::get("sync_health_summary_{$acct->id}") ?: [
            'status' => 'healthy',
            'sync_confidence_score' => 100,
            'failed_today' => 0,
            'pending_backlog' => 0,
            'total_requests_count' => 0,
            'actual_fetches_count' => 0,
            'sync_efficiency' => 100,
        ];
        $totalConfidence += $acctSummary['sync_confidence_score'] ?? 100;
        $totalEfficiency += $acctSummary['sync_efficiency'] ?? 100;
        $totalFailures += $acctSummary['failed_today'] ?? 0;
        $totalRequests += $acctSummary['total_requests_count'] ?? 0;
        $totalFetches += $acctSummary['actual_fetches_count'] ?? 0;
        $totalBacklog += $acctSummary['pending_backlog'] ?? 0;
        
        $acctStatus = $acctSummary['status'] ?? 'healthy';
        if ($acctStatus === 'critical') {
            $worstStatus = 'critical';
        } elseif ($acctStatus === 'degraded' && $worstStatus !== 'critical') {
            $worstStatus = 'degraded';
        } elseif ($acctStatus === 'healthy' && $worstStatus === 'excellent') {
            $worstStatus = 'stable';
        }
    }

    $avgConfidence = $count > 0 ? (int) round($totalConfidence / $count) : 100;
    $avgEfficiency = $count > 0 ? ($totalEfficiency / $count) / 100 : 1.0;
    if ($avgEfficiency > 1.0) $avgEfficiency = 1.0;

    $syncHealthSummary = [
        'confidence_score' => $avgConfidence,
        'efficiency_score' => (float) $avgEfficiency,
        'status' => $worstStatus,
        'failures_24h' => $totalFailures,
        'avg_latency_ms' => 0,
        'total_requests' => $totalRequests,
        'total_fetches' => $totalFetches,
        'backlog' => $totalBacklog,
    ];

    $isFreeOr499 = in_array($tier, ['free', '499']);
    $tenantFeatures = is_array($tenant->features) ? $tenant->features : [];
    $terminalPermissions = is_array($terminal->permissions) ? $terminal->permissions : [];

    return response()->json([
        'status' => 'authorized',
        'terminal_id' => $terminal->id,
        'credits_exhausted' => $creditsExhausted,
        'subscription_expired' => $subscriptionExpired,
        'app_config' => $appConfig,
        'sync_health_summary' => $syncHealthSummary,
        'operation_mode' => $operationMode,
        'active_terminals_count' => $activeTerminalsCount,
        'license_expires_at' => $tenant->license_expires_at ? \Carbon\Carbon::parse($tenant->license_expires_at)->toIso8601String() : null,
        'expiry_warning_days' => (int) ($tenantFeatures['expiry_warning_days'] ?? 7),
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
                    'bml_profile_type' => $account->bml_profile_type ?? '0',
                    'mib_credential_profile_id' => $account->mib_credential_profile_id,
                    'bml_credential_group_id' => $account->bml_credential_group_id,
                    'bml_auth_state' => $account->bml_auth_state,
                    'has_api_token' => $account->has_api_token,
                    'is_default' => $account->is_default,
                    'label' => $account->label,
                    'currency' => $account->currency,
                    'login_failures' => $account->login_failures,
                    'login_credentials_hash' => $account->login_credentials_hash,
                    'session_holder_terminal_id' => $account->session_holder_terminal_id,
                    'session_holder_name' => $account->sessionHolder?->terminal_name,
                    'session_claimed_at' => $account->session_claimed_at ? \Carbon\Carbon::parse($account->session_claimed_at)->toIso8601String() : null,
                    'session_last_heartbeat_at' => $account->session_last_heartbeat_at ? \Carbon\Carbon::parse($account->session_last_heartbeat_at)->toIso8601String() : null,
                ];
            })
        ],
        'terminal_name' => $terminal->terminal_name,
        'settings_pin' => $terminal->settings_pin,
        'terminal_pin' => $terminalPermissions['terminal_pin'] ?? null,
        // 'credentials' intentionally omitted — credentials are never transmitted by server (ZK architecture)
        'should_upload_logs' => (isset($terminalPermissions['share_pwa_logs']) ? $terminalPermissions['share_pwa_logs'] : true) || ($terminal->allow_debug_until && now()->lessThan($terminal->allow_debug_until)),
        'permissions' => [
            'verification_enabled' => (bool) ($tenantFeatures['verification_enabled'] ?? true),
            'ledger_enabled' => (bool) (($tenantFeatures['ledger_enabled'] ?? !$isFreeOr499) && ($terminalPermissions['ledger_enabled'] ?? true)),
            'ledger_show_balance' => (bool) (($tenantFeatures['ledger_show_balance'] ?? !$isFreeOr499) && ($terminalPermissions['ledger_show_balance'] ?? true)),
            'ledger_show_debit' => (bool) (($tenantFeatures['ledger_show_debit'] ?? !$isFreeOr499) && ($terminalPermissions['ledger_show_debit'] ?? true)),
            'reports_enabled' => (bool) (($tenantFeatures['reports_enabled'] ?? !$isFreeOr499) && ($terminalPermissions['reports_enabled'] ?? false)),
            'statement_enabled' => (bool) (($tenantFeatures['statement_enabled'] ?? !$isFreeOr499) && ($terminalPermissions['statement_enabled'] ?? false)),
            'share_pwa_logs' => (bool) ($terminalPermissions['share_pwa_logs'] ?? true),
            'show_vbtl' => (bool) ($terminalPermissions['show_vbtl'] ?? false),
            'recent_tx_limit' => (function() use ($tenantFeatures) {
                $hasFeature = (bool) ($tenantFeatures['custom_recent_tx_limit'] ?? false);
                if (!$hasFeature) {
                    return 3;
                }
                $limit = (int) ($tenantFeatures['recent_tx_limit'] ?? 3);
                return ($limit === 0 || $limit >= 9999) ? 9999 : $limit;
            })()
        ]
    ]);
});

Route::post('/terminal/lock-account', [BankAccountLockController::class, 'lockAccount']);
Route::post('/terminal/heartbeat', [BankAccountLockController::class, 'heartbeat']);
Route::post('/terminal/unlock-account', [BankAccountLockController::class, 'unlockAccount']);
Route::post('/terminal/status/log', [TerminalPairingController::class, 'logStatus']);
Route::post('/terminal/logs', [TerminalPairingController::class, 'uploadLogs']);
// /terminal/credentials kept for backward compat but PWA no longer calls it (ZK architecture)
Route::post('/terminal/credentials', [TerminalPairingController::class, 'saveCredentials']);
Route::post('/terminal/bank-accounts/increment-failures', [BankAccountLockController::class, 'incrementFailures']);
Route::post('/terminal/bank-accounts/reset-failures', [BankAccountLockController::class, 'resetFailures']);
Route::post('/terminal/bank-accounts/clear-api-token', [BankAccountLockController::class, 'clearApiToken']);
Route::post('/terminal/bank-accounts/map-credentials', [BankAccountLockController::class, 'mapCredentials']);

// Credential Sync (Terminal side — hardware_id auth)
Route::get('/terminal/credential-sync/sse',                    [CredentialSyncController::class, 'sseStream']);
Route::get('/terminal/credential-sync/pending',                [CredentialSyncController::class, 'pendingForTerminal']);
Route::post('/terminal/credential-sync/{id}/upload',           [CredentialSyncController::class, 'upload']);
Route::post('/terminal/credential-sync/{id}/confirm-import',   [CredentialSyncController::class, 'confirmImport']);

// Real-Time Signaling Endpoints (non-cache)


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

// Ledger Reports
Route::post('/terminal/reports', [\App\Http\Controllers\API\LedgerReportController::class, 'store']);
Route::get('/terminal/reports', [\App\Http\Controllers\API\LedgerReportController::class, 'index']);
Route::delete('/terminal/reports/{id}', [\App\Http\Controllers\API\LedgerReportController::class, 'destroy']);
