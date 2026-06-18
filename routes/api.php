<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\API\AuthController;
use App\Http\Controllers\API\CompanyController;
use App\Http\Controllers\API\SuperadminController;
use App\Http\Controllers\API\TerminalPairingController;

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

    // Company Admin Routes
    Route::get('/company/terminals', [CompanyController::class, 'getTerminals']);
    Route::post('/company/terminals', [CompanyController::class, 'createTerminal']);
    Route::delete('/company/terminals/{id}', [CompanyController::class, 'deleteTerminal']);

    Route::get('/company/bank-accounts', [CompanyController::class, 'getBankAccounts']);
    Route::post('/company/bank-accounts', [CompanyController::class, 'createBankAccount']);
    Route::delete('/company/bank-accounts/{id}', [CompanyController::class, 'deleteBankAccount']);
});

/*
|--------------------------------------------------------------------------
| Viri Cashier Terminal API (Requires hardware_id)
|--------------------------------------------------------------------------
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

    if ($tenant->verifications_count >= $limit) {
        return response()->json(['error' => 'Monthly verification limit reached for this subscription tier. Please upgrade.'], 403);
    }

    // Increment count
    $tenant->increment('verifications_count');

    return response()->json([
        'status' => 'authorized',
        'tenant' => [
            'name' => $tenant->name,
            'logo' => $tenant->company_logo,
            'tier' => $tier,
            'verifications_used' => $tenant->verifications_count,
            'bank_accounts' => $tenant->bankAccounts->map(function($account) {
                return [
                    'id' => $account->id,
                    'bank_name' => $account->bank_name,
                    'account_name' => $account->account_name,
                    'account_number' => $account->account_number,
                    'is_default' => $account->is_default
                ];
            })
        ]
    ]);
});
