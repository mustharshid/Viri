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
        'license_expires_at'
    ];

    protected $casts = [
        'license_expires_at' => 'datetime',
    ];

    public function terminals(): HasMany
    {
        return $this->hasMany(Terminal::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class);
    }
}
