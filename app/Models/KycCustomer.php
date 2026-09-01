<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class KycCustomer extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'nic_number',
        'passport_number',
        'customer_type',
        'full_name',
        'aliases',
        'nationality',
        'dob',
        'address',
        'contact_number',
        'email',
        'company_registration_number',
        'beneficial_owner_name',
        'beneficial_owner_id_type',
        'beneficial_owner_id_number',
        'beneficial_owner_nationality',
        'directors_json',
        'is_pep',
        'is_high_risk_country',
        'risk_level',
        'id_document_local_path',
        'id_document_captured_at',
        'created_by',
        'last_updated_by',
    ];

    protected $casts = [
        'dob' => 'date',
        'id_document_captured_at' => 'datetime',
        'directors_json' => 'array',
        'is_pep' => 'boolean',
        'is_high_risk_country' => 'boolean',
    ];

    /**
     * Auto-flag is_high_risk_country based on nationality when saving.
     */
    protected static function booted(): void
    {
        static::saving(function (self $customer) {
            if ($customer->isDirty('nationality') && $customer->nationality) {
                $highRisk = DB::table('kyc_high_risk_countries')
                    ->where('country_name', $customer->nationality)
                    ->exists();
                $customer->is_high_risk_country = $highRisk;
            }
        });
    }

    // ── Relationships ────────────────────────────────────────────────────────

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function lastUpdatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'last_updated_by');
    }

    public function kycRecords(): HasMany
    {
        return $this->hasMany(KycRecord::class);
    }

    // ── Scopes ───────────────────────────────────────────────────────────────

    /**
     * Scope to search by NIC or Passport prefix (used in full-text search endpoint).
     */
    public function scopeSearch($query, string $term)
    {
        return $query->where(function ($q) use ($term) {
            $q->where('nic_number', 'like', $term . '%')
              ->orWhere('passport_number', 'like', $term . '%')
              ->orWhere('full_name', 'like', '%' . $term . '%');
        });
    }
}
