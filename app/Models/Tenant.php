<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Tenant extends Model
{
    protected $fillable = [
        'name',
        'company_logo',
        'status',
        'license_expires_at',
        'lock_timeout',
        'max_terminals',
        'max_bank_accounts',
        'features',
        'custom_verifications_limit',
    ];

    protected $casts = [
        'license_expires_at' => 'datetime',
        'lock_timeout' => 'integer',
        'max_terminals' => 'integer',
        'max_bank_accounts' => 'integer',
        'features' => 'array',
        'custom_verifications_limit' => 'integer',
    ];

    protected $appends = [
        'max_transaction_checks',
    ];

    public function getMaxTransactionChecksAttribute(): ?int
    {
        if ($this->custom_verifications_limit !== null) {
            return (int) $this->custom_verifications_limit;
        }
        $plan = SubscriptionPlan::where('tier_key', $this->subscription_tier ?? 'free')->first();
        if ($plan && $plan->max_transaction_checks !== null) {
            return (int) $plan->max_transaction_checks;
        }

        return $this->subscription_tier === 'free' ? 20 : ($this->subscription_tier === '499' ? 300 : 0);
    }

    public function terminals(): HasMany
    {
        return $this->hasMany(Terminal::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function paymentReceipts(): HasMany
    {
        return $this->hasMany(PaymentReceipt::class);
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class);
    }

    public function bankAccounts(): HasMany
    {
        return $this->hasMany(BankAccount::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function claimedSales(): HasMany
    {
        return $this->hasMany(ClaimedSale::class);
    }
}
