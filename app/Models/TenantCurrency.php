<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantCurrency extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'code',
        'name',
        'symbol',
        'buy_rate',
        'sell_rate',
        'is_active',
        'is_default',
    ];

    protected $casts = [
        'buy_rate' => 'float',
        'sell_rate' => 'float',
        'is_active' => 'boolean',
        'is_default' => 'boolean',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
