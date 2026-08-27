<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReferralSystemConfig extends Model
{
    protected $fillable = [
        'payout_mode',
        'program_headline',
        'min_payout_threshold',
        'auto_payout_day_of_month',
        'customer_discount_enabled',
        'customer_discount_type',
        'customer_discount_value',
        'package_commission_rules',
        'commission_grace_period_days',
        'is_active',
    ];

    protected $casts = [
        'min_payout_threshold' => 'float',
        'auto_payout_day_of_month' => 'integer',
        'customer_discount_enabled' => 'boolean',
        'customer_discount_value' => 'float',
        'package_commission_rules' => 'array',
        'commission_grace_period_days' => 'integer',
        'is_active' => 'boolean',
    ];

    public static function getActiveConfig(): self
    {
        $config = self::first();
        if (! $config) {
            $config = self::create([
                'payout_mode' => 'manual_request',
                'program_headline' => 'Earn 15% to 25% recurring monthly commissions.',
                'min_payout_threshold' => 500.00,
                'auto_payout_day_of_month' => 1,
                'customer_discount_enabled' => true,
                'customer_discount_type' => 'percentage',
                'customer_discount_value' => 10.00,
                'package_commission_rules' => [
                    '349' => [
                        'enabled' => true,
                        'initial_commission_pct' => 50.00,
                        'initial_duration_months' => 6,
                        'recurring_commission_pct' => 10.00,
                        'recurring_duration_months' => 24,
                    ],
                    '499' => [
                        'enabled' => true,
                        'initial_commission_pct' => 50.00,
                        'initial_duration_months' => 6,
                        'recurring_commission_pct' => 10.00,
                        'recurring_duration_months' => 24,
                    ],
                    '999' => [
                        'enabled' => true,
                        'initial_commission_pct' => 50.00,
                        'initial_duration_months' => 6,
                        'recurring_commission_pct' => 10.00,
                        'recurring_duration_months' => 24,
                    ],
                ],
                'commission_grace_period_days' => 14,
                'is_active' => true,
            ]);
        }
        return $config;
    }

    /**
     * Get normalized multi-stage commission rule for a specific plan tier key.
     */
    public function getRuleForPlan(?string $planKey): array
    {
        $rules = $this->package_commission_rules ?? [];
        $key = $planKey ? strtolower(trim($planKey)) : 'starter';

        $rule = $rules[$key] ?? null;

        // Fallback search without case sensitivity or partial match
        if (! $rule) {
            foreach ($rules as $k => $r) {
                if (strtolower($k) === $key) {
                    $rule = $r;
                    break;
                }
            }
        }

        if (! $rule) {
            // Default generic fallback rule
            return [
                'enabled' => true,
                'initial_commission_pct' => 50.00,
                'initial_duration_months' => 6,
                'recurring_commission_pct' => 10.00,
                'recurring_duration_months' => 24,
                'total_duration_months' => 30,
            ];
        }

        $initialPct = isset($rule['initial_commission_pct']) 
            ? (float) $rule['initial_commission_pct'] 
            : (float) ($rule['commission_pct'] ?? 15.00);

        $initialMonths = isset($rule['initial_duration_months']) 
            ? (int) $rule['initial_duration_months'] 
            : (int) ($rule['duration_months'] ?? 12);

        $recurringPct = isset($rule['recurring_commission_pct']) 
            ? (float) $rule['recurring_commission_pct'] 
            : 0.00;

        $recurringMonths = isset($rule['recurring_duration_months']) 
            ? (int) $rule['recurring_duration_months'] 
            : 0;

        return [
            'enabled' => $rule['enabled'] ?? true,
            'initial_commission_pct' => $initialPct,
            'initial_duration_months' => $initialMonths,
            'recurring_commission_pct' => $recurringPct,
            'recurring_duration_months' => $recurringMonths,
            'total_duration_months' => $initialMonths + $recurringMonths,
        ];
    }

    /**
     * Resolve base commission % for a specific invoice month index (1-based).
     */
    public function getBaseRateForMonth(?string $planKey, int $monthIndex): float
    {
        $rule = $this->getRuleForPlan($planKey);

        if (! $rule['enabled']) {
            return 0.00;
        }

        if ($monthIndex <= $rule['initial_duration_months']) {
            return $rule['initial_commission_pct'];
        }

        if ($monthIndex <= $rule['total_duration_months']) {
            return $rule['recurring_commission_pct'];
        }

        return 0.00;
    }
}

