<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Terminal extends Model
{
    protected $fillable = [
        'tenant_id',
        'terminal_name',
        'hardware_id',
        'status',
        'pairing_code',
        'settings_pin',
        'pairing_code_expires_at',
        'debug_logs',
        'allow_debug_until',
        'debug_one_time_code',
        'permissions',
        'credentials'
    ];

    protected $casts = [
        'pairing_code_expires_at' => 'datetime',
        'allow_debug_until' => 'datetime',
        'permissions' => 'array',
        'credentials' => 'array'
    ];

    public function getPermissionsAttribute($value)
    {
        $defaults = [
            'verification_enabled' => true,
            'ledger_enabled' => true,
            'ledger_show_balance' => true,
            'ledger_show_debit' => true,
            'reports_enabled' => false,
            'show_vbtl' => false
        ];

        if (!$value) {
            return $defaults;
        }

        $decoded = is_array($value) ? $value : json_decode($value, true);
        return array_merge($defaults, $decoded ?: []);
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
