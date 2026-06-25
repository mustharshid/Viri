<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BankAccountLock extends Model
{
    protected $primaryKey = 'bank_account_id';
    public $incrementing = false;

    protected $fillable = [
        'bank_account_id',
        'hardware_id',
        'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
    ];

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class);
    }
}
