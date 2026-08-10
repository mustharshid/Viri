<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReferralPerformanceTier extends Model
{
    protected $fillable = [
        'name',
        'min_monthly_sales',
        'bonus_commission_pct',
        'badge_color',
        'description',
        'sort_order',
    ];

    protected $casts = [
        'min_monthly_sales' => 'integer',
        'bonus_commission_pct' => 'float',
        'sort_order' => 'integer',
    ];

    public function affiliates(): HasMany
    {
        return $this->hasMany(Affiliate::class, 'current_tier_id');
    }
}
