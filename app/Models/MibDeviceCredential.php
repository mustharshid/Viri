<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MibDeviceCredential extends Model
{
    use HasFactory;

    protected $fillable = [
        'terminal_id',
        'bank_account_id',
        'mib_username',
        'key1',
        'key2',
        'app_id',
        'obtained_at',
    ];

    protected $casts = [
        'obtained_at' => 'datetime',
    ];

    public function terminal()
    {
        return $this->belongsTo(Terminal::class);
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class);
    }
}
