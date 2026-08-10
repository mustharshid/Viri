<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReferralSystemConfig extends Model
{
    protected $fillable = [
        'payout_mode',
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
                'min_payout_threshold' => 500.00,
                'auto_payout_day_of_month' => 1,
                'customer_discount_enabled' => true,
                'customer_discount_type' => 'percentage',
                'customer_discount_value' => 10.00,
                'package_commission_rules' => [
                    'starter' => ['commission_pct' => 15.00, 'duration_months' => 12],
                    'business' => ['commission_pct' => 20.00, 'duration_months' => 12],
                    'enterprise' => ['commission_pct' => 25.00, 'duration_months' => 12],
                ],
                'commission_grace_period_days' => 14,
                'is_active' => true,
            ]);
        }
        return $config;
    }
}
