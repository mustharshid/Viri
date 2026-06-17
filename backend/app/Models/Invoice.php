<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Invoice extends Model
{
    protected $fillable = [
        'tenant_id',
        'amount',
        'billing_period_start',
        'billing_period_end',
        'status'
    ];

    protected $casts = [
        'billing_period_start' => 'date',
        'billing_period_end' => 'date',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
