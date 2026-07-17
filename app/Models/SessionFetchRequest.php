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
        'expires_at',
        'holder_received_at',
        'bank_fetch_started_at',
        'bank_fetch_completed_at',
        'result_received_by_requester_at',
    ];

    protected $casts = [
        'result_json' => 'array',
        'target_amount' => 'decimal:2',
        'expires_at' => 'datetime',
        'holder_received_at' => 'datetime',
        'bank_fetch_started_at' => 'datetime',
        'bank_fetch_completed_at' => 'datetime',
        'result_received_by_requester_at' => 'datetime',
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
