<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Affiliate extends Model
{
    protected $fillable = [
        'user_id',
        'name',
        'email',
        'phone',
        'referral_code',
        'custom_coupon_code',
        'current_tier_id',
        'rolling_monthly_sales',
        'payout_bank_name',
        'payout_account_number',
        'payout_account_name',
        'lifetime_earned',
        'pending_balance',
        'available_balance',
        'paid_balance',
        'status',
    ];

    protected $casts = [
        'rolling_monthly_sales' => 'integer',
        'lifetime_earned' => 'float',
        'pending_balance' => 'float',
        'available_balance' => 'float',
        'paid_balance' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function currentTier(): BelongsTo
    {
        return $this->belongsTo(ReferralPerformanceTier::class, 'current_tier_id');
    }

    public function attributions(): HasMany
    {
        return $this->hasMany(ReferralAttribution::class);
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(Commission::class);
    }

    public function payoutBatches(): HasMany
    {
        return $this->hasMany(PayoutBatch::class);
    }
}
