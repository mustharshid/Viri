<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;

class CredentialSyncRequest extends Model
{
    protected $fillable = [
        'tenant_id',
        'source_terminal_id',
        'target_terminal_id',
        'status',
        'passphrase',
        'encrypted_blob',
        'wrapped_dek',
        'kdf_salt',
        'gcm_iv',
        'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
    ];

    /**
     * Never expose sensitive fields in JSON responses.
     */
    protected $hidden = [
        'passphrase',
        'encrypted_blob',
        'wrapped_dek',
        'kdf_salt',
        'gcm_iv',
    ];

    /**
     * Scope: active (not expired, not completed/cancelled).
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query
            ->where('expires_at', '>', now())
            ->whereNotIn('status', ['completed', 'expired']);
    }

    public function sourceTerminal()
    {
        return $this->belongsTo(Terminal::class, 'source_terminal_id');
    }

    public function targetTerminal()
    {
        return $this->belongsTo(Terminal::class, 'target_terminal_id');
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    /**
     * Wipe all sensitive payload fields and mark as completed.
     */
    public function wipeAndComplete(): void
    {
        $this->update([
            'status'         => 'completed',
            'passphrase'     => null,
            'encrypted_blob' => null,
            'wrapped_dek'    => null,
            'kdf_salt'       => null,
            'gcm_iv'         => null,
        ]);
    }
}
