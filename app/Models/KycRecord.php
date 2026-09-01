<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class KycRecord extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'cashier_user_id',
        'kyc_customer_id',
        'transaction_type',
        'transaction_amount',
        'transaction_currency',
        'transaction_reference',
        'transaction_purpose',
        'cdd_type',
        'rep_name',
        'rep_id_type',
        'rep_id_number',
        'rep_authority_reference',
        'is_not_physically_present',
        'transfer_direction',
        'originator_name',
        'originator_id_number',
        'originator_address',
        'beneficiary_name',
        'beneficiary_institution',
        'edd_status',
        'edd_source_of_wealth',
        'edd_source_of_funds',
        'edd_approved_by',
        'edd_approved_at',
        'is_suspicious',
        'str_flagged_at',
        'str_flagged_by',
        'str_notes',
        'str_pdf_path',
        'str_submitted_at',
        'requires_ctr',
        'ctr_submitted_at',
        'expires_at',
    ];

    protected $casts = [
        'transaction_amount' => 'decimal:2',
        'is_not_physically_present' => 'boolean',
        'is_suspicious' => 'boolean',
        'requires_ctr' => 'boolean',
        'str_flagged_at' => 'datetime',
        'str_submitted_at' => 'datetime',
        'ctr_submitted_at' => 'datetime',
        'edd_approved_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    /**
     * Automatically set expires_at (5-year retention per MMA §15) and
     * requires_ctr flag (≥ MVR 200,000 cash triggers CTR, §18-19).
     */
    protected static function booted(): void
    {
        static::creating(function (self $record) {
            $record->expires_at = now()->addYears(5);

            // Auto-flag CTR for large cash transactions ≥ MVR 200,000
            if ($record->transaction_currency === 'MVR' && $record->transaction_amount >= 200000) {
                $record->requires_ctr = true;
            }
        });
    }

    // ── Relationships ────────────────────────────────────────────────────────

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class);
    }

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cashier_user_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(KycCustomer::class, 'kyc_customer_id');
    }

    public function eddApprovedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'edd_approved_by');
    }

    public function strFlaggedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'str_flagged_by');
    }

    // ── Scopes ───────────────────────────────────────────────────────────────

    public function scopeSuspicious($query)
    {
        return $query->where('is_suspicious', true)->whereNull('str_submitted_at');
    }

    public function scopePendingEdd($query)
    {
        return $query->where('edd_status', 'pending_approval');
    }

    public function scopeRequiresCtr($query)
    {
        return $query->where('requires_ctr', true)->whereNull('ctr_submitted_at');
    }

    public function scopeExpiringSoon($query, int $days = 30)
    {
        return $query->whereBetween('expires_at', [now(), now()->addDays($days)]);
    }
}
