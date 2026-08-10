<?php

namespace App\Services;

use App\Models\Affiliate;
use App\Models\Commission;
use App\Models\Invoice;
use App\Models\PayoutBatch;
use App\Models\ReferralAttribution;
use App\Models\ReferralPerformanceTier;
use App\Models\ReferralSystemConfig;
use App\Models\Tenant;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReferralCommissionEngine
{
    /**
     * Hook 1: Customer Signup Attribution & 1st Invoice Discount Calculation
     */
    public function registerAttribution(Tenant $tenant, string $referralCode, ?string $planKey = 'starter'): ?ReferralAttribution
    {
        $cleanedCode = trim(strtoupper($referralCode));
        if (empty($cleanedCode)) {
            return null;
        }

        $affiliate = Affiliate::where(DB::raw('UPPER(referral_code)'), $cleanedCode)
            ->orWhere(DB::raw('UPPER(custom_coupon_code)'), $cleanedCode)
            ->where('status', 'active')
            ->first();

        if (! $affiliate) {
            return null;
        }

        $config = ReferralSystemConfig::getActiveConfig();
        $packageRules = $config->package_commission_rules[$planKey] ?? ['commission_pct' => 15.00, 'duration_months' => 12];
        $durationMonths = (int) ($packageRules['duration_months'] ?? 12);

        return ReferralAttribution::create([
            'affiliate_id' => $affiliate->id,
            'tenant_id' => $tenant->id,
            'applied_referral_code' => $cleanedCode,
            'discount_type' => $config->customer_discount_type ?? 'percentage',
            'discount_value' => $config->customer_discount_value ?? 10.00,
            'first_invoice_discount_amount' => 0.00, // Populated on 1st invoice generation
            'initial_plan_key' => $planKey,
            'payout_duration_limit_months' => $durationMonths,
            'invoices_commissioned_count' => 0,
            'attributed_at' => Carbon::now(),
            'expires_at' => $durationMonths > 0 ? Carbon::now()->addMonths($durationMonths) : null,
            'status' => 'active',
        ]);
    }

    /**
     * Hook 2: Dynamic Upgrade Scaling & Recurring Invoice Commission
     */
    public function processInvoiceCommission(Invoice $invoice): ?Commission
    {
        $tenant = $invoice->tenant;
        if (! $tenant) {
            return null;
        }

        $attribution = ReferralAttribution::where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->first();

        if (! $attribution) {
            return null;
        }

        // Check if duration limit expired
        if ($attribution->expires_at && Carbon::now()->greaterThan($attribution->expires_at)) {
            $attribution->update(['status' => 'expired']);
            return null;
        }

        $affiliate = $attribution->affiliate;
        if (! $affiliate || $affiliate->status !== 'active') {
            return null;
        }

        $config = ReferralSystemConfig::getActiveConfig();

        // 1. Resolve current plan (Dynamic Upgrade check)
        $currentPlanKey = $tenant->features['tier_key'] ?? $attribution->initial_plan_key ?? 'starter';
        $packageRules = $config->package_commission_rules[$currentPlanKey] ?? [
            'commission_pct' => 15.00,
            'duration_months' => 12,
        ];

        // 2. Base Rate + Performance Tier Bonus Rate
        $baseCommissionPct = (float) ($packageRules['commission_pct'] ?? 15.00);
        $tierBonusPct = 0.00;
        if ($affiliate->currentTier) {
            $tierBonusPct = (float) $affiliate->currentTier->bonus_commission_pct;
        }
        $effectiveCommissionPct = $baseCommissionPct + $tierBonusPct;

        // 3. Dynamic Calculation based on ACTUAL invoice amount generated for this cycle
        $actualInvoiceAmount = (float) $invoice->amount;
        $commissionAmount = round($actualInvoiceAmount * ($effectiveCommissionPct / 100), 2);

        $nextMonthIndex = $attribution->invoices_commissioned_count + 1;
        $maxMonths = (int) ($packageRules['duration_months'] ?? 12);
        $graceDays = (int) ($config->commission_grace_period_days ?? 14);

        return DB::transaction(function () use (
            $affiliate, $attribution, $invoice, $tenant, $currentPlanKey,
            $actualInvoiceAmount, $baseCommissionPct, $tierBonusPct,
            $effectiveCommissionPct, $commissionAmount, $nextMonthIndex,
            $maxMonths, $graceDays
        ) {
            $commission = Commission::create([
                'affiliate_id' => $affiliate->id,
                'referral_attribution_id' => $attribution->id,
                'invoice_id' => $invoice->id,
                'tenant_id' => $tenant->id,
                'plan_key' => $currentPlanKey,
                'invoice_amount' => $actualInvoiceAmount,
                'base_commission_pct' => $baseCommissionPct,
                'tier_bonus_pct' => $tierBonusPct,
                'effective_commission_pct' => $effectiveCommissionPct,
                'commission_amount' => $commissionAmount,
                'month_index' => $nextMonthIndex,
                'max_duration_months' => $maxMonths,
                'status' => 'PENDING',
                'available_at' => Carbon::now()->addDays($graceDays),
            ]);

            // Update attribution progress
            $attribution->increment('invoices_commissioned_count');
            if ($maxMonths > 0 && $nextMonthIndex >= $maxMonths) {
                $attribution->update(['status' => 'completed']);
            }

            // Atomically update affiliate balances
            $affiliate->increment('pending_balance', $commissionAmount);
            $affiliate->increment('lifetime_earned', $commissionAmount);

            return $commission;
        });
    }

    /**
     * Hook 3: Daily Commission Maturity Transition (PENDING -> AVAILABLE)
     */
    public function maturePendingCommissions(): int
    {
        $matured = Commission::where('status', 'PENDING')
            ->where('available_at', '<=', Carbon::now())
            ->get();

        $count = 0;
        foreach ($matured as $comm) {
            DB::transaction(function () use ($comm) {
                $comm->update(['status' => 'AVAILABLE']);
                $affiliate = $comm->affiliate;
                if ($affiliate) {
                    $affiliate->decrement('pending_balance', $comm->commission_amount);
                    $affiliate->increment('available_balance', $comm->commission_amount);
                }
            });
            $count++;
        }

        return $count;
    }

    /**
     * Hook 4: Evaluate Performance Tier Upgrades
     */
    public function evaluatePerformanceTiers(): void
    {
        $tiers = ReferralPerformanceTier::orderBy('min_monthly_sales', 'desc')->get();
        $affiliates = Affiliate::where('status', 'active')->get();

        foreach ($affiliates as $affiliate) {
            // Count conversions in the last 30 days
            $monthlySales = ReferralAttribution::where('affiliate_id', $affiliate->id)
                ->where('attributed_at', '>=', Carbon::now()->subDays(30))
                ->count();

            $affiliate->rolling_monthly_sales = $monthlySales;

            // Find matching tier
            $matchedTier = $tiers->first(function ($t) use ($monthlySales) {
                return $monthlySales >= $t->min_monthly_sales;
            });

            if ($matchedTier && $affiliate->current_tier_id !== $matchedTier->id) {
                $affiliate->current_tier_id = $matchedTier->id;
            }

            $affiliate->save();
        }
    }

    /**
     * Hook 5: Process Automated Monthly Payout Batches
     */
    public function processAutomatedPayoutBatches(): array
    {
        $config = ReferralSystemConfig::getActiveConfig();
        if ($config->payout_mode !== 'automated_batch') {
            return ['generated' => 0, 'total_amount' => 0];
        }

        $minThreshold = (float) $config->min_payout_threshold;
        $eligibleAffiliates = Affiliate::where('status', 'active')
            ->where('available_balance', '>=', $minThreshold)
            ->whereNotNull('payout_account_number')
            ->get();

        $batchCount = 0;
        $totalAmount = 0;

        foreach ($eligibleAffiliates as $affiliate) {
            $payoutAmount = (float) $affiliate->available_balance;
            if ($payoutAmount <= 0) {
                continue;
            }

            DB::transaction(function () use ($affiliate, $payoutAmount, &$batchCount, &$totalAmount) {
                $batchRef = 'PAY-' . date('Ym') . '-' . strtoupper(Str::random(6));

                $batch = PayoutBatch::create([
                    'affiliate_id' => $affiliate->id,
                    'batch_reference' => $batchRef,
                    'amount' => $payoutAmount,
                    'payout_type' => 'automated_batch',
                    'bank_name' => $affiliate->payout_bank_name ?? 'BML',
                    'account_number' => $affiliate->payout_account_number,
                    'account_name' => $affiliate->payout_account_name ?? $affiliate->name,
                    'status' => 'REQUESTED',
                ]);

                // Attach available commissions to this payout batch
                Commission::where('affiliate_id', $affiliate->id)
                    ->where('status', 'AVAILABLE')
                    ->whereNull('payout_batch_id')
                    ->update(['payout_batch_id' => $batch->id]);

                // Atomically move from available_balance
                $affiliate->decrement('available_balance', $payoutAmount);

                $batchCount++;
                $totalAmount += $payoutAmount;
            });
        }

        return ['generated' => $batchCount, 'total_amount' => $totalAmount];
    }
}
