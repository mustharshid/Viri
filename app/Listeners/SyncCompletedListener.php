<?php

namespace App\Listeners;

use App\Events\SyncCompleted;
use App\Models\SyncExecutionLog;
use App\Services\SyncHealthService;
use Illuminate\Support\Facades\DB;

class SyncCompletedListener
{
    public function __construct(
        protected SyncHealthService $healthService
    ) {}

    public function handle(SyncCompleted $event): void
    {
        // 1. Write telemetry log
        SyncExecutionLog::create([
            'bank_account_id' => $event->bankAccountId,
            'terminal_id' => $event->terminalId,
            'request_id' => $event->requestId,
            'requested_at' => $event->timestamps['requested_at'] ?? null,
            'holder_received_at' => $event->timestamps['holder_received_at'] ?? null,
            'bank_fetch_started_at' => $event->timestamps['bank_fetch_started_at'] ?? null,
            'bank_fetch_completed_at' => $event->timestamps['bank_fetch_completed_at'] ?? null,
            'result_received_at' => $event->timestamps['result_received_at'] ?? null,
            'total_duration_ms' => $event->durationMs,
            'status' => $event->status,
            'failure_reason' => $event->failureReason,
            'created_at' => DB::raw('CURRENT_TIMESTAMP'),
            'updated_at' => DB::raw('CURRENT_TIMESTAMP'),
        ]);

        // 2. Recalculate health and update cache
        $this->healthService->recalculateAndCache($event->bankAccountId, $event->status);
    }
}
