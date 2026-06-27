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
    Route::put('/admin/terminals/{id}', [SuperadminController::class, 'updateTerminal']);
    Route::post('/admin/terminals/{id}/view-log', [SuperadminController::class, 'viewTerminalLog']);

    Route::get('/company/terminals', [CompanyController::class, 'getTerminals']);
    Route::post('/company/terminals', [CompanyController::class, 'createTerminal']);
    Route::put('/company/terminals/{id}', [CompanyController::class, 'updateTerminal']);
    Route::delete('/company/terminals/{id}', [CompanyController::class, 'deleteTerminal']);
    Route::post('/company/terminals/{id}/enable-debug', [CompanyController::class, 'enableDebug']);
    Route::post('/company/terminals/{id}/regenerate-pairing-code', [CompanyController::class, 'regeneratePairingCode']);

    Route::get('/company/bank-accounts', [CompanyController::class, 'getBankAccounts']);
    Route::post('/company/bank-accounts', [CompanyController::class, 'createBankAccount']);
    Route::delete('/company/bank-accounts/{id}', [CompanyController::class, 'deleteBankAccount']);
});

/*
|--------------------------------------------------------------------------
| Viri Cashier Terminal API (Requires hardware_id)
|--------------------------------------------------------------------------
|
*/

Route::post('/verify-terminal', function (Request $request) {
    $request->validate([
        'hardware_id' => 'required|string'
    ]);

    $terminal = \App\Models\Terminal::where('hardware_id', $request->hardware_id)
        ->with(['tenant.bankAccounts'])
        ->first();

    if (!$terminal || $terminal->status !== 'active') {
        return response()->json(['error' => 'Terminal unauthorized or revoked'], 403);
    }

    $tenant = $terminal->tenant;

    if ($tenant->status !== 'active') {
        return response()->json(['error' => 'Company account pending approval or suspended'], 403);
    }

    // --- Subscription Tier Verification Limits ---
    $limits = [
        'free' => 20,
        '499' => 300,
        '999' => PHP_INT_MAX,
        '1999' => PHP_INT_MAX,
    ];
    $tier = $tenant->subscription_tier ?? 'free';
    $limit = $limits[$tier] ?? 20;

    $creditsExhausted = ($tenant->verifications_count >= $limit);

    if (!$creditsExhausted && $request->input('action') === 'verify') {
        // Increment count
        $tenant->increment('verifications_count');
    }

    return response()->json([
        'status' => 'authorized',
        'credits_exhausted' => $creditsExhausted,
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
                    'label' => $account->label
                ];
            })
        ],
        'terminal_name' => $terminal->terminal_name,
        'permissions' => ($tier === 'free' || $tier === '499') ? [
            'verification_enabled' => true,
            'ledger_enabled' => false,
            'ledger_show_balance' => false,
            'ledger_show_debit' => false,
            'reports_enabled' => false,
            'show_vbtl' => $terminal->permissions['show_vbtl'] ?? false
        ] : $terminal->permissions
    ]);
});

Route::post('/terminal/lock-account', [BankAccountLockController::class, 'lockAccount']);
Route::post('/terminal/heartbeat', [BankAccountLockController::class, 'heartbeat']);
Route::post('/terminal/unlock-account', [BankAccountLockController::class, 'unlockAccount']);
Route::post('/terminal/logs', [TerminalPairingController::class, 'uploadLogs']);
Route::post('/terminal/credentials', [TerminalPairingController::class, 'saveCredentials']);
