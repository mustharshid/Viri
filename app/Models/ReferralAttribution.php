<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReferralAttribution extends Model
{
    protected $fillable = [
        'affiliate_id',
        'tenant_id',
        'applied_referral_code',
        'discount_type',
        'discount_value',
        'first_invoice_discount_amount',
        'initial_plan_key',
        'payout_duration_limit_months',
        'invoices_commissioned_count',
        'attributed_at',
        'expires_at',
        'status',
    ];

    protected $casts = [
        'discount_value' => 'float',
        'first_invoice_discount_amount' => 'float',
        'payout_duration_limit_months' => 'integer',
        'invoices_commissioned_count' => 'integer',
        'attributed_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function affiliate(): BelongsTo
    {
        return $this->belongsTo(Affiliate::class);
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(Commission::class);
    }
}
