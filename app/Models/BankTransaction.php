<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BankTransaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'bank_account_id',
        'transaction_hash',
        'amount',
        'transaction_date',
        'description',
        'reference',
    ];

    protected $casts = [
        'transaction_date' => 'date',
    ];

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class);
    }
}
