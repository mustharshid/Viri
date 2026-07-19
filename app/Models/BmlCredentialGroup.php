<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BmlCredentialGroup extends Model
{
    use HasFactory;

    protected $table = 'bml_credential_groups';

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'bml_username',
        'profile_type',
        'access_token',
        'refresh_token',
        'device_id',
        'expires_in',
        'token_type',
        'last_grant',
        'obtained_at',
        'expires_at',
    ];

    protected $hidden = [
        'access_token',
        'refresh_token',
    ];

    protected $casts = [
        'obtained_at' => 'datetime',
        'expires_at' => 'datetime',
        'access_token' => 'encrypted',
        'refresh_token' => 'encrypted',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function terminal()
    {
        return $this->belongsTo(Terminal::class);
    }

    public function bankAccounts()
    {
        return $this->hasMany(BankAccount::class, 'bml_credential_group_id');
    }
}
