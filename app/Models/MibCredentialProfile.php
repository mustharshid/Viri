<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MibCredentialProfile extends Model
{
    use HasFactory;

    protected $table = 'mib_credential_profiles';

    protected $fillable = [
        'credential_group_id',
        'profile_id',
        'profile_type',
        'profile_name',
    ];

    public function credentialGroup()
    {
        return $this->belongsTo(MibCredentialGroup::class, 'credential_group_id');
    }

    public function bankAccounts()
    {
        return $this->hasMany(BankAccount::class, 'mib_credential_profile_id');
    }
}
