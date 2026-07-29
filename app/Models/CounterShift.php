<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CounterShift extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'shift_number',
        'opened_at',
        'closed_at',
        'opened_by',
        'closed_by',
        'total_claimed_amount_mvr',
        'total_claimed_amount_usd',
        'total_claimed_count',
        'notes',
        'status',
    ];

    protected $casts = [
        'opened_at' => 'datetime',
        'closed_at' => 'datetime',
        'total_claimed_amount_mvr' => 'float',
        'total_claimed_amount_usd' => 'float',
        'total_claimed_count' => 'integer',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class);
    }

    public function claimedSales(): HasMany
    {
        return $this->hasMany(ClaimedSale::class, 'shift_id')->where('status', 'claimed');
    }
}
