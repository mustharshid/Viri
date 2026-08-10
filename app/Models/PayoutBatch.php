<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayoutBatch extends Model
{
    protected $fillable = [
        'affiliate_id',
        'batch_reference',
        'amount',
        'payout_type',
        'bank_name',
        'account_number',
        'account_name',
        'status',
        'processed_by',
        'processed_at',
        'transaction_receipt_ref',
        'admin_notes',
    ];

    protected $casts = [
        'amount' => 'float',
        'processed_at' => 'datetime',
    ];

    public function affiliate(): BelongsTo
    {
        return $this->belongsTo(Affiliate::class);
    }

    public function processedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(Commission::class);
    }
}
