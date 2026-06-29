<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SessionActivityLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'terminal_name',
        'bank_account_id',
        'bank_name',
        'account_number_masked',
        'event_type',
        'event_summary',
        'event_detail',
        'masked_username',
        'ip_address',
        'session_holder_snapshot',
        'created_at',
    ];

    protected $casts = [
        'event_detail' => 'array',
        'created_at'   => 'datetime',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function terminal()
    {
        return $this->belongsTo(Terminal::class);
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class);
    }

    /**
     * Human-readable event type labels for the admin UI.
     */
    public static function eventLabel(string $eventType): string
    {
        return match($eventType) {
            'session_login_started'      => 'Login Started',
            'session_login_success'      => 'Login Successful',
            'session_login_failed'       => 'Login Failed',
            'session_claimed'            => 'Session Claimed',
            'session_heartbeat_lost'     => 'Heartbeat Lost',
            'session_released'           => 'Session Released',
            'session_expired_claimed'    => 'Expired Session Reclaimed',
            'session_logout'             => 'Logged Out',
            'fetch_request_submitted'    => 'Fetch Requested',
            'fetch_request_fulfilled'    => 'Fetch Fulfilled',
            'fetch_request_failed'       => 'Fetch Failed',
            'fetch_request_retried'      => 'Fetch Retried (Failover)',
            'verification_search'        => 'Transfer Verified',
            'verification_no_match'      => 'Transfer Not Found',
            'ledger_sync'                => 'Ledger Synced',
            'race_won'                   => 'Session Race Won',
            'race_lost_delegating'       => 'Session Race Lost — Delegating',
            default                      => $eventType,
        };
    }

    /**
     * Colour category for admin UI.
     * Returns: 'success' | 'error' | 'warning' | 'neutral'
     */
    public static function eventSeverity(string $eventType): string
    {
        return match(true) {
            in_array($eventType, [
                'session_login_success', 'session_claimed', 'fetch_request_fulfilled',
                'verification_search', 'race_won', 'session_released', 'ledger_sync',
            ]) => 'success',
            in_array($eventType, [
                'session_login_failed', 'fetch_request_failed', 'verification_no_match',
            ]) => 'error',
            in_array($eventType, [
                'session_heartbeat_lost', 'session_expired_claimed', 'fetch_request_retried',
                'race_lost_delegating',
            ]) => 'warning',
            default => 'neutral',
        };
    }
}
