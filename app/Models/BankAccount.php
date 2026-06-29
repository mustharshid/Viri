<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BankAccount extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'bank_name',
        'account_name',
        'account_number',
        'mib_profile_type',
        'is_default',
        'label',
        'currency',
        'login_failures',
        'login_credentials_hash',
        'session_holder_terminal_id',
        'session_claimed_at',
        'session_last_heartbeat_at',
    ];

    protected $casts = [
        'is_default'              => 'boolean',
        'session_claimed_at'      => 'datetime',
        'session_last_heartbeat_at' => 'datetime',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function sessionHolder()
    {
        return $this->belongsTo(Terminal::class, 'session_holder_terminal_id');
    }

    /**
     * Returns true if a live session holder exists (heartbeat within 30 seconds).
     */
    public function hasLiveSession(): bool
    {
        return $this->session_holder_terminal_id !== null
            && $this->session_last_heartbeat_at !== null
            && $this->session_last_heartbeat_at->diffInSeconds(now()) <= 30;
    }
}

