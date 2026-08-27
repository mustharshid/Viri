<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function getPublicPlans()
    {
        $plans = \App\Models\SubscriptionPlan::orderBy('price', 'asc')->get([
            'id',
            'tier_key',
            'name',
            'price',
            'max_terminals',
            'max_bank_accounts',
            'max_transaction_checks',
            'features',
        ]);

        return response()->json($plans);
    }

    public function register(Request $request)
    {
        $request->validate([
            'company_name' => 'required|string|max:255',
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'phone_number' => 'required|string|max:255',
            'password' => 'required|string|min:8|confirmed',
            'subscription_tier' => 'nullable|string',
        ]);

        $selectedTier = $request->input('subscription_tier', 'free');
        $plan = \App\Models\SubscriptionPlan::where('tier_key', $selectedTier)->first();

        $features = $plan ? ($plan->features ?? []) : [];
        $maxTerminals = $plan ? (int) $plan->max_terminals : 1;
        $maxBankAccounts = $plan ? (int) $plan->max_bank_accounts : 1;
        $lockTimeout = $plan ? (int) $plan->lock_timeout : 20;

        // 1. Create the tenant (Company)
        $tenant = Tenant::create([
            'name' => $request->company_name,
            'status' => 'pending', // Requires Superadmin approval
            'subscription_tier' => $selectedTier,
            'max_terminals' => $maxTerminals,
            'max_bank_accounts' => $maxBankAccounts,
            'lock_timeout' => $lockTimeout,
            'features' => $features,
        ]);

        // 1.5 Register referral attribution if referral code is provided
        if ($request->filled('referral_code')) {
            $engine = new \App\Services\ReferralCommissionEngine();
            $engine->registerAttribution($tenant, $request->referral_code, $selectedTier);
        }

        // 2. Create the user
        $user = User::create([
            'tenant_id' => $tenant->id,
            'role' => 'company_admin',
            'status' => 'pending',
            'name' => $request->name,
            'email' => $request->email,
            'phone_number' => $request->phone_number,
            'password' => Hash::make($request->password),
        ]);

        // 3. Issue Token
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => $user->load('tenant'),
        ]);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        if (! Auth::attempt($request->only('email', 'password'))) {
            return response()->json([
                'message' => 'Invalid login details',
            ], 401);
        }

        $user = User::where('email', $request['email'])->firstOrFail();

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
            'user' => $user->load('tenant'),
        ]);
    }

    public function me(Request $request)
    {
        return response()->json([
            'user' => $request->user()->load('tenant'),
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->tokens()->delete();

        return response()->json([
            'message' => 'Successfully logged out',
        ]);
    }
}
