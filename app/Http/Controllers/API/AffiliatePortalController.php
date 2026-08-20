<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Affiliate;
use App\Models\Commission;
use App\Models\PayoutBatch;
use App\Models\ReferralAttribution;
use App\Models\ReferralPerformanceTier;
use App\Models\ReferralSystemConfig;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AffiliatePortalController extends Controller
{
    public function getPublicConfig()
    {
        $config = ReferralSystemConfig::getActiveConfig();
        return response()->json([
            'program_headline' => $config->program_headline ?: 'Earn 15% to 25% recurring monthly commissions.',
            'customer_discount_enabled' => (bool) $config->customer_discount_enabled,
            'customer_discount_type' => $config->customer_discount_type,
            'customer_discount_value' => (float) $config->customer_discount_value,
        ]);
    }

    public function register(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email',
            'phone_number' => 'required|string|max:255',
            'password' => 'required|string|min:8|confirmed',
            'custom_referral_code' => 'nullable|string|max:32|unique:affiliates,referral_code',
        ]);

        return DB::transaction(function () use ($request) {
            // 1. Create Partner User
            $user = User::create([
                'name' => $request->name,
                'email' => $request->email,
                'phone_number' => $request->phone_number,
                'role' => 'affiliate',
                'status' => 'approved',
                'password' => Hash::make($request->password),
            ]);

            // 2. Generate referral code
            $code = $request->filled('custom_referral_code')
                ? strtoupper(trim($request->custom_referral_code))
                : strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $request->name), 0, 6) . rand(10, 99));

            $baseTier = ReferralPerformanceTier::orderBy('min_monthly_sales', 'asc')->first();

            // 3. Create Affiliate Record (bank payout details are input inside partner dashboard)
            $affiliate = Affiliate::create([
                'user_id' => $user->id,
                'name' => $request->name,
                'email' => $request->email,
                'phone' => $request->phone_number,
                'referral_code' => $code,
                'custom_coupon_code' => 'SAVE-' . $code,
                'current_tier_id' => $baseTier?->id,
                'payout_bank_name' => null,
                'payout_account_number' => null,
                'payout_account_name' => null,
                'status' => 'active',
            ]);

            // 4. Create Token for instant login
            $token = $user->createToken('affiliate_auth_token')->plainTextToken;

            return response()->json([
                'success' => true,
                'message' => 'Affiliate account created successfully!',
                'access_token' => $token,
                'token_type' => 'Bearer',
                'user' => $user,
                'affiliate' => $affiliate,
            ], 201);
        });
    }

    private function resolveAffiliate(Request $request): Affiliate
    {
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated');
        }

        $affiliate = Affiliate::where('user_id', $user->id)->orWhere('email', $user->email)->first();
        if (! $affiliate) {
            // Auto-provision affiliate account for partner
            $code = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $user->name), 0, 6) . rand(10, 99));
            $baseTier = ReferralPerformanceTier::orderBy('min_monthly_sales', 'asc')->first();

            $affiliate = Affiliate::create([
                'user_id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone_number ?? null,
                'referral_code' => $code,
                'custom_coupon_code' => 'SAVE-' . $code,
                'current_tier_id' => $baseTier?->id,
                'status' => 'active',
            ]);
        }

        return $affiliate;
    }

    public function getOverview(Request $request)
    {
        $affiliate = $this->resolveAffiliate($request);
        $affiliate->load('currentTier');
        $config = ReferralSystemConfig::getActiveConfig();

        // Calculate 30-day conversion stats
        $conversionsCount = ReferralAttribution::where('affiliate_id', $affiliate->id)->count();
        $monthlyConversionsCount = ReferralAttribution::where('affiliate_id', $affiliate->id)
            ->where('attributed_at', '>=', Carbon::now()->subDays(30))
            ->count();

        $activeClientsCount = ReferralAttribution::where('affiliate_id', $affiliate->id)
            ->where('status', 'active')
            ->count();

        // Recent 5 commissions
        $recentCommissions = Commission::with('tenant')
            ->where('affiliate_id', $affiliate->id)
            ->orderBy('created_at', 'desc')
            ->take(5)
            ->get();

        $referralBaseUrl = 'https://viri.thinksafe.mv';

        return response()->json([
            'affiliate' => $affiliate,
            'referral_link' => "{$referralBaseUrl}/register?ref={$affiliate->referral_code}",
            'direct_ref_url' => "{$referralBaseUrl}/ref/{$affiliate->referral_code}",
            'config' => [
                'payout_mode' => $config->payout_mode,
                'min_payout_threshold' => (float) $config->min_payout_threshold,
                'customer_discount_enabled' => $config->customer_discount_enabled,
                'customer_discount_type' => $config->customer_discount_type,
                'customer_discount_value' => (float) $config->customer_discount_value,
                'grace_period_days' => $config->commission_grace_period_days,
            ],
            'metrics' => [
                'total_conversions' => $conversionsCount,
                'monthly_conversions' => $monthlyConversionsCount,
                'active_clients' => $activeClientsCount,
                'lifetime_earned' => (float) $affiliate->lifetime_earned,
                'pending_balance' => (float) $affiliate->pending_balance,
                'available_balance' => (float) $affiliate->available_balance,
                'paid_balance' => (float) $affiliate->paid_balance,
            ],
            'recent_commissions' => $recentCommissions,
        ]);
    }

    public function getClientSales(Request $request)
    {
        $affiliate = $this->resolveAffiliate($request);

        $query = ReferralAttribution::with(['tenant', 'commissions'])
            ->where('affiliate_id', $affiliate->id);

        if ($request->has('search') && ! empty($request->search)) {
            $s = $request->search;
            $query->whereHas('tenant', function ($q) use ($s) {
                $q->where('name', 'like', "%{$s}%");
            });
        }

        $attributions = $query->orderBy('attributed_at', 'desc')->paginate(15);

        // Format for Client Sales Table ("Who They Sold To")
        $sales = $attributions->through(function ($attr) {
            $tenant = $attr->tenant;
            $currentPlan = $tenant?->features['tier_key'] ?? $attr->initial_plan_key ?? 'Starter';
            $totalEarnedFromClient = (float) $attr->commissions->sum('commission_amount');
            $latestCommission = $attr->commissions->sortByDesc('created_at')->first();

            return [
                'id' => $attr->id,
                'client_name' => $tenant?->name ?? 'Unknown Company',
                'current_plan' => ucfirst($currentPlan),
                'initial_plan' => ucfirst($attr->initial_plan_key ?? 'Starter'),
                'is_upgraded' => ($currentPlan !== $attr->initial_plan_key),
                'conversion_date' => $attr->attributed_at->format('d M Y'),
                'payout_countdown' => [
                    'current_month' => $attr->invoices_commissioned_count,
                    'max_months' => $attr->payout_duration_limit_months,
                    'label' => "Month {$attr->invoices_commissioned_count} of {$attr->payout_duration_limit_months}",
                    'progress_pct' => $attr->payout_duration_limit_months > 0 
                        ? min(100, round(($attr->invoices_commissioned_count / $attr->payout_duration_limit_months) * 100))
                        : 100,
                ],
                'effective_rate_pct' => $latestCommission ? (float) $latestCommission->effective_commission_pct : 15.00,
                'total_earned' => $totalEarnedFromClient,
                'status' => $attr->status,
            ];
        });

        return response()->json($sales);
    }

    public function getCommissions(Request $request)
    {
        $affiliate = $this->resolveAffiliate($request);

        $commissions = Commission::with(['tenant', 'invoice'])
            ->where('affiliate_id', $affiliate->id)
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($commissions);
    }

    public function requestPayout(Request $request)
    {
        $affiliate = $this->resolveAffiliate($request);
        $config = ReferralSystemConfig::getActiveConfig();

        if ($config->payout_mode === 'automated_batch') {
            return response()->json(['error' => 'Payouts are automatically processed on scheduled monthly batches.'], 400);
        }

        $minThreshold = (float) $config->min_payout_threshold;
        if ($affiliate->available_balance < $minThreshold) {
            return response()->json([
                'error' => "Minimum withdrawal threshold is MVR " . number_format($minThreshold, 2) . ". Your available balance is MVR " . number_format($affiliate->available_balance, 2)
            ], 400);
        }

        if (empty($affiliate->payout_account_number)) {
            return response()->json(['error' => 'Please configure your payout bank account details first.'], 400);
        }

        // Check if there is already a pending payout request
        $hasPending = PayoutBatch::where('affiliate_id', $affiliate->id)
            ->where('status', 'REQUESTED')
            ->exists();

        if ($hasPending) {
            return response()->json(['error' => 'You already have a pending payout request under review.'], 400);
        }

        $payoutAmount = (float) $affiliate->available_balance;

        DB::transaction(function () use ($affiliate, $payoutAmount) {
            $batchRef = 'PAY-' . date('Ym') . '-' . strtoupper(Str::random(6));

            $batch = PayoutBatch::create([
                'affiliate_id' => $affiliate->id,
                'batch_reference' => $batchRef,
                'amount' => $payoutAmount,
                'payout_type' => 'manual_request',
                'bank_name' => $affiliate->payout_bank_name ?? 'BML',
                'account_number' => $affiliate->payout_account_number,
                'account_name' => $affiliate->payout_account_name ?? $affiliate->name,
                'status' => 'REQUESTED',
            ]);

            // Link eligible available commissions
            Commission::where('affiliate_id', $affiliate->id)
                ->where('status', 'AVAILABLE')
                ->whereNull('payout_batch_id')
                ->update(['payout_batch_id' => $batch->id]);

            // Deduct from available balance
            $affiliate->decrement('available_balance', $payoutAmount);
        });

        return response()->json([
            'success' => true,
            'message' => 'Withdrawal request of MVR ' . number_format($payoutAmount, 2) . ' submitted successfully. Our finance team will review and process the transfer.',
        ]);
    }

    public function updateBankDetails(Request $request)
    {
        $affiliate = $this->resolveAffiliate($request);

        $validated = $request->validate([
            'payout_bank_name' => 'required|in:BML,MIB,Other',
            'payout_account_number' => 'required|string|max:50',
            'payout_account_name' => 'required|string|max:100',
            'custom_coupon_code' => 'nullable|string|max:32|unique:affiliates,custom_coupon_code,' . $affiliate->id,
        ]);

        $affiliate->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Payout bank details updated successfully.',
            'affiliate' => $affiliate,
        ]);
    }

    public function calculateProjections(Request $request)
    {
        $affiliate = $this->resolveAffiliate($request);
        $config = ReferralSystemConfig::getActiveConfig();

        $activeClientsCount = ReferralAttribution::where('affiliate_id', $affiliate->id)
            ->where('status', 'active')
            ->count();

        $newSalesPerMonth = (int) $request->input('new_sales_per_month', 5);
        $retentionRate = (float) $request->input('retention_rate', 0.95); // 95%
        $avgPackagePrice = (float) $request->input('avg_package_price', 1500.00); // MVR 1,500
        
        $basePct = 15.00;
        $tierBonusPct = $affiliate->currentTier ? (float) $affiliate->currentTier->bonus_commission_pct : 0.00;
        $effectiveRate = ($basePct + $tierBonusPct) / 100;

        // Forecast month-by-month for 36 months (3 years)
        $months = [];
        $runningClients = $activeClientsCount;
        $cumulativeEarnings = 0;

        for ($m = 1; $m <= 36; $m++) {
            $runningClients = ($runningClients * $retentionRate) + $newSalesPerMonth;
            $monthlyGross = $runningClients * $avgPackagePrice;
            $monthlyCommission = round($monthlyGross * $effectiveRate, 2);
            $cumulativeEarnings += $monthlyCommission;

            $months[] = [
                'month_number' => $m,
                'active_clients' => round($runningClients),
                'monthly_commission' => $monthlyCommission,
                'cumulative_earnings' => $cumulativeEarnings,
            ];
        }

        return response()->json([
            'next_month' => $months[0]['monthly_commission'] ?? 0,
            'six_months_total' => $months[5]['cumulative_earnings'] ?? 0,
            'one_year_total' => $months[11]['cumulative_earnings'] ?? 0,
            'three_years_total' => $months[35]['cumulative_earnings'] ?? 0,
            'timeline' => $months,
        ]);
    }

    public function validateReferralCode($code)
    {
        $cleanedCode = trim(strtoupper($code));
        $affiliate = Affiliate::where(DB::raw('UPPER(referral_code)'), $cleanedCode)
            ->orWhere(DB::raw('UPPER(custom_coupon_code)'), $cleanedCode)
            ->where('status', 'active')
            ->first();

        if (! $affiliate) {
            return response()->json(['valid' => false, 'message' => 'Invalid or inactive referral code.'], 404);
        }

        $config = ReferralSystemConfig::getActiveConfig();

        return response()->json([
            'valid' => true,
            'referral_code' => $affiliate->referral_code,
            'partner_name' => $affiliate->name,
            'discount_enabled' => $config->customer_discount_enabled,
            'discount_type' => $config->customer_discount_type,
            'discount_value' => (float) $config->customer_discount_value,
            'discount_badge' => $config->customer_discount_type === 'percentage' 
                ? "{$config->customer_discount_value}% OFF First Invoice"
                : "MVR {$config->customer_discount_value} OFF First Invoice",
        ]);
    }
}
