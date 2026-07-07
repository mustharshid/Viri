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
        'required_sync_version',
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

    protected static function booted()
    {
        static::updated(function ($request) {
            if ($request->isDirty('status')) {
                $requester = $request->requestingTerminal;
                if ($requester) {
                    if (in_array($request->status, ['fulfilled', 'failed'])) {
                        TerminalEvent::create([
                            'hardware_id' => $requester->hardware_id,
                            'event_type'  => 'verify_request_completed',
                            'payload'     => [
                                'request_id'      => $request->id,
                                'status'          => $request->status,
                                'error'           => $request->error_message,
                                'bank_account_id' => $request->bank_account_id,
                            ]
                        ]);
                    } elseif ($request->status === 'syncing') {
                        TerminalEvent::create([
                            'hardware_id' => $requester->hardware_id,
                            'event_type'  => 'verify_request_acknowledged',
                            'payload'     => [
                                'request_id'      => $request->id,
                                'status'          => $request->status,
                            ]
                        ]);
                    }
                }
            }
        });
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class);
    }

    public function requestingTerminal()
    {
        return $this->belongsTo(Terminal::class, 'requesting_terminal_id');
    }
}
