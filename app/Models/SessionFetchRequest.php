<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SessionFetchRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'bank_account_id',
        'requesting_terminal_id',
        'request_type',
        'target_amount',
        'status',
        'result_json',
        'error_message',
    ];

    protected $casts = [
        'result_json' => 'array',
        'target_amount' => 'decimal:2',
    ];

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class);
    }

    public function requestingTerminal()
    {
        return $this->belongsTo(Terminal::class, 'requesting_terminal_id');
    }
}
