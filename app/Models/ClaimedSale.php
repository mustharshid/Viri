<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClaimedSale extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'shift_id',
        'bank_account_id',
        'account_number',
        'bank_type',
        'transaction_id',
        'blaz_number',
        'reference_number',
        'transaction_date',
        'amount',
        'currency',
        'payer_name',
        'description',
        'sale_reference',
        'notes',
        'claimed_by_name',
        'claimed_at',
        'unclaimed_at',
        'status',
    ];

    protected $casts = [
        'transaction_date' => 'datetime',
        'claimed_at' => 'datetime',
        'unclaimed_at' => 'datetime',
        'amount' => 'float',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(CounterShift::class, 'shift_id');
    }

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class, 'bank_account_id');
    }
}
