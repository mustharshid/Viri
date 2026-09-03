<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\BankAccountLock;
use App\Models\BmlCredentialGroup;
use App\Models\MibCredentialGroup;
use App\Models\MibCredentialProfile;
use App\Models\PaymentReceipt;
use App\Models\SessionActivityLog;
use App\Models\SessionFetchRequest;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use App\Models\Terminal;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Database\QueryException;

class SuperadminController extends Controller
{
    public function listCompanies(Request $request)
    {
        $perPage = min((int) $request->input('per_page', 10), 200);
        $companies = Tenant::with('terminals', 'bankAccounts', 'users')
            ->withCount('claimedSales')
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);

        $companies->getCollection()->transform(function ($tenant) {
            $lastLog = SessionActivityLog::where('tenant_id', $tenant->id)
                ->latest('created_at')
                ->first();

            $tenant->last_activity_at = $lastLog ? $lastLog->created_at->toIso8601String() : ($tenant->updated_at ? $tenant->updated_at->toIso8601String() : null);
            $tenant->verifications_used = $tenant->verifications_count ?? 0;

            return $tenant;
        });

        return response()->json($companies);
    }

    public function updateCompany(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:pending,active,suspended,archived',
            'subscription_tier' => 'required|string',
            'lock_timeout' => 'sometimes|integer|min:5|max:300',
            'max_terminals' => 'sometimes|integer|min:1',
            'max_bank_accounts' => 'sometimes|integer|min:1',
            'license_expires_at' => 'sometimes|nullable|date',
            'features' => 'sometimes|nullable|array',
            'custom_verifications_limit' => 'sometimes|nullable|integer|min:0',
        ]);

        $tenant = Tenant::findOrFail($id);

        $oldTier = $tenant->subscription_tier;
        $tenant->status = $request->status;
        $tenant->subscription_tier = $request->subscription_tier;

        if ($request->has('lock_timeout')) {
            $tenant->lock_timeout = $request->lock_timeout;
        }
        if ($request->has('license_expires_at')) {
            $tenant->license_expires_at = $request->license_expires_at;
        }
        if ($request->has('max_terminals')) {
            $tenant->max_terminals = $request->max_terminals;
        }
        if ($request->has('max_bank_accounts')) {
            $tenant->max_bank_accounts = $request->max_bank_accounts;
        }
        if ($request->has('custom_verifications_limit')) {
            $tenant->custom_verifications_limit = $request->custom_verifications_limit;
        }

        // Features updates
        $plan = SubscriptionPlan::where('tier_key', $request->subscription_tier)->first();
        if ($request->filled('features') && is_array($request->features)) {
            $tenant->features = $request->features;
        } else {
            // If features is missing or empty, or tier changed, apply plan defaults if tenant has no features
            if (($oldTier !== $request->subscription_tier || empty($tenant->features)) && $plan) {
                $tenant->features = $plan->features ?? [];
                if (! $request->has('max_terminals')) {
                    $tenant->max_terminals = $plan->max_terminals;
                }
                if (! $request->has('max_bank_accounts')) {
                    $tenant->max_bank_accounts = $plan->max_bank_accounts;
                }
                if (! $request->has('lock_timeout')) {
                    $tenant->lock_timeout = $plan->lock_timeout;
                }
            }
        }

        $tenant->save();

        if ($request->status === 'active') {
            User::where('tenant_id', $tenant->id)->update(['status' => 'approved']);
        }

        return response()->json(['message' => 'Company updated successfully', 'company' => $tenant->load('users')]);
    }

    public function viewTerminalLog(Request $request, $id)
    {
        $request->validate([
            'one_time_code' => 'required|string',
        ]);

        $terminal = Terminal::findOrFail($id);

        if (! $terminal->allow_debug_until || now()->greaterThan($terminal->allow_debug_until)) {
            return response()->json(['error' => 'Debug access is not enabled or has expired for this terminal.'], 403);
        }

        if (! $terminal->debug_one_time_code || $terminal->debug_one_time_code !== strtoupper($request->one_time_code)) {
            return response()->json(['error' => 'Invalid debug one-time code.'], 403);
        }

        $logs = json_decode($terminal->debug_logs, true) ?? [];

        // Clear the one-time code immediately upon first successful view
        $terminal->update([
            'debug_one_time_code' => null,
            'allow_debug_until' => null,
        ]);

        return response()->json([
            'terminal_name' => $terminal->terminal_name,
            'logs' => $logs,
        ]);
    }

    public function updateTerminal(Request $request, $id)
    {
        $request->validate([
            'show_vbtl' => 'required|boolean',
        ]);

        $terminal = Terminal::findOrFail($id);
        $permissions = $terminal->permissions;
        $permissions['show_vbtl'] = (bool) $request->show_vbtl;
        $terminal->permissions = $permissions;
        $terminal->save();

        return response()->json(['message' => 'Terminal updated successfully', 'terminal' => $terminal]);
    }

    public function getSessionLogs(Request $request)
    {
        // 1. Paginated table rows (Lightweight: excludes event_detail column for blazing list speed)
        //    Diagnostic fields (response_ms / sw_alive / lastError / error / restart count) are
        //    extracted from event_detail as cheap scalar columns so the panel can surface them
        //    inline without loading the full JSON.
        $query = SessionActivityLog::with(['tenant', 'terminal', 'bankAccount'])
            ->select([
                'id',
                'tenant_id',
                'terminal_id',
                'terminal_name',
                'bank_account_id',
                'bank_name',
                'account_number_masked',
                'event_type',
                'event_summary',
                'masked_username',
                'created_at',
                \Illuminate\Support\Facades\DB::raw('CASE WHEN event_detail IS NOT NULL THEN 1 ELSE 0 END as has_detail'),
                \Illuminate\Support\Facades\DB::raw("JSON_UNQUOTE(JSON_EXTRACT(event_detail, '$.response_ms')) as diag_response_ms"),
                \Illuminate\Support\Facades\DB::raw("JSON_UNQUOTE(JSON_EXTRACT(event_detail, '$.sw_alive')) as diag_sw_alive"),
                \Illuminate\Support\Facades\DB::raw("JSON_UNQUOTE(JSON_EXTRACT(event_detail, '$.lastError')) as diag_last_error"),
                \Illuminate\Support\Facades\DB::raw("JSON_UNQUOTE(JSON_EXTRACT(event_detail, '$.error')) as diag_error"),
                \Illuminate\Support\Facades\DB::raw("JSON_UNQUOTE(JSON_EXTRACT(event_detail, '$.sw_restart_count')) as diag_sw_restart_count"),
                \Illuminate\Support\Facades\DB::raw("JSON_UNQUOTE(JSON_EXTRACT(event_detail, '$.sw_started_at')) as diag_sw_started_at"),
            ])
            ->orderBy('created_at', 'desc');

        if ($request->filled('tenant_id')) {
            $query->where('tenant_id', $request->tenant_id);
        }
        if ($request->filled('terminal_id')) {
            $query->where('terminal_id', $request->terminal_id);
        }
        if ($request->filled('bank_account_id')) {
            $query->where('bank_account_id', $request->bank_account_id);
        }
        if ($request->filled('event_type')) {
            $query->where('event_type', $request->event_type);
        }
        if ($request->filled('start_date')) {
            $query->where('created_at', '>=', $request->start_date);
        }
        if ($request->filled('end_date')) {
            $query->where('created_at', '<=', $request->end_date);
        }

        $logs = $query->paginate($request->input('per_page', 50));
        $response = $logs->toArray();

        // 2. Fetch or Compute Telemetry from Cache (30s cache TTL)
        $telemetry = Cache::remember('superadmin_session_telemetry_v3', 30, function () {
            $now = \Carbon\Carbon::now('UTC');
            $nowMvt = \Carbon\Carbon::now('+05:00');
            $twentyFourHoursAgo = $now->copy()->subHours(24);
            $thirtyDaysAgo = $now->copy()->subDays(30);
            $sevenDaysAgo = $now->copy()->subDays(7)->startOfDay();

            $totalTerminals = Terminal::count();
            
            // Active terminals in last 15 mins (Indexed)
            $activeTerminals = SessionActivityLog::where('created_at', '>=', $now->copy()->subMinutes(15))
                ->whereNotNull('terminal_id')
                ->distinct('terminal_id')
                ->count('terminal_id');

            // Total requests past 24h
            $totalLogs24h = SessionActivityLog::where('created_at', '>=', $twentyFourHoursAgo)->count();

            // Requests per hour (past 24h) converted to GMT+5
            $hourlyData = SessionActivityLog::where('created_at', '>=', $twentyFourHoursAgo)
                ->select(
                    \Illuminate\Support\Facades\DB::raw("DATE_FORMAT(DATE_ADD(created_at, INTERVAL 5 HOUR), '%Y-%m-%d %H:00:00') as hour"),
                    \Illuminate\Support\Facades\DB::raw('count(*) as count')
                )
                ->groupBy('hour')
                ->pluck('count', 'hour')
                ->toArray();

            $hourlySpectrum = [];
            for ($i = 23; $i >= 0; $i--) {
                $hKey = $nowMvt->copy()->subHours($i)->format('Y-m-d H:00:00');
                $hLabel = $nowMvt->copy()->subHours($i)->format('H:00');
                $hourlySpectrum[] = [
                    'hour' => $hLabel,
                    'count' => isset($hourlyData[$hKey]) ? (int)$hourlyData[$hKey] : 0,
                ];
            }

            // 30-Day Monthly Trends (Single Vectorized Grouped Query)
            $monthlyRows = SessionActivityLog::where('created_at', '>=', $thirtyDaysAgo)
                ->select(
                    \Illuminate\Support\Facades\DB::raw('DATE(created_at) as m_date'),
                    \Illuminate\Support\Facades\DB::raw('count(*) as req_count'),
                    \Illuminate\Support\Facades\DB::raw('count(distinct terminal_id) as term_count')
                )
                ->groupBy('m_date')
                ->get()
                ->keyBy('m_date');

            $monthlyTrends = [];
            for ($m = 29; $m >= 0; $m--) {
                $mStart = $now->copy()->subDays($m)->startOfDay();
                $mDate = $mStart->format('Y-m-d');
                $mDay = $mStart->format('d');
                $matchedRow = $monthlyRows->get($mDate);

                $monthlyTrends[] = [
                    'date' => $mDate,
                    'day' => $mDay,
                    'label' => $mStart->format('M d'),
                    'requests' => $matchedRow ? (int)$matchedRow->req_count : 0,
                    'active_terminals' => $matchedRow ? (int)$matchedRow->term_count : 0,
                ];
            }

            // Success / Error ratios past 24h & 30d (Single Aggregates)
            $counts24h = SessionActivityLog::where('created_at', '>=', $twentyFourHoursAgo)
                ->selectRaw("
                    SUM(CASE WHEN event_type IN ('fetch_request_failed', 'session_login_failed', 'session_heartbeat_lost') THEN 1 ELSE 0 END) as failed_cnt,
                    SUM(CASE WHEN event_type IN ('fetch_request_fulfilled', 'session_login_success', 'session_claimed') THEN 1 ELSE 0 END) as success_cnt
                ")
                ->first();

            $failed24h = (int)($counts24h->failed_cnt ?? 0);
            $success24h = (int)($counts24h->success_cnt ?? 0);
            $errorRatio24h = $totalLogs24h > 0 ? round(($failed24h / $totalLogs24h) * 100, 1) : 0.0;
            $totalEvaluated24h = $success24h + $failed24h;
            $successRateDaily = $totalEvaluated24h > 0 ? round(($success24h / $totalEvaluated24h) * 100, 1) : 100.0;

            // 1-Hour Error Ratio & 60-minute sparkline (6 x 10-minute buckets)
            $oneHourAgo = $now->copy()->subHour();
            $counts1h = SessionActivityLog::where('created_at', '>=', $oneHourAgo)
                ->selectRaw("
                    count(*) as total_cnt,
                    SUM(CASE WHEN event_type IN ('fetch_request_failed', 'session_login_failed', 'session_heartbeat_lost', 'extension_port_disconnected') THEN 1 ELSE 0 END) as failed_cnt
                ")
                ->first();

            $total1h = (int)($counts1h->total_cnt ?? 0);
            $failed1h = (int)($counts1h->failed_cnt ?? 0);
            $errorRatio1h = $total1h > 0 ? round(($failed1h / $total1h) * 100, 1) : 0.0;

            $errorTrend1h = 'stable';
            $errorDelta1h = round($errorRatio1h - $errorRatio24h, 1);
            if ($errorDelta1h > 0.3) {
                $errorTrend1h = 'up';
            } elseif ($errorDelta1h < -0.3) {
                $errorTrend1h = 'down';
            }

            $sparkline1h = [];
            for ($b = 5; $b >= 0; $b--) {
                $bucketStart = $now->copy()->subMinutes(($b + 1) * 10);
                $bucketEnd = $now->copy()->subMinutes($b * 10);
                $bRow = SessionActivityLog::where('created_at', '>=', $bucketStart)
                    ->where('created_at', '<', $bucketEnd)
                    ->selectRaw("
                        count(*) as total_cnt,
                        SUM(CASE WHEN event_type IN ('fetch_request_failed', 'session_login_failed', 'session_heartbeat_lost', 'extension_port_disconnected') THEN 1 ELSE 0 END) as failed_cnt
                    ")
                    ->first();
                $bTotal = (int)($bRow->total_cnt ?? 0);
                $bFailed = (int)($bRow->failed_cnt ?? 0);
                $bRatio = $bTotal > 0 ? round(($bFailed / $bTotal) * 100, 1) : 0.0;
                $sparkline1h[] = [
                    'label' => ($b * 10) === 0 ? 'Now' : ($b * 10) . 'm',
                    'total' => $bTotal,
                    'failed' => $bFailed,
                    'error_ratio' => $bRatio,
                ];
            }

            $counts30d = SessionActivityLog::where('created_at', '>=', $thirtyDaysAgo)
                ->selectRaw("
                    SUM(CASE WHEN event_type IN ('fetch_request_failed', 'session_login_failed', 'session_heartbeat_lost') THEN 1 ELSE 0 END) as failed_cnt,
                    SUM(CASE WHEN event_type IN ('fetch_request_fulfilled', 'session_login_success', 'session_claimed') THEN 1 ELSE 0 END) as success_cnt
                ")
                ->first();
            $failed30d = (int)($counts30d->failed_cnt ?? 0);
            $success30d = (int)($counts30d->success_cnt ?? 0);
            $totalEvaluated30d = $success30d + $failed30d;
            $successRateMonthly = $totalEvaluated30d > 0 ? round(($success30d / $totalEvaluated30d) * 100, 1) : 100.0;

            // Helper lambda to calculate real API time from pwa_logs timestamps
            $calcRealApiTimeFromDebugLog = function ($logItem) {
                if (!$logItem || !is_array($logItem->event_detail) || empty($logItem->event_detail['pwa_logs'])) {
                    return null;
                }
                $lines = $logItem->event_detail['pwa_logs'];
                $timestamps = [];
                foreach ($lines as $line) {
                    if (is_string($line) && preg_match('/\[(\d{2}:\d{2}:\d{2})\]/', $line, $m)) {
                        $timestamps[] = strtotime($m[1]);
                    }
                }
                if (count($timestamps) >= 2) {
                    return max($timestamps) - min($timestamps);
                }
                return null;
            };

            // 7-Day Weekly Trends (Single Vectorized Grouped Query)
            $weeklyRows = SessionActivityLog::where('created_at', '>=', $sevenDaysAgo)
                ->select(
                    \Illuminate\Support\Facades\DB::raw('DATE(created_at) as w_date'),
                    \Illuminate\Support\Facades\DB::raw('count(*) as total_cnt'),
                    \Illuminate\Support\Facades\DB::raw("SUM(CASE WHEN event_type IN ('fetch_request_failed', 'session_login_failed', 'session_heartbeat_lost') THEN 1 ELSE 0 END) as failed_cnt"),
                    \Illuminate\Support\Facades\DB::raw("SUM(CASE WHEN event_type IN ('fetch_request_fulfilled', 'session_login_success', 'session_claimed') THEN 1 ELSE 0 END) as success_cnt")
                )
                ->groupBy('w_date')
                ->get()
                ->keyBy('w_date');

            // Sample recent debug logs for duration / latency benchmarks (bounded to 100 recent rows)
            $sampleDebugLogs = SessionActivityLog::where('created_at', '>=', $sevenDaysAgo)
                ->where('event_type', 'pwa_debug_logs')
                ->latest('created_at')
                ->take(100)
                ->get();

            $debugTimesByDate = [];
            foreach ($sampleDebugLogs as $dbg) {
                $dKey = \Carbon\Carbon::parse($dbg->created_at)->format('Y-m-d');
                $t = $calcRealApiTimeFromDebugLog($dbg);
                if ($t !== null && $t > 0) {
                    $debugTimesByDate[$dKey][] = $t;
                }
            }

            $weeklyTrends = [];
            for ($d = 6; $d >= 0; $d--) {
                $dayStart = $now->copy()->subDays($d)->startOfDay();
                $dayLabel = $dayStart->format('D');
                $dateStr = $dayStart->format('Y-m-d');
                $wRow = $weeklyRows->get($dateStr);

                $dayTotal = $wRow ? (int)$wRow->total_cnt : 0;
                $dayFailed = $wRow ? (int)$wRow->failed_cnt : 0;
                $daySuccess = $wRow ? (int)$wRow->success_cnt : 0;
                $dayEvaluated = $daySuccess + $dayFailed;

                $wSuccessRate = $dayEvaluated > 0 ? round(($daySuccess / $dayEvaluated) * 100, 1) : 100.0;
                $wErrorRate = $dayTotal > 0 ? round(($dayFailed / $dayTotal) * 100, 1) : 0.0;

                $apiTimes = $debugTimesByDate[$dateStr] ?? [];
                $wAvgRealApiTime = count($apiTimes) > 0 ? round(array_sum($apiTimes) / count($apiTimes), 1) : 0.0;

                $weeklyTrends[] = [
                    'day' => $dayLabel,
                    'date' => $dateStr,
                    'success_rate' => $wSuccessRate,
                    'error_rate' => $wErrorRate,
                    'avg_request_duration' => $wAvgRealApiTime > 0 ? $wAvgRealApiTime + 1.2 : 0.0,
                    'avg_real_api_time' => $wAvgRealApiTime,
                    'total' => $dayTotal,
                ];
            }

            // Terminal Throughput (requests per terminal in last 24h)
            $terminalThroughput = SessionActivityLog::with('tenant')
                ->where('created_at', '>=', $twentyFourHoursAgo)
                ->select('tenant_id', 'terminal_name', \Illuminate\Support\Facades\DB::raw('count(*) as count'))
                ->groupBy('tenant_id', 'terminal_name')
                ->orderBy('count', 'desc')
                ->take(6)
                ->get()
                ->map(function ($item) {
                    return [
                        'name' => $item->terminal_name ?: 'System',
                        'tenant_name' => $item->tenant ? $item->tenant->name : 'N/A',
                        'count' => (int)$item->count,
                    ];
                });

            // Current Hour Live API Requests & Active Terminals Breakdown
            $oneHourAgo = $now->copy()->subHour();
            $currentHourTotal = SessionActivityLog::where('created_at', '>=', $oneHourAgo)->count();

            $currentHourTerminalsRaw = SessionActivityLog::with(['tenant', 'terminal'])
                ->where('created_at', '>=', $oneHourAgo)
                ->select('terminal_id', 'terminal_name', 'tenant_id', \Illuminate\Support\Facades\DB::raw('count(*) as count'), \Illuminate\Support\Facades\DB::raw('MAX(created_at) as last_activity'))
                ->groupBy('terminal_id', 'terminal_name', 'tenant_id')
                ->orderBy('last_activity', 'desc')
                ->take(5)
                ->get();

            $currentHourTerminals = $currentHourTerminalsRaw->map(function ($item) use ($oneHourAgo) {
                $lastLog = SessionActivityLog::where(function ($q) use ($item) {
                    if ($item->terminal_id) $q->where('terminal_id', $item->terminal_id);
                    if ($item->terminal_name) $q->orWhere('terminal_name', $item->terminal_name);
                })->latest('created_at')->first();

                $accountsBreakdown = SessionActivityLog::where('created_at', '>=', $oneHourAgo)
                    ->where(function($q) use ($item) {
                        if ($item->terminal_id) $q->where('terminal_id', $item->terminal_id);
                        if ($item->terminal_name) $q->orWhere('terminal_name', $item->terminal_name);
                    })
                    ->whereNotNull('account_number_masked')
                    ->where('account_number_masked', '!=', '')
                    ->select('bank_name', 'account_number_masked', \Illuminate\Support\Facades\DB::raw('count(*) as account_count'))
                    ->groupBy('bank_name', 'account_number_masked')
                    ->orderBy('account_count', 'desc')
                    ->take(5)
                    ->get()
                    ->map(function($acc) {
                        return [
                            'bank_name' => $acc->bank_name ?: 'Bank API',
                            'account_number_masked' => $acc->account_number_masked,
                            'count' => (int)$acc->account_count,
                        ];
                    })->values()->toArray();

                return [
                    'terminal_id' => $item->terminal_id,
                    'terminal_name' => $item->terminal_name ?: ($item->terminal ? $item->terminal->terminal_name : 'System'),
                    'tenant_name' => $item->tenant ? $item->tenant->name : 'N/A',
                    'count' => (int)$item->count,
                    'last_activity_mvt' => \Carbon\Carbon::parse($item->last_activity)->setTimezone('+05:00')->format('H:i:s'),
                    'last_bank' => $lastLog ? ($lastLog->bank_name ?: 'Bank API') : '',
                    'last_account' => $lastLog ? ($lastLog->account_number_masked ?: '') : '',
                    'last_summary' => $lastLog ? ($lastLog->event_summary ?: $lastLog->event_type) : '',
                    'accounts' => $accountsBreakdown,
                ];
            });

            // Grouped Session Request Flows (Last 60 records)
            $rawGroupLogs = SessionActivityLog::with(['tenant', 'terminal'])
                ->select([
                    'id', 'tenant_id', 'terminal_id', 'terminal_name', 'bank_name', 
                    'account_number_masked', 'event_type', 'event_summary', 'event_detail', 'created_at',
                    \Illuminate\Support\Facades\DB::raw('CASE WHEN event_detail IS NOT NULL THEN 1 ELSE 0 END as has_detail')
                ])
                ->orderBy('created_at', 'desc')
                ->take(60)
                ->get();

            $groupedFlows = [];
            $usedIds = [];

            foreach ($rawGroupLogs as $log) {
                if (in_array($log->id, $usedIds)) continue;

                $logTime = \Carbon\Carbon::parse($log->created_at);
                $cluster = $rawGroupLogs->filter(function ($item) use ($log, $logTime, $usedIds) {
                    if (in_array($item->id, $usedIds)) return false;
                    if ($item->terminal_id !== $log->terminal_id && $item->terminal_name !== $log->terminal_name) return false;
                    $itemTime = \Carbon\Carbon::parse($item->created_at);
                    return abs($logTime->diffInSeconds($itemTime)) <= 60;
                })->sortBy('created_at')->values();

                if ($cluster->count() > 0) {
                    foreach ($cluster as $cItem) {
                        $usedIds[] = $cItem->id;
                    }

                    $stepSubmitted = $cluster->first(function ($c) {
                        return in_array($c->event_type, ['fetch_request_submitted', 'session_login_started']);
                    });
                    $stepDebug = $cluster->first(function ($c) {
                        return $c->event_type === 'pwa_debug_logs';
                    });
                    $stepResult = $cluster->first(function ($c) {
                        return in_array($c->event_type, ['fetch_request_fulfilled', 'fetch_request_failed', 'session_login_success', 'session_login_failed', 'search_not_found']);
                    });

                    $leadLog = $stepResult ?: ($stepSubmitted ?: $cluster->first());
                    $firstLog = $cluster->first();

                    $isAutoSyncFlow = false;
                    foreach ($cluster as $cItem) {
                        if (str_contains($cItem->event_summary ?? '', '[Live View]') || str_starts_with($cItem->event_type, 'auto_sync')) {
                            $isAutoSyncFlow = true;
                            break;
                        }
                    }

                    $durationSec = 0;
                    if ($stepSubmitted && $stepResult) {
                        $subTs = \Carbon\Carbon::parse($stepSubmitted->created_at)->timestamp;
                        $resTs = \Carbon\Carbon::parse($stepResult->created_at)->timestamp;
                        $durationSec = max(0, $resTs - $subTs);
                    } else {
                        $clusterTimestamps = [];
                        foreach ($cluster as $cItem) {
                            $clusterTimestamps[] = \Carbon\Carbon::parse($cItem->created_at)->timestamp;
                        }
                        $minSec = count($clusterTimestamps) > 0 ? min($clusterTimestamps) : 0;
                        $maxSec = count($clusterTimestamps) > 0 ? max($clusterTimestamps) : 0;
                        $durationSec = $maxSec - $minSec;
                    }

                    $realApiSec = $calcRealApiTimeFromDebugLog($stepDebug);
                    if ($durationSec === 0 && $realApiSec !== null && $realApiSec > 0) {
                        $durationSec = $realApiSec;
                    }

                    $status = 'success';
                    if ($leadLog->event_type === 'fetch_request_failed' || $leadLog->event_type === 'session_login_failed') {
                        $status = 'failed';
                    } elseif ($leadLog->event_type === 'search_not_found') {
                        $status = 'not_found';
                    } elseif ($stepSubmitted && !$stepResult) {
                        $status = 'pending';
                    }

                    $groupedFlows[] = [
                        'session_id' => 'flow_' . $leadLog->id,
                        'lead_id' => $leadLog->id,
                        'terminal_name' => $leadLog->terminal_name ?: ($firstLog->terminal_name ?: 'System'),
                        'tenant_name' => $leadLog->tenant ? $leadLog->tenant->name : 'N/A',
                        'bank_name' => $leadLog->bank_name ?: 'Bank API',
                        'account_number_masked' => $leadLog->account_number_masked ?: '',
                        'status' => $status,
                        'is_auto_sync' => $isAutoSyncFlow,
                        'event_type' => $leadLog->event_type,
                        'summary' => $leadLog->event_summary ?: $firstLog->event_summary,
                        'created_at' => \Carbon\Carbon::parse($firstLog->created_at)->setTimezone('+05:00')->toIso8601String(),
                        'duration' => $durationSec > 0 ? $durationSec . 's' : '< 1s',
                        'real_api_time' => $realApiSec !== null ? $realApiSec . 's' : null,
                        'steps_count' => $cluster->count(),
                        'steps' => [
                            'submitted' => $stepSubmitted ? [
                                'id' => $stepSubmitted->id,
                                'event_type' => $stepSubmitted->event_type,
                                'summary' => $stepSubmitted->event_summary,
                                'created_at' => \Carbon\Carbon::parse($stepSubmitted->created_at)->setTimezone('+05:00')->toIso8601String(),
                                'has_detail' => (bool)$stepSubmitted->has_detail,
                            ] : null,
                            'debug_logs' => $stepDebug ? [
                                'id' => $stepDebug->id,
                                'event_type' => $stepDebug->event_type,
                                'summary' => $stepDebug->event_summary,
                                'created_at' => \Carbon\Carbon::parse($stepDebug->created_at)->setTimezone('+05:00')->toIso8601String(),
                                'has_detail' => (bool)$stepDebug->has_detail,
                            ] : null,
                            'result' => $stepResult ? [
                                'id' => $stepResult->id,
                                'event_type' => $stepResult->event_type,
                                'summary' => $stepResult->event_summary,
                                'created_at' => \Carbon\Carbon::parse($stepResult->created_at)->setTimezone('+05:00')->toIso8601String(),
                                'has_detail' => (bool)$stepResult->has_detail,
                            ] : null,
                        ],
                    ];

                    if (count($groupedFlows) >= 10) break;
                }
            }

            // Bank API Health (Single Aggregates)
            $bmlCounts = SessionActivityLog::where('created_at', '>=', $twentyFourHoursAgo)
                ->where(function($q) { $q->where('bank_name', 'LIKE', '%BML%')->orWhere('event_summary', 'LIKE', '%BML%'); })
                ->selectRaw("
                    count(*) as total_cnt,
                    SUM(CASE WHEN event_type IN ('fetch_request_failed', 'session_login_failed') THEN 1 ELSE 0 END) as failed_cnt,
                    SUM(CASE WHEN event_type IN ('fetch_request_fulfilled', 'session_login_success') THEN 1 ELSE 0 END) as success_cnt
                ")
                ->first();

            $mibCounts = SessionActivityLog::where('created_at', '>=', $twentyFourHoursAgo)
                ->where(function($q) { $q->where('bank_name', 'LIKE', '%MIB%')->orWhere('event_summary', 'LIKE', '%MIB%'); })
                ->selectRaw("
                    count(*) as total_cnt,
                    SUM(CASE WHEN event_type IN ('fetch_request_failed', 'session_login_failed') THEN 1 ELSE 0 END) as failed_cnt,
                    SUM(CASE WHEN event_type IN ('fetch_request_fulfilled', 'session_login_success') THEN 1 ELSE 0 END) as success_cnt
                ")
                ->first();

            $buildBankHealth = function ($agg) {
                $total = (int)($agg->total_cnt ?? 0);
                $failed = (int)($agg->failed_cnt ?? 0);
                $success = (int)($agg->success_cnt ?? 0);
                $evaluated = $success + $failed;
                $successRate = $evaluated > 0 ? round(($success / $evaluated) * 100, 1) : 100.0;
                $status = 'healthy';
                if ($successRate < 90) $status = 'critical';
                elseif ($successRate < 98) $status = 'degraded';
                return [
                    'total' => $total,
                    'success_rate' => $successRate,
                    'avg_latency' => 1.8,
                    'status' => $status,
                ];
            };

            $bankHealth = [
                'bml' => $buildBankHealth($bmlCounts),
                'mib' => $buildBankHealth($mibCounts),
                'trends' => [],
            ];

            $latestWeekly = end($weeklyTrends);

            return [
                'total_terminals' => $totalTerminals,
                'active_terminals' => $activeTerminals,
                'total_logs_24h' => $totalLogs24h,
                'rph_current' => count($hourlySpectrum) > 0 ? end($hourlySpectrum)['count'] : 0,
                'hourly_spectrum' => $hourlySpectrum,
                'error_ratio_24h' => $errorRatio24h,
                'error_ratio_1h' => $errorRatio1h,
                'error_ratio_1h_trend' => $errorTrend1h,
                'error_ratio_1h_delta' => $errorDelta1h,
                'error_ratio_1h_sparkline' => $sparkline1h,
                'success_rate_daily' => $successRateDaily,
                'success_rate_monthly' => $successRateMonthly,
                'avg_request_duration_24h' => $latestWeekly['avg_request_duration'] ?? 0.0,
                'avg_real_api_time_24h' => $latestWeekly['avg_real_api_time'] ?? 0.0,
                'weekly_trends' => $weeklyTrends,
                'monthly_trends' => $monthlyTrends,
                'terminal_throughput' => $terminalThroughput,
                'current_hour_count' => $currentHourTotal,
                'current_hour_terminals' => $currentHourTerminals,
                'bank_health' => $bankHealth,
                'grouped_flows' => $groupedFlows,
            ];
        });

        $response['telemetry'] = $telemetry;
        $response['active_terminals'] = $telemetry['active_terminals'] ?? 0;

        return response()->json($response);
    }

    public function getSessionLogDetail(Request $request, $id)
    {
        $log = SessionActivityLog::with(['tenant', 'terminal', 'bankAccount'])->findOrFail($id);
        return response()->json([
            'id' => $log->id,
            'event_type' => $log->event_type,
            'event_summary' => $log->event_summary,
            'event_detail' => $log->event_detail,
            'tenant' => $log->tenant,
            'terminal' => $log->terminal,
            'bankAccount' => $log->bankAccount,
            'created_at' => $log->created_at,
        ]);
    }

    private function parseLogRunTimestamp($run)
    {
        if (is_array($run) && !empty($run['logs']) && is_array($run['logs'])) {
            foreach (array_slice($run['logs'], 0, 10) as $line) {
                if (is_string($line) && preg_match('/\[(\d{4}-\d{2}-\d{2}\s+)?(\d{2}:\d{2}:\d{2})\]/', $line, $m)) {
                    $timePart = $m[2];
                    if (!empty($m[1])) {
                        return trim($m[1]) . ' ' . $timePart;
                    }
                    $baseDate = isset($run['timestamp']) 
                        ? \Carbon\Carbon::parse($run['timestamp'])->setTimezone('Indian/Maldives')->format('Y-m-d')
                        : date('Y-m-d');
                    return $baseDate . ' ' . $timePart;
                }
            }
        }
        if (is_array($run) && isset($run['timestamp'])) {
            return \Carbon\Carbon::parse($run['timestamp'])->setTimezone('Indian/Maldives')->format('Y-m-d H:i:s');
        }
        return null;
    }

    public function listTerminalDebugLogs(Request $request)
    {
        $perPage = min((int) $request->input('per_page', 50), 100);
        $terminals = Terminal::with('tenant')
            ->whereNotNull('debug_logs')
            ->where('debug_logs', '!=', '[]')
            ->orderBy('updated_at', 'desc')
            ->paginate($perPage);

        $mapped = $terminals->getCollection()->map(function ($terminal) {
            $logs = json_decode($terminal->debug_logs, true);
            $runs = is_array($logs) ? count($logs) : 0;
            $lastRun = null;
            if (is_array($logs) && count($logs) > 0) {
                $firstRun = reset($logs);
                $lastRun = $this->parseLogRunTimestamp($firstRun);
            }
            if ($lastRun === null) {
                $lastRun = $terminal->updated_at ? $terminal->updated_at->setTimezone('Indian/Maldives')->format('Y-m-d H:i:s') : null;
            }

            return [
                'id' => $terminal->id,
                'terminal_name' => $terminal->terminal_name,
                'hardware_id' => $terminal->hardware_id,
                'tenant_name' => $terminal->tenant?->tenant_name ?? 'Unknown',
                'status' => $terminal->status,
                'log_runs' => $runs,
                'last_run_at' => $lastRun,
            ];
        });

        return response()->json([
            'terminals' => $mapped,
            'total' => $terminals->total(),
            'per_page' => $perPage,
            'current_page' => $terminals->currentPage(),
            'last_page' => $terminals->lastPage(),
        ]);
    }

    public function getTerminalDebugLog(Request $request, $id)
    {
        $terminal = Terminal::with('tenant')->findOrFail($id);
        $rawLogs = json_decode($terminal->debug_logs, true) ?? [];

        $formattedRuns = [];
        if (is_array($rawLogs)) {
            foreach ($rawLogs as $run) {
                $copy = $run;
                if (is_array($copy)) {
                    $copy['timestamp'] = $this->parseLogRunTimestamp($copy) ?? ($copy['timestamp'] ?? null);
                }
                $formattedRuns[] = $copy;
            }
        }

        return response()->json([
            'terminal_name' => $terminal->terminal_name,
            'hardware_id' => $terminal->hardware_id,
            'tenant_name' => $terminal->tenant?->tenant_name ?? 'Unknown',
            'status' => $terminal->status,
            'runs' => $formattedRuns,
        ]);
    }

    public function deleteCompany($id)
    {
        $tenant = Tenant::findOrFail($id);
        if ($tenant->status !== 'archived') {
            return response()->json(['error' => 'Only archived companies can be deleted.'], 400);
        }

        // Cascade delete relations
        $tenant->terminals()->delete();
        $tenant->bankAccounts()->delete();
        $tenant->users()->delete();
        $tenant->invoices()->delete();
        $tenant->auditLogs()->delete();

        SessionActivityLog::where('tenant_id', $tenant->id)->delete();
        SessionFetchRequest::whereHas('bankAccount', function ($q) use ($tenant) {
            $q->where('tenant_id', $tenant->id);
        })->delete();

        $tenant->delete();

        return response()->json(['message' => 'Company and all associated data deleted successfully']);
    }

    public function resetPassword(Request $request, $id)
    {
        $request->validate([
            'password' => 'required|string|min:8',
        ]);

        $user = User::findOrFail($id);
        $user->password = Hash::make($request->password);
        $user->save();

        return response()->json(['message' => 'Password reset successfully']);
    }

    public function listSubscriptionPlans()
    {
        $plans = SubscriptionPlan::orderBy('price', 'asc')->get();

        return response()->json($plans);
    }

    public function createSubscriptionPlan(Request $request)
    {
        $request->validate([
            'tier_key' => 'required|string|unique:subscription_plans,tier_key',
            'name' => 'required|string',
            'price' => 'required|numeric|min:0',
            'max_terminals' => 'required|integer|min:1',
            'max_bank_accounts' => 'required|integer|min:1',
            'max_transaction_checks' => 'nullable|integer|min:0',
            'lock_timeout' => 'required|integer|min:5|max:300',
            'features' => 'required|array',
        ]);

        $plan = SubscriptionPlan::create($request->all());

        return response()->json(['message' => 'Subscription plan created successfully', 'plan' => $plan]);
    }

    public function updateSubscriptionPlan(Request $request, $id)
    {
        $request->validate([
            'tier_key' => 'required|string|unique:subscription_plans,tier_key,'.$id,
            'name' => 'required|string',
            'price' => 'required|numeric|min:0',
            'max_terminals' => 'required|integer|min:1',
            'max_bank_accounts' => 'required|integer|min:1',
            'max_transaction_checks' => 'nullable|integer|min:0',
            'lock_timeout' => 'required|integer|min:5|max:300',
            'features' => 'required|array',
        ]);

        $plan = SubscriptionPlan::findOrFail($id);
        $plan->update($request->all());

        return response()->json(['message' => 'Subscription plan updated successfully', 'plan' => $plan]);
    }

    public function deleteSubscriptionPlan($id)
    {
        $plan = SubscriptionPlan::findOrFail($id);
        $plan->delete();

        return response()->json(['message' => 'Subscription plan deleted successfully']);
    }

    public function runMigrations(Request $request)
    {
        Artisan::call('migrate', ['--force' => true]);
        $migrateOutput = Artisan::output();

        Artisan::call('optimize:clear');
        $optimizeOutput = Artisan::output();

        return response()->json([
            'output' => "=== Migrations Output ===\n".$migrateOutput."\n=== Cache Clear Output ===\n".$optimizeOutput,
        ]);
    }

    public function getSystemSettings(Request $request)
    {
        $settings = DB::table('system_settings')->get();

        $serverInfo = [
            'php_version' => phpversion(),
            'laravel_version' => app()->version(),
            'mysql_version' => DB::select('select version() as version')[0]->version ?? 'Unknown',
            'server_os' => php_uname('s').' '.php_uname('r'),
            'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
            'ini' => [
                'memory_limit' => ini_get('memory_limit') ?: '512M',
                'max_execution_time' => ini_get('max_execution_time') ?: '30 (Default)',
                'max_input_time' => ini_get('max_input_time') ?: '60 (Default)',
                'post_max_size' => ini_get('post_max_size') ?: '8M (Default)',
                'upload_max_filesize' => ini_get('upload_max_filesize') ?: '2M (Default)',
                'opcache_enable' => ini_get('opcache.enable') ? 'on' : 'off',
                'disable_functions' => ini_get('disable_functions') ?: 'opcache_get_status',
            ],
            'fpm' => [
                'pm_max_children' => 10,
                'pm_max_requests' => 0,
                'pm' => 'ondemand',
                'pm_start_servers' => 1,
                'pm_min_spare_servers' => 1,
                'pm_max_spare_servers' => 1,
            ],
        ];

        return response()->json([
            'settings' => $settings,
            'server_info' => $serverInfo,
        ]);
    }

    public function updateSystemSettings(Request $request)
    {
        $request->validate([
            'settings' => 'required|array',
            'settings.*.key' => 'required|string',
            'settings.*.value' => 'required|string',
        ]);

        foreach ($request->settings as $setting) {
            $key = $setting['key'];
            $val = (int) $setting['value'];

            if ($key === 'poll_interval_holder' && $val < 1) {
                return response()->json(['error' => 'Holder interval must be at least 1 second'], 422);
            }
            if ($key === 'poll_interval_requesting' && $val < 1) {
                return response()->json(['error' => 'Requesting interval must be at least 1 second'], 422);
            }
            if ($key === 'poll_interval_idle' && $val < 5) {
                return response()->json(['error' => 'Idle interval must be at least 5 seconds'], 422);
            }

            DB::table('system_settings')
                ->updateOrInsert(
                    ['key' => $key],
                    [
                        'value' => $setting['value'],
                        'updated_at' => now(),
                    ]
                );
        }

        Cache::forget('viri_system_settings');

        return response()->json(['message' => 'System settings updated successfully']);
    }

    public function getPayments(Request $request)
    {
        $perPage = min((int) $request->input('per_page', 50), 200);
        $payments = PaymentReceipt::with('tenant')
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);

        return response()->json($payments);
    }

    public function approvePayment(Request $request, $id)
    {
        $request->validate([
            'subscription_tier' => 'required|string',
            'license_expires_at' => 'required|date',
            'remarks' => 'nullable|string',
        ]);

        $payment = PaymentReceipt::findOrFail($id);

        $payment->update([
            'status' => 'approved',
            'remarks' => $request->remarks ?: $payment->remarks,
        ]);

        $tenant = $payment->tenant;
        $plan = \App\Models\SubscriptionPlan::where('tier_key', $request->subscription_tier)->first();
        $features = $plan ? ($plan->features ?? []) : ($tenant->features ?? []);
        $maxTerminals = $plan ? $plan->max_terminals : ($tenant->max_terminals ?? 1);
        $maxBankAccounts = $plan ? $plan->max_bank_accounts : ($tenant->max_bank_accounts ?? 1);
        $lockTimeout = $plan ? $plan->lock_timeout : ($tenant->lock_timeout ?? 20);

        $tenant->update([
            'status' => 'active',
            'subscription_tier' => $request->subscription_tier,
            'max_terminals' => $maxTerminals,
            'max_bank_accounts' => $maxBankAccounts,
            'lock_timeout' => $lockTimeout,
            'features' => $features,
            'license_expires_at' => Carbon::parse($request->license_expires_at),
            'verifications_count' => 0,
        ]);

        User::where('tenant_id', $tenant->id)->whereIn('status', ['pending', 'suspended'])->update(['status' => 'approved']);

        $invoice = \App\Models\Invoice::create([
            'tenant_id' => $tenant->id,
            'amount' => $payment->amount,
            'billing_period_start' => Carbon::now()->startOfMonth(),
            'billing_period_end' => Carbon::parse($request->license_expires_at),
            'status' => 'paid',
        ]);

        $engine = new \App\Services\ReferralCommissionEngine();
        $engine->processInvoiceCommission($invoice);

        SessionActivityLog::create([
            'tenant_id' => $tenant->id,
            'event_type' => 'billing_payment_approved',
            'event_summary' => "Payment reference {$payment->reference_number} approved. Extended license to ".$tenant->license_expires_at->toDateString(),
            'event_detail' => [
                'payment_id' => $payment->id,
                'invoice_id' => $invoice->id,
                'amount' => $payment->amount,
                'reference_number' => $payment->reference_number,
                'new_tier' => $tenant->subscription_tier,
                'new_expiry' => $tenant->license_expires_at->toIso8601String(),
            ],
            'created_at' => now(),
        ]);

        return response()->json([
            'message' => 'Payment approved successfully. Subscription plan updated.',
        ]);
    }

    public function rejectPayment(Request $request, $id)
    {
        $request->validate([
            'remarks' => 'required|string|max:1000',
        ]);

        $payment = PaymentReceipt::findOrFail($id);
        $tenant = $payment->tenant;
        $previousExpiry = $payment->previous_license_expires_at;

        $payment->update([
            'status' => 'rejected',
            'remarks' => $request->remarks,
        ]);

        // Revert license expiry if previous expiry exists
        if ($previousExpiry) {
            $tenant->license_expires_at = $previousExpiry;
            $tenant->save();
        }

        return response()->json([
            'message' => 'Payment rejected and license expiry reverted if applicable.',
        ]);
    }

    public function clearStuckLock(Request $request, $id)
    {
        $bankAccount = BankAccount::findOrFail($id);

        // Clear bank account lock table record
        BankAccountLock::where('bank_account_id', $id)->delete();

        // Also clear fetch-in-progress indicators
        $bankAccount->update([
            'fetch_in_progress_until' => null,
            'fetch_started_at' => null,
            'fetch_started_by_terminal_id' => null,
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Stuck fetch lock cleared successfully',
        ]);
    }

    public function getDebugInfo()
    {
        $mibKeys = MibCredentialGroup::with(['terminal', 'profiles.bankAccounts'])->get()->map(function ($group) {
            $accounts = [];
            foreach ($group->profiles as $profile) {
                foreach ($profile->bankAccounts as $acc) {
                    $accounts[] = "{$acc->bank_name} {$acc->account_number} ({$profile->profile_name})";
                }
            }

            return [
                'id' => $group->id,
                'terminal_id' => $group->terminal_id,
                'terminal_name' => $group->terminal->terminal_name ?? null,
                'bank_account_id' => null,
                'account_name' => count($accounts) > 0 ? implode(', ', $accounts) : 'None linked',
                'mib_username' => $group->mib_username,
                'key1_prefix' => substr($group->key1 ?? '', 0, 8).'...',
                'key2_prefix' => substr($group->key2 ?? '', 0, 8).'...',
                'app_id' => $group->app_id,
                'obtained_at' => $group->obtained_at ? $group->obtained_at->toIso8601String() : null,
            ];
        });

        $bmlTokens = BmlCredentialGroup::with(['terminal', 'bankAccounts'])->get()->map(function ($group) {
            $accounts = [];
            foreach ($group->bankAccounts as $acc) {
                $accounts[] = "{$acc->bank_name} {$acc->account_number}";
            }

            return [
                'id' => $group->id,
                'terminal_id' => $group->terminal_id,
                'terminal_name' => $group->terminal->terminal_name ?? null,
                'bank_account_id' => null,
                'account_name' => count($accounts) > 0 ? implode(', ', $accounts) : 'None linked',
                'bml_username' => $group->bml_username,
                'device_id' => $group->device_id,
                'token_type' => $group->token_type,
                'last_grant' => $group->last_grant,
                'obtained_at' => $group->obtained_at ? $group->obtained_at->toIso8601String() : null,
                'expires_at' => $group->expires_at ? $group->expires_at->toIso8601String() : null,
                'has_access_token' => ! empty($group->access_token),
                'has_refresh_token' => ! empty($group->refresh_token),
            ];
        });

        return response()->json([
            'mib_keys' => $mibKeys,
            'bml_tokens' => $bmlTokens,
            'total_mib_keys' => count($mibKeys),
            'total_bml_tokens' => count($bmlTokens),
        ]);
    }

    // =========================================================================
    // CREDENTIAL INSPECTOR (for superadmin debugging)
    // =========================================================================

    public function getCredentials()
    {
        $bmlGroups = BmlCredentialGroup::with(['terminal', 'bankAccounts', 'tenant'])->get()->map(function ($g) {
            $isExpired = $g->expires_at && $g->expires_at->isPast();

            return [
                'id' => $g->id,
                'tenant_id' => $g->tenant_id,
                'tenant_name' => $g->tenant?->name,
                'terminal_id' => $g->terminal_id,
                'terminal_name' => $g->terminal?->terminal_name,
                'bml_username' => $g->bml_username,
                'profile_type' => $g->profile_type,
                'device_id' => $g->device_id,
                'access_token' => $g->access_token,
                'refresh_token' => $g->refresh_token,
                'has_access_token' => ! empty($g->access_token),
                'has_refresh_token' => ! empty($g->refresh_token),
                'token_type' => $g->token_type,
                'last_grant' => $g->last_grant,
                'expires_in' => $g->expires_in,
                'expires_at' => $g->expires_at?->toIso8601String(),
                'expired' => $isExpired,
                'obtained_at' => $g->obtained_at?->toIso8601String(),
                'linked_accounts' => $g->bankAccounts->map(fn ($a) => [
                    'id' => $a->id,
                    'account_number' => $a->account_number,
                    'account_name' => $a->account_name,
                    'bank_name' => $a->bank_name,
                ]),
            ];
        });

        $mibGroups = MibCredentialGroup::with(['terminal', 'profiles.bankAccounts', 'tenant'])->get()->map(function ($g) {
            return [
                'id' => $g->id,
                'tenant_id' => $g->tenant_id,
                'tenant_name' => $g->tenant?->name,
                'terminal_id' => $g->terminal_id,
                'terminal_name' => $g->terminal?->terminal_name,
                'mib_username' => $g->mib_username,
                'app_id' => $g->app_id,
                'key1' => $g->key1,
                'key2' => $g->key2,
                'has_key1' => ! empty($g->key1),
                'has_key2' => ! empty($g->key2),
                'obtained_at' => $g->obtained_at?->toIso8601String(),
                'profiles' => $g->profiles->map(fn ($p) => [
                    'profile_id' => $p->profile_id,
                    'profile_type' => $p->profile_type,
                    'profile_name' => $p->profile_name,
                    'linked_accounts' => $p->bankAccounts->map(fn ($a) => [
                        'id' => $a->id,
                        'account_number' => $a->account_number,
                        'account_name' => $a->account_name,
                    ]),
                ]),
            ];
        });

        $unlinkedMibAccounts = BankAccount::where('bank_name', 'MIB')
            ->whereNull('mib_credential_profile_id')
            ->with('tenant')
            ->get()
            ->map(fn ($a) => [
                'id' => $a->id,
                'tenant_id' => $a->tenant_id,
                'tenant_name' => $a->tenant?->name,
                'account_number' => $a->account_number,
                'account_name' => $a->account_name,
                'mib_profile_type' => $a->mib_profile_type ?? '0',
            ]);

        return response()->json([
            'bml_groups' => $bmlGroups,
            'mib_groups' => $mibGroups,
            'unlinked_mib_accounts' => $unlinkedMibAccounts,
            'total_bml' => $bmlGroups->count(),
            'total_mib' => $mibGroups->count(),
            'total_unlinked_mib' => $unlinkedMibAccounts->count(),
        ]);
    }

    public function testBmlCredentials(Request $request, $id)
    {
        $group = BmlCredentialGroup::with('tenant', 'bankAccounts')->find($id);
        if (! $group) {
            return response()->json(['error' => 'Credential group not found'], 404);
        }

        if (empty($group->access_token)) {
            return response()->json([
                'valid' => false,
                'error' => 'No access token stored.',
                'status' => 'no_token',
            ]);
        }

        $results = [];
        $deviceId = $group->device_id ?? '';

        // --- Test 1: Mobile Dashboard API ---
        try {
            $headers = [
                'Authorization' => 'Bearer '.$group->access_token,
                'Accept' => 'application/json',
                'User-Agent' => 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)',
                'x-app-version' => '2.1.44.348',
                'X-Device-ID' => $deviceId,
            ];

            $response = Http::withHeaders($headers)
                ->timeout(15)
                ->get('https://www.bankofmaldives.com.mv/internetbanking/api/mobile/dashboard');

            $respBody = $response->body();
            $respJson = json_decode($respBody, true);
            $isValid = $response->successful() && ($respJson['success'] ?? false) === true;

            $results['mobile_dashboard'] = [
                'request' => [
                    'url' => 'https://www.bankofmaldives.com.mv/internetbanking/api/mobile/dashboard',
                    'method' => 'GET',
                    'headers' => $headers,
                ],
                'response' => [
                    'status_code' => $response->status(),
                    'success' => $response->successful(),
                    'body' => $isValid ? $respBody : $respBody,
                    'body_truncated' => strlen($respBody) > 5000,
                ],
            ];
        } catch (\Exception $e) {
            $results['mobile_dashboard'] = [
                'request' => [
                    'url' => 'https://www.bankofmaldives.com.mv/internetbanking/api/mobile/dashboard',
                    'method' => 'GET',
                    'headers' => $headers ?? [],
                ],
                'response' => [
                    'error' => $e->getMessage(),
                ],
            ];
        }

        // --- Test 2: Sample transaction history (if dashboard was valid) ---
        if (($results['mobile_dashboard']['response']['success'] ?? false) && ! empty($results['mobile_dashboard']['response']['body'])) {
            $dashData = json_decode($results['mobile_dashboard']['response']['body'], true);
            $accountObj = null;
            if (isset($dashData['payload']['dashboard']) && is_array($dashData['payload']['dashboard'])) {
                $accountObj = $dashData['payload']['dashboard'][0] ?? null;
            }
            if ($accountObj && isset($accountObj['id'])) {
                $acctId = $accountObj['id'];
                try {
                    $histHeaders = [
                        'Authorization' => 'Bearer '.$group->access_token,
                        'Accept' => 'application/json',
                        'User-Agent' => 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)',
                        'x-app-version' => '2.1.44.348',
                        'X-Device-ID' => $deviceId,
                    ];
                    $histRes = Http::withHeaders($histHeaders)
                        ->timeout(15)
                        ->get("https://www.bankofmaldives.com.mv/internetbanking/api/mobile/account/{$acctId}/history/today");

                    $histBody = $histRes->body();
                    $results['sample_history'] = [
                        'request' => [
                            'url' => "https://www.bankofmaldives.com.mv/internetbanking/api/mobile/account/{$acctId}/history/today",
                            'method' => 'GET',
                            'headers' => $histHeaders,
                        ],
                        'response' => [
                            'status_code' => $histRes->status(),
                            'success' => $histRes->successful(),
                            'body' => $histBody,
                            'body_truncated' => strlen($histBody) > 5000,
                        ],
                    ];
                } catch (\Exception $e) {
                    $results['sample_history'] = [
                        'request' => [
                            'url' => "https://www.bankofmaldives.com.mv/internetbanking/api/mobile/account/{$acctId}/history/today",
                            'method' => 'GET',
                            'headers' => $histHeaders ?? [],
                        ],
                        'response' => [
                            'error' => $e->getMessage(),
                        ],
                    ];
                }
            }
        }

        $tokenExpired = $group->expires_at && $group->expires_at->isPast();
        $allSuccessful = collect($results)->every(fn ($r) => ($r['response']['success'] ?? false) === true);

        $valid = $allSuccessful && ! $tokenExpired;

        return response()->json([
            'valid' => $valid,
            'token_expired' => $tokenExpired,
            'bml_username' => $group->bml_username,
            'device_id' => $group->device_id,
            'expires_at' => $group->expires_at?->toIso8601String(),
            'results' => $results,
        ]);
    }

    public function renewBmlToken(Request $request, $id)
    {
        $group = BmlCredentialGroup::with('tenant', 'bankAccounts')->find($id);
        if (! $group) {
            return response()->json(['error' => 'Credential group not found'], 404);
        }

        if (empty($group->refresh_token)) {
            return response()->json([
                'error' => 'No refresh token stored. Cannot renew — the bank account must be re-linked.',
            ]);
        }

        $deviceId = $group->device_id ?? '';
        $requestBody = http_build_query([
            'grant_type' => 'refresh_token',
            'refresh_token' => $group->refresh_token,
            'client_id' => '98C83590-513F-4716-B02B-EC68B7D9E7E7',
            'Device-ID' => $deviceId,
            'User-Agent' => 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)',
            'x-app-version' => '2.1.44.348',
        ]);

        $requestHeaders = [
            'Content-Type' => 'application/x-www-form-urlencoded',
            'User-Agent' => 'Mozilla/5.0 (Android 14; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0',
            'Accept' => 'application/json',
            'X-Device-ID' => $deviceId,
        ];

        try {
            $response = Http::withHeaders($requestHeaders)
                ->withBody($requestBody, 'application/x-www-form-urlencoded')
                ->timeout(20)
                ->post('https://www.bankofmaldives.com.mv/internetbanking/oauth/token');

            $respBody = $response->body();
            $respJson = json_decode($respBody, true);
            $success = $response->successful() && isset($respJson['access_token']);

            if ($success) {
                $newAccessToken = $respJson['access_token'];
                $newRefreshToken = $respJson['refresh_token'] ?? $group->refresh_token;
                $expiresIn = $respJson['expires_in'] ?? $group->expires_in;

                $group->access_token = $newAccessToken;
                $group->refresh_token = $newRefreshToken;
                $group->expires_in = $expiresIn;
                $group->expires_at = Carbon::now()->addSeconds($expiresIn);
                $group->obtained_at = Carbon::now();
                $group->save();
            }

            return response()->json([
                'success' => $success,
                'renewed' => $success,
                'expires_at' => $group->expires_at?->toIso8601String(),
                'error' => $success ? null : ($respJson['error_description'] ?? $respJson['error'] ?? 'Unknown error'),
                'debug' => [
                    'request' => [
                        'url' => 'https://www.bankofmaldives.com.mv/internetbanking/oauth/token',
                        'method' => 'POST',
                        'headers' => $requestHeaders,
                        'body' => preg_replace('/refresh_token=[^&]+/', 'refresh_token=***', $requestBody),
                    ],
                    'response' => [
                        'status_code' => $response->status(),
                        'body' => $respBody,
                        'body_truncated' => strlen($respBody) > 5000,
                    ],
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'renewed' => false,
                'error' => $e->getMessage(),
                'debug' => [
                    'request' => [
                        'url' => 'https://www.bankofmaldives.com.mv/internetbanking/oauth/token',
                        'method' => 'POST',
                        'headers' => $requestHeaders,
                        'body' => preg_replace('/refresh_token=[^&]+/', 'refresh_token=***', $requestBody),
                    ],
                    'response' => [
                        'error' => $e->getMessage(),
                    ],
                ],
            ]);
        }
    }

    public function testMibCredentials(Request $request, $id)
    {
        $group = MibCredentialGroup::with('tenant', 'terminal', 'profiles.bankAccounts')->find($id);
        if (! $group) {
            return response()->json(['error' => 'Credential group not found'], 404);
        }

        $hasKey1 = ! empty($group->key1);
        $hasKey2 = ! empty($group->key2);
        $hasAppId = ! empty($group->app_id);
        $isValid = $hasKey1 && $hasKey2 && $hasAppId;

        $results = [];

        try {
            $reqHeaders = [
                'Accept' => 'application/json',
                'Content-Type' => 'application/x-www-form-urlencoded; charset=utf-8',
                'User-Agent' => 'android/1.0',
            ];

            $response = Http::withHeaders($reqHeaders)
                ->timeout(15)
                ->asForm()
                ->post('https://faisamobilex-smvc-v2.mib.com.mv/index/');

            $respBody = $response->body();
            $jsonDecoded = json_decode($respBody, true);

            $results['mib_api_reachability'] = [
                'request' => [
                    'url' => 'https://faisamobilex-smvc-v2.mib.com.mv/index/',
                    'method' => 'POST',
                    'headers' => $reqHeaders,
                ],
                'response' => [
                    'status_code' => $response->status(),
                    'success' => true,
                    'body' => $jsonDecoded ?? $respBody,
                    'body_truncated' => false,
                ],
            ];
        } catch (\Exception $e) {
            $results['mib_api_reachability'] = [
                'request' => [
                    'url' => 'https://faisamobilex-smvc-v2.mib.com.mv/index/',
                    'method' => 'POST',
                    'headers' => $reqHeaders ?? [],
                ],
                'response' => [
                    'status_code' => 500,
                    'success' => false,
                    'error' => $e->getMessage(),
                ],
            ];
        }

        return response()->json([
            'valid' => $isValid,
            'mib_username' => $group->mib_username,
            'app_id' => $group->app_id,
            'has_key1' => $hasKey1,
            'has_key2' => $hasKey2,
            'note' => $isValid
                ? 'MIB Diffie-Hellman device keys are stored and active for '.$group->mib_username.'.'
                : 'Missing required MIB DH device keys (Key1/Key2/App ID). Extension pairing required.',
            'results' => $results,
        ]);
    }

    public function renewMibKeys(Request $request, $id)
    {
        $group = MibCredentialGroup::with('profiles.bankAccounts')->find($id);
        if (! $group) {
            return response()->json(['error' => 'Credential group not found'], 404);
        }

        // Capture the old state for confirmation
        $result = [
            'mib_username' => $group->mib_username,
            'had_key1' => ! empty($group->key1),
            'had_key2' => ! empty($group->key2),
            'had_app_id' => ! empty($group->app_id),
            'profile_count' => $group->profiles->count(),
        ];

        // Clear keys — forces the extension to re-register with MIB
        $group->key1 = null;
        $group->key2 = null;
        $group->app_id = null;
        $group->save();

        // Also clear all profiles under this group (they were linked to specific keys)
        foreach ($group->profiles as $profile) {
            foreach ($profile->bankAccounts as $account) {
                $account->mib_credential_profile_id = null;
                $account->save();
            }
            $profile->delete();
        }

        $result['cleared'] = true;
        $result['note'] = 'MIB device keys have been cleared. The extension will re-register the next time it accesses this account.';

        return response()->json($result);
    }

    public function getUnlinkedBmlAccounts(Request $request)
    {
        $tenantId = $request->input('tenant_id');
        if (! $tenantId) {
            return response()->json(
                BankAccount::where('bank_name', 'BML')
                    ->whereNull('bml_credential_group_id')
                    ->get(['id', 'account_number', 'account_name', 'tenant_id'])
            );
        }

        $accounts = BankAccount::where('tenant_id', $tenantId)
            ->where('bank_name', 'BML')
            ->whereNull('bml_credential_group_id')
            ->get(['id', 'account_number', 'account_name']);

        return response()->json($accounts);
    }

    public function cloneBmlCredentials(Request $request, $id)
    {
        $request->validate(['bank_account_id' => 'required|integer']);

        $source = BmlCredentialGroup::find($id);
        if (! $source) {
            return response()->json(['error' => 'Credential group not found'], 404);
        }

        if (empty($source->access_token)) {
            return response()->json(['error' => 'Source credentials have no access token — cannot clone'], 422);
        }

        $target = BankAccount::where('id', $request->bank_account_id)
            ->where('tenant_id', $source->tenant_id)
            ->first();

        if (! $target) {
            return response()->json(['error' => 'Bank account not found for this tenant'], 404);
        }

        if (strtolower($target->bank_name) !== 'bml') {
            return response()->json(['error' => 'Target account is not a BML account'], 422);
        }

        if ($target->bml_credential_group_id !== null) {
            return response()->json([
                'error' => 'Target bank account is already linked to BML credential group #'.$target->bml_credential_group_id.'. Unlink it first or choose a different account.',
                'existing_group_id' => $target->bml_credential_group_id,
            ], 422);
        }

        $clone = BmlCredentialGroup::create([
            'tenant_id' => $source->tenant_id,
            'terminal_id' => $source->terminal_id,
            'bml_username' => null,
            'profile_type' => $source->profile_type,
            'access_token' => $source->access_token,
            'refresh_token' => $source->refresh_token,
            'device_id' => Str::random(16),
            'expires_in' => $source->expires_in,
            'expires_at' => $source->expires_at,
            'obtained_at' => now(),
            'token_type' => 'Bearer',
            'last_grant' => 'clone',
        ]);

        $target->bml_credential_group_id = $clone->id;
        $target->save();

        SessionActivityLog::create([
            'tenant_id' => $source->tenant_id,
            'event_type' => 'credential_cloned',
            'event_summary' => "BML credentials cloned from group #{$source->id} to bank account #{$target->id} ({$target->account_number})",
            'event_detail' => [
                'source_group_id' => $source->id,
                'clone_group_id' => $clone->id,
                'target_account_id' => $target->id,
                'target_account_number' => $target->account_number,
                'profile_type' => $source->profile_type,
                'performed_by' => auth()->id(),
            ],
            'created_at' => now(),
        ]);

        Log::info('BML credentials cloned', [
            'source_group_id' => $source->id,
            'clone_group_id' => $clone->id,
            'target_account' => $target->account_number,
            'admin_user_id' => auth()->id(),
        ]);

        return response()->json([
            'success' => true,
            'group_id' => $clone->id,
            'account' => [
                'id' => $target->id,
                'account_number' => $target->account_number,
                'account_name' => $target->account_name,
                'bank_name' => $target->bank_name,
            ],
        ]);
    }

    // =========================================================================
    // MANUAL CREDENTIAL INJECTION (for superadmin debugging)
    // =========================================================================

    public function injectBmlCredentials(Request $request)
    {
        $validated = $request->validate([
            'tenant_id' => 'required|integer',
            'bank_account_id' => 'required|integer',
            'terminal_id' => 'nullable|integer',
            'bml_username' => 'nullable|string',
            'profile_type' => 'required|in:personal,business',
            'access_token' => 'required|string',
            'refresh_token' => 'required|string',
            'device_id' => 'required|string',
            'expires_in' => 'nullable|integer|min:1',
        ]);

        $result = DB::transaction(function () use ($validated) {
            $account = BankAccount::where('id', $validated['bank_account_id'])
                ->where('tenant_id', $validated['tenant_id'])
                ->lockForUpdate()
                ->first();

            if (! $account) {
                return ['error' => 'Bank account not found for this tenant', 'status' => 404];
            }

            if (strtolower($account->bank_name) !== 'bml') {
                return ['error' => 'Target account is not a BML account', 'status' => 422];
            }

            if ($account->bml_credential_group_id !== null) {
                return [
                    'error' => 'Target bank account is already linked to BML credential group #'.$account->bml_credential_group_id.'. Unlink it first or choose a different account.',
                    'existing_group_id' => $account->bml_credential_group_id,
                    'status' => 422,
                ];
            }

            $terminal = null;
            if (! empty($validated['terminal_id'])) {
                $terminal = Terminal::where('id', $validated['terminal_id'])
                    ->where('tenant_id', $validated['tenant_id'])
                    ->first();
                if (! $terminal) {
                    return ['error' => 'Terminal not found for this tenant', 'status' => 404];
                }
            }

            $expiresIn = $validated['expires_in'] ?? null;
            $expiresAt = $expiresIn ? Carbon::now()->addSeconds($expiresIn) : null;

            $bmlUsernameRaw = $validated['bml_username'] ?? null;
            $bmlUsername = ($bmlUsernameRaw !== null && trim($bmlUsernameRaw) !== '') ? trim($bmlUsernameRaw) : null;

            $tokenFields = [
                'terminal_id' => $terminal?->id,
                'access_token' => trim($validated['access_token']),
                'refresh_token' => trim($validated['refresh_token']),
                'device_id' => trim($validated['device_id']),
                'expires_in' => $expiresIn,
                'expires_at' => $expiresAt,
                'token_type' => 'Bearer',
                'last_grant' => 'superadmin_inject',
                'obtained_at' => Carbon::now(),
            ];

            try {
                if ($bmlUsername !== null) {
                    $existing = BmlCredentialGroup::where('tenant_id', $validated['tenant_id'])
                        ->where('bml_username', $bmlUsername)
                        ->where('profile_type', $validated['profile_type'])
                        ->first();

                    if ($existing) {
                        $existing->update($tokenFields);
                        $group = $existing;
                        $groupExisted = true;
                    } else {
                        $group = BmlCredentialGroup::create(array_merge($tokenFields, [
                            'tenant_id' => $validated['tenant_id'],
                            'bml_username' => $bmlUsername,
                            'profile_type' => $validated['profile_type'],
                        ]));
                        $groupExisted = false;
                    }
                } else {
                    // Null username: search for orphaned group with same tenant+profile_type
                    $orphan = BmlCredentialGroup::where('tenant_id', $validated['tenant_id'])
                        ->whereNull('bml_username')
                        ->where('profile_type', $validated['profile_type'])
                        ->whereDoesntHave('bankAccounts')
                        ->orderBy('id', 'asc')
                        ->first();

                    if ($orphan) {
                        $orphan->update($tokenFields);
                        $group = $orphan;
                        $groupExisted = true;
                    } else {
                        $group = BmlCredentialGroup::create(array_merge($tokenFields, [
                            'tenant_id' => $validated['tenant_id'],
                            'bml_username' => null,
                            'profile_type' => $validated['profile_type'],
                        ]));
                        $groupExisted = false;
                    }
                }
            } catch (QueryException $e) {
                if ((int) $e->getCode() === 23000) {
                    return ['error' => 'A BML credential group with these details already exists for this tenant.', 'status' => 422];
                }
                throw $e;
            }

            $account->update(['bml_credential_group_id' => $group->id]);

            SessionActivityLog::create([
                'tenant_id' => $validated['tenant_id'],
                'terminal_id' => $group->terminal_id,
                'bank_account_id' => $account->id,
                'bank_name' => $account->bank_name,
                'account_number_masked' => substr($account->account_number, -4),
                'event_type' => 'credential_injected',
                'event_summary' => "BML credentials manually injected for account #{$account->id} ({$account->account_number}) — group #{$group->id}",
                'event_detail' => [
                    'group_type' => 'bml',
                    'group_id' => $group->id,
                    'group_existed_before' => $groupExisted,
                    'account_id' => $account->id,
                    'account_number' => $account->account_number,
                    'performed_by' => auth()->id(),
                ],
                'created_at' => now(),
            ]);

            Log::info('BML credentials manually injected', [
                'group_id' => $group->id,
                'account_id' => $account->id,
                'account_number' => $account->account_number,
                'admin_user_id' => auth()->id(),
            ]);

            return [
                'success' => true,
                'group_id' => $group->id,
                'group_existed_before' => $groupExisted,
                'expires_warning' => $expiresAt === null ? 'No expiry set — token may appear valid even after actual expiry.' : null,
                'account' => [
                    'id' => $account->id,
                    'account_number' => $account->account_number,
                    'account_name' => $account->account_name,
                ],
            ];
        });

        if (isset($result['status']) && $result['status'] >= 400) {
            $status = $result['status'];
            unset($result['status']);

            return response()->json($result, $status);
        }

        return response()->json($result);
    }

    public function injectMibCredentials(Request $request)
    {
        $validated = $request->validate([
            'tenant_id' => 'required|integer',
            'bank_account_id' => 'required|integer',
            'terminal_id' => 'nullable|integer',
            'mib_username' => 'required|string',
            'key1' => 'required|string',
            'key2' => 'required|string',
            'app_id' => 'required|string|max:64',
            'profile_id' => 'nullable|string',
            'profile_type' => 'nullable|string|max:4',
            'profile_name' => 'nullable|string',
        ]);

        $mibUsername = trim($validated['mib_username']);

        $result = DB::transaction(function () use ($validated, $mibUsername) {
            $account = BankAccount::where('id', $validated['bank_account_id'])
                ->where('tenant_id', $validated['tenant_id'])
                ->lockForUpdate()
                ->first();

            if (! $account) {
                return ['error' => 'Bank account not found for this tenant', 'status' => 404];
            }

            if (strtolower($account->bank_name) !== 'mib') {
                return ['error' => 'Target account is not an MIB account', 'status' => 422];
            }

            if ($account->mib_credential_profile_id !== null) {
                return [
                    'error' => 'Target bank account is already linked to MIB credential profile #'.$account->mib_credential_profile_id.'. Unlink it first or choose a different account.',
                    'existing_profile_id' => $account->mib_credential_profile_id,
                    'status' => 422,
                ];
            }

            $terminal = null;
            if (! empty($validated['terminal_id'])) {
                $terminal = Terminal::where('id', $validated['terminal_id'])
                    ->where('tenant_id', $validated['tenant_id'])
                    ->first();
                if (! $terminal) {
                    return ['error' => 'Terminal not found for this tenant', 'status' => 404];
                }
            }

            $existing = MibCredentialGroup::where('tenant_id', $validated['tenant_id'])
                ->where('mib_username', $mibUsername)
                ->first();

            $groupFields = [
                'terminal_id' => $terminal?->id,
                'key1' => trim($validated['key1']),
                'key2' => trim($validated['key2']),
                'app_id' => trim($validated['app_id']),
                'obtained_at' => Carbon::now(),
            ];

            try {
                if ($existing) {
                    $existing->update($groupFields);
                    $group = $existing;
                    $groupExisted = true;
                } else {
                    $group = MibCredentialGroup::create(array_merge($groupFields, [
                        'tenant_id' => $validated['tenant_id'],
                        'mib_username' => $mibUsername,
                    ]));
                    $groupExisted = false;
                }

                $profileId = $validated['profile_id'] ?? 'default_profile';
                $profileType = $validated['profile_type'] ?? '0';
                $profileName = $validated['profile_name'] ?? '';

                $profile = MibCredentialProfile::updateOrCreate(
                    [
                        'credential_group_id' => $group->id,
                        'profile_id' => $profileId,
                    ],
                    [
                        'profile_type' => $profileType,
                        'profile_name' => $profileName,
                    ]
                );
            } catch (QueryException $e) {
                if ((int) $e->getCode() === 23000) {
                    return ['error' => 'An MIB credential group with these details already exists for this tenant.', 'status' => 422];
                }
                throw $e;
            }

            $account->update(['mib_credential_profile_id' => $profile->id]);

            SessionActivityLog::create([
                'tenant_id' => $validated['tenant_id'],
                'terminal_id' => $group->terminal_id,
                'bank_account_id' => $account->id,
                'bank_name' => $account->bank_name,
                'account_number_masked' => substr($account->account_number, -4),
                'event_type' => 'credential_injected',
                'event_summary' => "MIB credentials manually injected for account #{$account->id} ({$account->account_number}) — group #{$group->id}",
                'event_detail' => [
                    'group_type' => 'mib',
                    'group_id' => $group->id,
                    'profile_id' => $profile->id,
                    'group_existed_before' => $groupExisted,
                    'account_id' => $account->id,
                    'account_number' => $account->account_number,
                    'performed_by' => auth()->id(),
                ],
                'created_at' => now(),
            ]);

            Log::info('MIB credentials manually injected', [
                'group_id' => $group->id,
                'profile_id' => $profile->id,
                'account_id' => $account->id,
                'account_number' => $account->account_number,
                'admin_user_id' => auth()->id(),
            ]);

            return [
                'success' => true,
                'group_id' => $group->id,
                'profile_id' => $profile->id,
                'group_existed_before' => $groupExisted,
                'account' => [
                    'id' => $account->id,
                    'account_number' => $account->account_number,
                    'account_name' => $account->account_name,
                ],
            ];
        });

        if (isset($result['status']) && $result['status'] >= 400) {
            $status = $result['status'];
            unset($result['status']);

            return response()->json($result, $status);
        }

        return response()->json($result);
    }

    public function listTenantBankAccounts(Request $request, $id)
    {
        $tenant = Tenant::find($id);
        if (! $tenant) {
            return response()->json(['error' => 'Tenant not found'], 404);
        }

        $query = BankAccount::where('tenant_id', $id);

        if ($request->has('bank_name')) {
            $query->whereRaw('LOWER(bank_name) = ?', [strtolower($request->bank_name)]);
        }

        $accounts = $query->get()->map(fn ($a) => [
            'id' => $a->id,
            'account_number' => $a->account_number,
            'account_name' => $a->account_name,
            'bank_name' => $a->bank_name,
            'bml_linked_group_id' => $a->bml_credential_group_id,
            'mib_linked_profile_id' => $a->mib_credential_profile_id,
        ]);

        return response()->json($accounts);
    }
}
