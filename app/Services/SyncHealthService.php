<?php

namespace App\Services;

use App\Models\BankAccount;
use App\Models\SyncExecutionLog;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class SyncHealthService
{
    /**
     * Recalculate health for an account and update the Laravel Cache.
     */
    public function recalculateAndCache(int $accountId, ?string $latestStatus = null): array
    {
        $account = BankAccount::find($accountId);
        if (!$account) {
            return [];
        }

        $cacheKey = "sync_health_summary_{$accountId}";
        $summary = Cache::get($cacheKey, [
            'status' => 'healthy',
            'sync_confidence_score' => 100,
            'active_terminals' => 0,
            'last_sync_at' => null,
            'avg_latency_ms' => 0,
            'p95_latency_ms' => 0,
            'failed_today' => 0,
            'consecutive_failures_count' => 0,
            'pending_backlog' => 0,
            'total_requests_count' => 0,
            'actual_fetches_count' => 0,
            'sync_efficiency' => 0,
            'calculated_at' => null,
        ]);

        // If a status just occurred, update stats incrementally
        if ($latestStatus !== null) {
            $summary['total_requests_count'] = ($summary['total_requests_count'] ?? 0) + 1;
            if ($latestStatus === 'success') {
                $summary['actual_fetches_count'] = ($summary['actual_fetches_count'] ?? 0) + 1;
                $summary['consecutive_failures_count'] = 0;
            } elseif ($latestStatus === 'failed') {
                $summary['consecutive_failures_count'] = ($summary['consecutive_failures_count'] ?? 0) + 1;
            }
        }

        // Live queries for real-time aggregation from sync_execution_logs
        $logs = SyncExecutionLog::where('bank_account_id', $accountId)
            ->where('created_at', '>=', DB::raw('NOW() - INTERVAL 24 HOUR'))
            ->get();

        $summary['failed_today'] = $logs->where('status', 'failed')->count();

        // Calculate average and p95 latency
        $successLogs = $logs->where('status', 'success')->whereNotNull('total_duration_ms');
        if ($successLogs->isNotEmpty()) {
            $durations = $successLogs->pluck('total_duration_ms')->sort()->values();
            $summary['avg_latency_ms'] = (int) round($durations->avg());
            
            // p95 latency
            $p95Index = (int) ceil($durations->count() * 0.95) - 1;
            $summary['p95_latency_ms'] = $durations->get(max(0, $p95Index));
        } else {
            $summary['avg_latency_ms'] = 0;
            $summary['p95_latency_ms'] = 0;
        }

        // Active observers count
        $summary['active_terminals'] = DB::table('terminal_account_activity')
            ->where('bank_account_id', $accountId)
            ->where('updated_at', '>=', DB::raw('NOW() - INTERVAL 30 SECOND'))
            ->count();

        $summary['last_sync_at'] = $account->last_bank_fetch_at ? $account->last_bank_fetch_at->toDateTimeString() : null;
        $summary['pending_backlog'] = max(0, $account->sync_requested_version - $account->sync_version);

        // Sync efficiency KPI
        if ($summary['total_requests_count'] > 0) {
            $summary['sync_efficiency'] = (int) round((1 - ($summary['actual_fetches_count'] / $summary['total_requests_count'])) * 100);
        } else {
            $summary['sync_efficiency'] = 0;
        }

        // Compute confidence score
        $score = $this->calculateConfidenceScore($account, $summary);
        $summary['sync_confidence_score'] = $score;

        // Health status evaluation
        $oldStatus = $summary['status'] ?? 'healthy';
        $newStatus = 'healthy';
        if ($score < 40) {
            $newStatus = 'critical';
        } elseif ($score < 70) {
            $newStatus = 'degraded';
        }
        $summary['status'] = $newStatus;

        $summary['calculated_at'] = now()->toDateTimeString();

        Cache::forever($cacheKey, $summary);

        // Transition-only logging
        if ($oldStatus !== $newStatus) {
            $this->logHealthTransition($account, $oldStatus, $newStatus, $score);
        }

        return $summary;
    }

    private function calculateConfidenceScore(BankAccount $account, array $summary): int
    {
        $score = 0;
        $lastFetch = $account->last_bank_fetch_at
            ? now()->diffInSeconds($account->last_bank_fetch_at)
            : PHP_INT_MAX;

        // Freshness bonuses
        if ($lastFetch < 30) {
            $score += 40;
        }
        if ($lastFetch < 300) {
            $score += 30;
        } elseif ($lastFetch < 600) {
            $score += 15;
        }

        // Holder health
        if ($account->session_holder_terminal_id) {
            $score += 20;
        }

        // No failures today
        if (($summary['failed_today'] ?? 0) === 0) {
            $score += 10;
        }

        // Penalties
        $score -= min(30, ($summary['failed_today'] ?? 0) * 10);

        // Consecutive failure penalty (3 in a row is critical)
        $consecutive = $summary['consecutive_failures_count'] ?? 0;
        if ($consecutive >= 3) {
            $score -= 40;
        } else {
            $score -= ($consecutive * 15);
        }

        // Backlog penalty
        $backlog = $summary['pending_backlog'] ?? 0;
        $score -= min(20, $backlog * 5);

        // Watchdog penalty
        if ($account->fetch_in_progress_until
            && $account->fetch_in_progress_until->isPast()
            && $backlog > 0) {
            $score -= 25;
        }

        return max(0, min(100, $score));
    }

    private function logHealthTransition(BankAccount $account, string $old, string $new, int $score): void
    {
        // We log transition to session_activity_logs via deferred dispatch
        dispatch(function () use ($account, $old, $new, $score) {
            \App\Models\SessionActivityLog::create([
                'tenant_id' => $account->tenant_id,
                'bank_account_id' => $account->id,
                'bank_name' => $account->bank_name,
                'event_type' => 'sync_health_changed',
                'event_summary' => "Account {$account->bank_name} health changed from {$old} to {$new} (Confidence: {$score}%)",
                'created_at' => DB::raw('CURRENT_TIMESTAMP'),
            ]);
        })->afterResponse();
    }
}
