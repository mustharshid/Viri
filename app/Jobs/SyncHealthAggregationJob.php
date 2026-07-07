<?php

namespace App\Jobs;

use App\Models\BankAccount;
use App\Services\SyncHealthService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SyncHealthAggregationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Execute the job.
     */
    public function handle(SyncHealthService $healthService): void
    {
        // 1. Recalculate health caches ONLY for active or recently changed accounts
        $activeAccountIds = DB::table('terminal_account_activity')
            ->where('updated_at', '>=', DB::raw('NOW() - INTERVAL 30 SECOND'))
            ->pluck('bank_account_id')
            ->unique();

        $changedAccountIds = BankAccount::where('last_bank_fetch_at', '>=', DB::raw('NOW() - INTERVAL 1 DAY'))
            ->orWhereRaw('sync_requested_version != sync_version')
            ->pluck('id');

        $targetAccountIds = $activeAccountIds->concat($changedAccountIds)->unique();

        foreach ($targetAccountIds as $accountId) {
            $healthService->recalculateAndCache($accountId);
            $this->runLockWatchdog($accountId);
        }

        // 2. Prune activity rows (>24 hours stale)
        DB::table('terminal_account_activity')
            ->where('updated_at', '<', DB::raw('NOW() - INTERVAL 24 HOUR'))
            ->delete();

        // 3. Purge metrics telemetry older than 90 days
        DB::table('sync_execution_logs')
            ->where('created_at', '<', DB::raw('NOW() - INTERVAL 90 DAY'))
            ->delete();

        // 4. Prune expired pending session requests (>1 minute stale)
        DB::table('session_fetch_requests')
            ->where('status', 'pending')
            ->where('expires_at', '<', DB::raw('CURRENT_TIMESTAMP - INTERVAL 1 MINUTE'))
            ->delete();
    }

    private function runLockWatchdog(int $accountId): void
    {
        $account = BankAccount::find($accountId);
        if (!$account) return;

        if ($account->fetch_in_progress_until
            && $account->fetch_in_progress_until->isPast()
            && $account->sync_requested_version > $account->sync_version) {
            
            // Watchdog detects a crashed extension that locked the account
            // Release the lock and write transition log
            BankAccount::where('id', $accountId)->update([
                'fetch_in_progress_until' => null,
                'fetch_started_by_terminal_id' => null,
            ]);
            
            dispatch(function () use ($account) {
                \App\Models\SessionActivityLog::create([
                    'tenant_id' => $account->tenant_id,
                    'bank_account_id' => $account->id,
                    'bank_name' => $account->bank_name,
                    'event_type' => 'fetch_lock_expired',
                    'event_summary' => "Watchdog cleared expired lock for {$account->bank_name}",
                    'created_at' => DB::raw('CURRENT_TIMESTAMP'),
                ]);
            })->afterResponse();
        }
    }
}
