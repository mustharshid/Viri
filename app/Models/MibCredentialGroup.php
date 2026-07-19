<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MibCredentialGroup extends Model
{
    use HasFactory;

    protected $table = 'mib_credential_groups';

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'mib_username',
        'key1',
        'key2',
        'app_id',
        'obtained_at',
    ];

    protected $casts = [
        'obtained_at' => 'datetime',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function terminal()
    {
        return $this->belongsTo(Terminal::class);
    }

    public function profiles()
    {
        return $this->hasMany(MibCredentialProfile::class, 'credential_group_id');
    }
}
