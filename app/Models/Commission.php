<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Commission extends Model
{
    protected $fillable = [
        'affiliate_id',
        'referral_attribution_id',
        'invoice_id',
        'tenant_id',
        'plan_key',
        'invoice_amount',
        'base_commission_pct',
        'tier_bonus_pct',
        'effective_commission_pct',
        'commission_amount',
        'month_index',
        'max_duration_months',
        'status',
        'available_at',
        'paid_at',
        'payout_batch_id',
        'notes',
    ];

    protected $casts = [
        'invoice_amount' => 'float',
        'base_commission_pct' => 'float',
        'tier_bonus_pct' => 'float',
        'effective_commission_pct' => 'float',
        'commission_amount' => 'float',
        'month_index' => 'integer',
        'max_duration_months' => 'integer',
        'available_at' => 'datetime',
        'paid_at' => 'datetime',
    ];

    public function affiliate(): BelongsTo
    {
        return $this->belongsTo(Affiliate::class);
    }

    public function attribution(): BelongsTo
    {
        return $this->belongsTo(ReferralAttribution::class, 'referral_attribution_id');
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function payoutBatch(): BelongsTo
    {
        return $this->belongsTo(PayoutBatch::class);
    }
}
