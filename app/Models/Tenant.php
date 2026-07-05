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
        'features'
    ];

    protected $casts = [
        'license_expires_at' => 'datetime',
        'lock_timeout' => 'integer',
        'max_terminals' => 'integer',
        'max_bank_accounts' => 'integer',
        'features' => 'array',
    ];

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
}
