<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SyncExecutionLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'bank_account_id',
        'terminal_id',
        'request_id',
        'requested_at',
        'holder_received_at',
        'bank_fetch_started_at',
        'bank_fetch_completed_at',
        'result_received_at',
        'total_duration_ms',
        'status',
        'failure_reason',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'holder_received_at' => 'datetime',
        'bank_fetch_started_at' => 'datetime',
        'bank_fetch_completed_at' => 'datetime',
        'result_received_at' => 'datetime',
        'total_duration_ms' => 'integer',
    ];

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class);
    }

    public function terminal()
    {
        return $this->belongsTo(Terminal::class);
    }
}
