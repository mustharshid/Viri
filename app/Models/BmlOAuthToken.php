<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BmlOAuthToken extends Model
{
    use HasFactory;

    protected $table = 'bml_oauth_tokens';

    protected $fillable = [
        'terminal_id',
        'bank_account_id',
        'bml_username',
        'profile_type',
        'access_token',
        'refresh_token',
        'token_type',
        'expires_in',
        'device_id',
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
}
