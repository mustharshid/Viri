<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Terminal extends Model
{
    protected $hidden = ['settings_pin'];

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
        'credentials',
    ];

    protected $casts = [
        'pairing_code_expires_at' => 'datetime',
        'allow_debug_until' => 'datetime',
        'credentials' => 'array',
    ];

    protected $appends = ['has_settings_pin'];

    public function getHasSettingsPinAttribute(): bool
    {
        return ! is_null($this->attributes['settings_pin'] ?? null);
    }

    /**
     * Get permissions merged with defaults.
     * Handles both raw JSON strings and pre-decoded arrays.
     */
    public function getPermissionsAttribute($value): array
    {
        $defaults = [
            'verification_enabled' => true,
            'ledger_enabled' => true,
            'ledger_show_balance' => true,
            'ledger_show_debit' => true,
            'reports_enabled' => false,
            'statement_enabled' => false,
            'show_vbtl' => false,
            'sales_claiming_enabled' => true,
            'show_sale_reference_popover' => false,
            'shift_claim_report_enabled' => true,
        ];

        if (! $value) {
            return $defaults;
        }

        $decoded = is_array($value) ? $value : json_decode($value, true);

        return array_merge($defaults, $decoded ?: []);
    }

    /**
     * Store permissions as a JSON string.
     */
    public function setPermissionsAttribute($value): void
    {
        $this->attributes['permissions'] = is_array($value) ? json_encode($value) : $value;
    }

    public function setSettingsPinAttribute($value): void
    {
        $this->attributes['settings_pin'] = $value ? bcrypt($value) : null;
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
