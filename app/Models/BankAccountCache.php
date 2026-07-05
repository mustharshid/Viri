<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BankAccountCache extends Model
{
    protected $fillable = [
        'tenant_id',
        'bank_account_id',
        'balance',
        'transactions',
        'cached_at',
        'cached_by_terminal_id',
        'cache_version',
    ];

    protected $casts = [
        'transactions'  => 'array',
        'cached_at'     => 'datetime',
        'cache_version' => 'integer',
    ];

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class);
    }

    public function cachedBy(): BelongsTo
    {
        return $this->belongsTo(Terminal::class, 'cached_by_terminal_id');
    }
}
