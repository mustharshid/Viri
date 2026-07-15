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
        'last_bank_fetch_at',
        'sync_version',
        'sync_requested_version',
        'fetch_in_progress_until',
        'fetch_started_at',
        'fetch_started_by_terminal_id',
        'last_successful_fetch_terminal_id',
    ];

    protected $casts = [
        'is_default'                         => 'boolean',
        'session_claimed_at'                 => 'datetime',
        'session_last_heartbeat_at'          => 'datetime',
        'last_bank_fetch_at'                 => 'datetime',
        'fetch_in_progress_until'            => 'datetime',
        'fetch_started_at'                   => 'datetime',
    ];

    protected $appends = ['has_api_token'];

    public function getHasApiTokenAttribute()
    {
        return \App\Models\BmlOAuthToken::where('bank_account_id', $this->id)->exists();
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function sessionHolder()
    {
        return $this->belongsTo(Terminal::class, 'session_holder_terminal_id');
    }

    public function fetchStartedByTerminal()
    {
        return $this->belongsTo(Terminal::class, 'fetch_started_by_terminal_id');
    }

    public function lastSuccessfulFetchTerminal()
    {
        return $this->belongsTo(Terminal::class, 'last_successful_fetch_terminal_id');
    }

    /**
     * Returns true if a live session holder exists (heartbeat within 30 seconds).
     */
    public function hasLiveSession(): bool
    {
        return $this->session_holder_terminal_id !== null
            && $this->session_last_heartbeat_at !== null
            && $this->session_last_heartbeat_at->diffInSeconds(now()) <= 20;
    }
}

