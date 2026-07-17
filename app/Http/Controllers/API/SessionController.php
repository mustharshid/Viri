<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\SessionActivityLog;
use App\Models\SessionFetchRequest;
use App\Models\Terminal;
use App\Models\TerminalAccountActivity;
use App\Events\SyncCompleted;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class SessionController extends Controller
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function resolveTerminal(string $hardwareId): ?Terminal
    {
        $terminal = Terminal::where('hardware_id', $hardwareId)
            ->where('status', 'active')
            ->first();

        if ($terminal && $terminal->tenant && $terminal->tenant->license_expires_at && \Carbon\Carbon::parse($terminal->tenant->license_expires_at)->isPast()) {
            abort(response()->json(['error' => 'Subscription Expired - contact your admin!'], 403));
        }

        return $terminal;
    }

    private function resolveAccount(int $accountId, int $tenantId): ?BankAccount
    {
        return BankAccount::where('id', $accountId)
            ->where('tenant_id', $tenantId)
            ->first();
    }

    /**
     * Write a structured entry to session_activity_logs.
     */
    private function log(
        Terminal $terminal,
        ?BankAccount $account,
        string $eventType,
        string $summary,
        array $detail = [],
        ?string $holderSnapshot = null,
        ?string $maskedUsername = null
    ): void {
        dispatch(function () use ($terminal, $account, $eventType, $summary, $detail, $holderSnapshot, $maskedUsername) {
            SessionActivityLog::create([
                'tenant_id'               => $terminal->tenant_id,
                'terminal_id'             => $terminal->id,
                'terminal_name'           => $terminal->terminal_name,
                'bank_account_id'         => $account?->id,
                'bank_name'               => $account?->bank_name,
                'account_number_masked'   => $account ? $this->maskAccountNumber($account->account_number) : null,
                'event_type'              => $eventType,
                'event_summary'           => $summary,
                'event_detail'            => $detail ?: null,
                'masked_username'         => $maskedUsername,
                'session_holder_snapshot' => $holderSnapshot,
                'created_at'              => DB::raw('CURRENT_TIMESTAMP'),
            ]);
        })->afterResponse();
    }

    private function maskAccountNumber(string $number): string
    {
        $clean = preg_replace('/\s+/', '', $number);
        $len = strlen($clean);
        if ($len <= 4) return str_repeat('*', $len);
        return substr($clean, 0, 4) . str_repeat('*', max(0, $len - 8)) . substr($clean, -4);
    }

    private function holderName(?BankAccount $account): ?string
    {
        if (!$account || !$account->session_holder_terminal_id) return null;
        $holder = Terminal::find($account->session_holder_terminal_id);
        return $holder?->terminal_name;
    }

    // -------------------------------------------------------------------------
    // Claim Session
    // -------------------------------------------------------------------------

    /**
     * POST /terminal/session/claim
     * Atomically claim session holder for a bank account.
     * Returns: { status: 'claimed'|'already_holder'|'delegating', holder_terminal_name }
     */
    public function claimSession(Request $request)
    {
        $request->validate([
            'hardware_id'     => 'required|string',
            'bank_account_id' => 'required|integer',
            'force'           => 'nullable|boolean',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $account = $this->resolveAccount((int) $request->bank_account_id, $terminal->tenant_id);
        if (!$account) {
            return response()->json(['error' => 'Bank account not found'], 404);
        }

        $force = (bool) $request->input('force', false);

        $result = DB::transaction(function () use ($account, $terminal, $force) {
            $acc = BankAccount::where('id', $account->id)->lockForUpdate()->first();
            $now = now();
            $isLive = $force ? false : $acc->hasLiveSession();

            // Already the holder and still live
            if ($isLive && $acc->session_holder_terminal_id === $terminal->id) {
                return ['status' => 'already_holder'];
            }

            // Another terminal holds a live session → delegate
            if ($isLive && $acc->session_holder_terminal_id !== $terminal->id) {
                $holderName = Terminal::find($acc->session_holder_terminal_id)?->terminal_name ?? 'Unknown';
                return [
                    'status'              => 'delegating',
                    'holder_terminal_id'  => $acc->session_holder_terminal_id,
                    'holder_terminal_name'=> $holderName,
                ];
            }

            // No live session — claim it
            $wasHolder = $acc->session_holder_terminal_id
                ? Terminal::find($acc->session_holder_terminal_id)?->terminal_name
                : null;

            $acc->update([
                'session_holder_terminal_id' => $terminal->id,
                'session_claimed_at'         => $now,
                'session_last_heartbeat_at'  => $now,
            ]);

            // Mark any needs_retry requests for this account as pending (auto-retry)
            SessionFetchRequest::where('bank_account_id', $account->id)
                ->where('status', 'needs_retry')
                ->update(['status' => 'pending']);

            return ['status' => 'claimed', 'previous_holder' => $wasHolder];
        });

        if ($result['status'] === 'claimed') {
            $prevHolder = $result['previous_holder'];
            if ($prevHolder) {
                $this->log($terminal, $account, 'session_expired_claimed',
                    "Terminal \"{$terminal->terminal_name}\" reclaimed expired session from \"{$prevHolder}\" for {$account->bank_name} {$this->maskAccountNumber($account->account_number)}",
                    ['previous_holder' => $prevHolder],
                    $terminal->terminal_name
                );
            } else {
                $this->log($terminal, $account, 'session_claimed',
                    "Terminal \"{$terminal->terminal_name}\" is now the active session holder for {$account->bank_name} {$this->maskAccountNumber($account->account_number)}",
                    [],
                    $terminal->terminal_name
                );
            }
        } elseif ($result['status'] === 'delegating') {
            $this->log($terminal, $account, 'race_lost_delegating',
                "Terminal \"{$terminal->terminal_name}\" will delegate to active holder \"{$result['holder_terminal_name']}\" for {$account->bank_name} {$this->maskAccountNumber($account->account_number)}",
                ['holder' => $result['holder_terminal_name']],
                $result['holder_terminal_name']
            );
        }

        return response()->json($result);
    }

    // -------------------------------------------------------------------------
    // Heartbeat
    // -------------------------------------------------------------------------

    /**
     * POST /terminal/session/heartbeat
     * Keep-alive ping from the session holder.
     */
    public function heartbeat(Request $request)
    {
        $request->validate([
            'hardware_id'     => 'required|string',
            'bank_account_id' => 'required|integer',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        $updated = BankAccount::where('id', $request->bank_account_id)
            ->where('tenant_id', $terminal->tenant_id)
            ->where('session_holder_terminal_id', $terminal->id)
            ->update(['session_last_heartbeat_at' => now()]);

        if (!$updated) {
            return response()->json(['error' => 'Not the session holder or account not found'], 403);
        }

        return response()->json(['status' => 'ok']);
    }

    // -------------------------------------------------------------------------
    // Release Session
    // -------------------------------------------------------------------------

    /**
     * POST /terminal/session/release
     * Holder explicitly releases its session (logout, unlink, page close).
     */
    public function releaseSession(Request $request)
    {
        $request->validate([
            'hardware_id'     => 'required|string',
            'bank_account_id' => 'required|integer',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        $account = $this->resolveAccount((int) $request->bank_account_id, $terminal->tenant_id);
        if (!$account) return response()->json(['error' => 'Account not found'], 404);

        DB::transaction(function () use ($account, $terminal) {
            BankAccount::where('id', $account->id)
                ->where('session_holder_terminal_id', $terminal->id)
                ->update([
                    'session_holder_terminal_id' => null,
                    'session_claimed_at'         => null,
                    'session_last_heartbeat_at'  => null,
                ]);

            // Mark pending requests as needs_retry so the next holder picks them up
            SessionFetchRequest::where('bank_account_id', $account->id)
                ->whereIn('status', ['pending'])
                ->update(['status' => 'needs_retry']);
        });

        $this->log($terminal, $account, 'session_released',
            "Terminal \"{$terminal->terminal_name}\" released session for {$account->bank_name} {$this->maskAccountNumber($account->account_number)}"
        );

        return response()->json(['status' => 'released']);
    }

    // -------------------------------------------------------------------------
    // Get Status
    // -------------------------------------------------------------------------

    /**
     * POST /terminal/session/status
     * Check who holds the session for a given account.
     */
    public function getStatus(Request $request)
    {
        $request->validate([
            'hardware_id'     => 'required|string',
            'bank_account_id' => 'required|integer',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        $account = BankAccount::with(['fetchStartedByTerminal', 'lastSuccessfulFetchTerminal'])
            ->where('id', $request->bank_account_id)
            ->where('tenant_id', $terminal->tenant_id)
            ->first();

        if (!$account) return response()->json(['error' => 'Account not found'], 404);

        $isLive = $account->hasLiveSession();
        $holderName = $isLive ? Terminal::find($account->session_holder_terminal_id)?->terminal_name : null;
        $isSelf = $isLive && $account->session_holder_terminal_id === $terminal->id;

        // Mode detection with 15s flap prevention
        $activeCount = DB::table('terminal_account_activity')
            ->where('bank_account_id', $account->id)
            ->where('updated_at', '>=', DB::raw('NOW() - INTERVAL 30 SECOND'))
            ->count();

        $isMultiConfirmed = $activeCount > 1 && DB::table('terminal_account_activity')
            ->where('bank_account_id', $account->id)
            ->where('created_at', '<=', DB::raw('NOW() - INTERVAL 15 SECOND'))
            ->where('updated_at', '>=', DB::raw('NOW() - INTERVAL 30 SECOND'))
            ->count() > 1;

        $summary = Cache::get("sync_health_summary_{$account->id}", [
            'status' => 'healthy',
            'sync_confidence_score' => 100,
            'last_sync_at' => $account->last_bank_fetch_at ? $account->last_bank_fetch_at->toDateTimeString() : null,
            'avg_latency_ms' => 0,
            'p95_latency_ms' => 0,
            'failed_today' => 0,
            'consecutive_failures_count' => 0,
            'pending_backlog' => max(0, $account->sync_requested_version - $account->sync_version),
            'sync_efficiency' => 0,
            'calculated_at' => null,
        ]);

        $response = [
            'is_live'              => $isLive,
            'is_self'              => $isSelf,
            'holder_terminal_id'   => $isLive ? $account->session_holder_terminal_id : null,
            'holder_terminal_name' => $holderName,
            'sync_mode'            => $isMultiConfirmed ? 'multi' : 'single',
            'active_terminal_count'=> $activeCount,
            'last_bank_fetch_at'   => $account->last_bank_fetch_at,
            'sync_confidence_score'=> $summary['sync_confidence_score'] ?? 100,
            'health_status'        => $summary['status'] ?? 'healthy',
            'summary_generated_at' => $summary['calculated_at'] ?? null,
            'sync_efficiency'      => $summary['sync_efficiency'] ?? 0,
        ];

        $user = auth('sanctum')->user() ?? auth()->user();
        $isSuperadmin = ($user && $user->role === 'superadmin') || $request->input('role') === 'superadmin';

        if ($isSuperadmin) {
            $response['sync_version'] = $account->sync_version;
            $response['sync_requested_version'] = $account->sync_requested_version;
            $response['fetch_in_progress_until'] = $account->fetch_in_progress_until;
            $response['fetch_started_at'] = $account->fetch_started_at;
            $response['fetch_started_by_terminal'] = $account->fetchStartedByTerminal?->terminal_name;
            $response['last_successful_fetch_terminal'] = $account->lastSuccessfulFetchTerminal?->terminal_name;
        }

        return response()->json($response);
    }

    // -------------------------------------------------------------------------
    // Submit Fetch Request
    // -------------------------------------------------------------------------

    /**
     * POST /terminal/session/request
     * Requesting terminal queues a fetch request for the session holder.
     */
    public function submitRequest(Request $request)
    {
        $request->validate([
            'hardware_id'     => 'required|string',
            'bank_account_id' => 'required|integer',
            'request_type'    => 'required|in:search,ledger,history',
            'target_amount'   => 'nullable|numeric',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        $account = $this->resolveAccount((int) $request->bank_account_id, $terminal->tenant_id);
        if (!$account) return response()->json(['error' => 'Account not found'], 404);

        // Expire old pending requests from this terminal for this account (avoid duplicate queuing)
        SessionFetchRequest::where('bank_account_id', $account->id)
            ->where('requesting_terminal_id', $terminal->id)
            ->whereIn('status', ['pending', 'needs_retry'])
            ->update(['status' => 'expired']);

        $account->increment('sync_requested_version');
        $account->refresh();

        $fetchRequest = SessionFetchRequest::create([
            'bank_account_id'        => $account->id,
            'requesting_terminal_id' => $terminal->id,
            'request_type'           => $request->request_type,
            'target_amount'          => $request->target_amount,
            'status'                 => 'pending',
            'expires_at'             => now()->addSeconds(20),
            'required_sync_version'  => $account->sync_requested_version,
        ]);

        $holderName = $this->holderName($account);

        $this->log($terminal, $account, 'fetch_request_submitted',
            "Terminal \"{$terminal->terminal_name}\" requested {$request->request_type} data for {$account->bank_name} {$this->maskAccountNumber($account->account_number)} via active holder \"{$holderName}\"",
            [
                'request_id'    => $fetchRequest->id,
                'request_type'  => $request->request_type,
                'target_amount' => $request->target_amount,
                'holder'        => $holderName,
            ],
            $holderName
        );

        // Notify active leader via SSE for instant trigger
        if ($account->session_holder_terminal_id) {
            $leader = Terminal::find($account->session_holder_terminal_id);
            if ($leader && $leader->status === 'active') {
                // Leader will be notified via the pending requests poll
            }
        }

        return response()->json(['request_id' => $fetchRequest->id]);
    }

    // -------------------------------------------------------------------------
    // Get Pending Requests (called by session holder)
    // -------------------------------------------------------------------------

    /**
     * POST /terminal/session/pending
     * Returns all pending fetch requests for accounts this terminal holds.
     */
    public function getPendingRequests(Request $request)
    {
        $request->validate(['hardware_id' => 'required|string']);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        // Find all accounts where this terminal is the live holder
        $accountIds = BankAccount::where('tenant_id', $terminal->tenant_id)
            ->where('session_holder_terminal_id', $terminal->id)
            ->where('session_last_heartbeat_at', '>=', now()->subSeconds(30))
            ->pluck('id');

        if ($accountIds->isEmpty()) {
            return response()->json(['requests' => []]);
        }

        // Expire requests that hit their TTL
        SessionFetchRequest::whereIn('bank_account_id', $accountIds)
            ->where('status', 'pending')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired']);

        // Check version gap to see if we should skip fetching
        $pending = SessionFetchRequest::with(['bankAccount', 'requestingTerminal'])
            ->whereIn('bank_account_id', $accountIds)
            ->where('status', 'pending')
            ->where('expires_at', '>', now())
            ->orderBy('created_at')
            ->get();

        $filteredPending = collect();

        foreach ($pending as $r) {
            $acc = $r->bankAccount;
            if ($acc && $acc->sync_version >= $r->required_sync_version) {
                // Already satisfied — push to pending so the leader can fulfill
                $filteredPending->push($r);
            } else {
                $filteredPending->push($r);
            }
        }

        if ($filteredPending->isEmpty()) {
            return response()->json(['requests' => []]);
        }

        // Acquire fetch lock for the accounts we are about to fetch
        foreach ($filteredPending->unique('bank_account_id') as $r) {
            $acc = $r->bankAccount;
            if ($acc) {
                // Try to acquire lock
                $acquired = DB::table('bank_accounts')
                    ->where('id', $acc->id)
                    ->where(function ($q) {
                        $q->whereNull('fetch_in_progress_until')
                          ->orWhere('fetch_in_progress_until', '<', DB::raw('CURRENT_TIMESTAMP'));
                    })
                    ->update([
                        'fetch_in_progress_until' => DB::raw('CURRENT_TIMESTAMP + INTERVAL 30 SECOND'),
                        'fetch_started_at' => DB::raw('CURRENT_TIMESTAMP'),
                        'fetch_started_by_terminal_id' => $terminal->id,
                    ]);

                if ($acquired) {
                    $r->update([
                        'holder_received_at' => now(),
                        'bank_fetch_started_at' => now(),
                    ]);
                }
            }
        }

        $pendingData = $filteredPending->map(fn($r) => [
            'id'           => $r->id,
            'bank_account_id' => $r->bank_account_id,
            'account_number' => $r->bankAccount?->account_number,
            'account_name'   => $r->bankAccount?->account_name,
            'bank_name'    => $r->bankAccount?->bank_name,
            'mib_profile_type' => $r->bankAccount?->mib_profile_type ?? '0',
            'bml_profile_type' => $r->bankAccount?->bml_profile_type ?? '0',
            'bml_auth_state'   => $r->bankAccount?->bml_auth_state,
            'request_type' => $r->request_type,
            'target_amount'=> $r->target_amount,
            'requester_name' => $r->requestingTerminal?->terminal_name,
        ]);

        return response()->json(['requests' => $pendingData]);
    }

    // -------------------------------------------------------------------------
    // Fulfill Request (called by session holder after fetching)
    // -------------------------------------------------------------------------

    /**
     * POST /terminal/session/fulfill
     * Session holder posts the fetched result for a pending request.
     */
    public function fulfillRequest(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'request_id'  => 'required|integer',
            'status'      => 'required|in:fulfilled,failed',
            'result_json' => 'nullable|array',
            'error_message' => 'nullable|string',
            'duration_ms' => 'nullable|integer',
            'fingerprint' => 'nullable|string',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        $fetchRequest = SessionFetchRequest::find($request->request_id);
        if (!$fetchRequest) return response()->json(['error' => 'Request not found'], 404);

        $account = $fetchRequest->bankAccount;

        $fetchRequest->update([
            'status'        => $request->status,
            'result_json'   => $request->result_json,
            'error_message' => $request->error_message,
            'bank_fetch_completed_at' => now(),
            'result_received_by_requester_at' => now(),
        ]);

        if ($request->status === 'fulfilled' && $account) {
            // Update sync versions & timestamps on bank account atomically (Synchronous)
            BankAccount::where('id', $account->id)->update([
                'sync_version' => DB::raw('sync_version + 1'),
                'last_bank_fetch_at' => DB::raw('CURRENT_TIMESTAMP'),
                'last_successful_fetch_terminal_id' => $terminal->id,
            ]);

            // Save transactions to permanent ledger (insertOrIgnore to avoid duplicates)
            $incoming = $request->result_json['transactions'] ?? [];

            // Cache fingerprint if provided
            if ($request->fingerprint) {
                Cache::forever("bank_account_fingerprint_{$account->id}", $request->fingerprint);
            }
        }

        // Always release the fetch lock
        if ($account) {
            BankAccount::where('id', $account->id)->update([
                'fetch_in_progress_until' => null,
                'fetch_started_at' => null,
                'fetch_started_by_terminal_id' => null,
            ]);
        }

        $requesterName = $fetchRequest->requestingTerminal?->terminal_name ?? 'Unknown';
        $durationMs = $request->duration_ms ?? 0;
        $durationStr = $durationMs ? "{$durationMs}ms" : 'unknown duration';

        if ($request->status === 'fulfilled') {
            $this->log($terminal, $account, 'fetch_request_fulfilled',
                "Holder \"{$terminal->terminal_name}\" fulfilled data request for Terminal \"{$requesterName}\" ({$account?->bank_name} {$this->maskAccountNumber($account?->account_number ?? '')}, {$durationStr})",
                [
                    'request_id'   => $fetchRequest->id,
                    'requester'    => $requesterName,
                    'duration_ms'  => $durationMs,
                    'request_type' => $fetchRequest->request_type,
                    'result_json'  => $request->result_json,
                ],
                $terminal->terminal_name
            );
        } else {
            $this->log($terminal, $account, 'fetch_request_failed',
                "Holder \"{$terminal->terminal_name}\" failed to fulfil request for Terminal \"{$requesterName}\" — {$request->error_message}",
                [
                    'request_id'    => $fetchRequest->id,
                    'requester'     => $requesterName,
                    'error_message' => $request->error_message,
                ],
                $terminal->terminal_name
            );
        }

        // Dispatch SyncCompleted Event (DEFERRED Telemetry)
        if ($account) {
            dispatch(function () use ($fetchRequest, $terminal, $durationMs, $request) {
                event(new \App\Events\SyncCompleted(
                    requestId: $fetchRequest->id,
                    bankAccountId: $fetchRequest->bank_account_id,
                    terminalId: $terminal->id,
                    durationMs: $durationMs,
                    status: $request->status === 'fulfilled' ? 'success' : 'failed',
                    failureReason: $request->error_message,
                    timestamps: [
                        'requested_at' => $fetchRequest->created_at,
                        'holder_received_at' => $fetchRequest->holder_received_at,
                        'bank_fetch_started_at' => $fetchRequest->bank_fetch_started_at,
                        'bank_fetch_completed_at' => $fetchRequest->bank_fetch_completed_at,
                        'result_received_at' => now(),
                    ]
                ));
            })->afterResponse();
        }

        return response()->json(['status' => 'ok']);
    }

    // -------------------------------------------------------------------------
    // Poll Result (called by requesting terminal)
    // -------------------------------------------------------------------------

    /**
     * GET /terminal/session/result/{id}
     * Requesting terminal polls for its result.
     */
    public function pollResult(Request $request, int $id)
    {
        $request->validate(['hardware_id' => 'required|string']);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        $fetchRequest = SessionFetchRequest::where('id', $id)
            ->where('requesting_terminal_id', $terminal->id)
            ->first();

        if (!$fetchRequest) return response()->json(['error' => 'Request not found'], 404);

        if ($fetchRequest->status === 'expired' || ($fetchRequest->status === 'pending' && $fetchRequest->expires_at && $fetchRequest->expires_at->isPast())) {
            if ($fetchRequest->status === 'pending') {
                $fetchRequest->update(['status' => 'expired']);
            }
            return response()->json([
                'status'        => 'expired',
                'result_json'   => null,
                'error_message' => 'Unable to refresh. No active bank terminal responded in time.',
            ]);
        }

        return response()->json([
            'status'        => $fetchRequest->status,
            'result_json'   => $fetchRequest->result_json,
            'error_message' => $fetchRequest->error_message,
        ]);
    }

    // -------------------------------------------------------------------------
    // Log Event (called by the browser extension)
    // -------------------------------------------------------------------------

    /**
     * POST /terminal/session/log
     * The extension posts session events directly (login started/succeeded/failed, etc.)
     */
    public function logEvent(Request $request)
    {
        $request->validate([
            'hardware_id'    => 'required|string',
            'event_type'     => 'required|string',
            'bank_account_id'=> 'nullable|integer',
            'event_summary'  => 'nullable|string',
            'event_detail'   => 'nullable|array',
            'masked_username'=> 'nullable|string',
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)
            ->where('status', 'active')
            ->first();

        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        // Respect the share_pwa_logs setting
        $shareLogs = $terminal->permissions['share_pwa_logs'] ?? true;
        if (!$shareLogs) {
            return response()->json(['status' => 'skipped']);
        }

        $account = null;
        if ($request->bank_account_id) {
            $account = BankAccount::where('id', $request->bank_account_id)
                ->where('tenant_id', $terminal->tenant_id)
                ->first();
        }

        $holderName = $account ? $this->holderName($account) : null;

        // Auto-generate summary if not provided
        $summary = $request->event_summary
            ?? SessionActivityLog::eventLabel($request->event_type) . " on terminal \"{$terminal->terminal_name}\"";

        $eventDetail = $request->event_detail ?? [];
        if ($request->has('pwa_logs')) {
            $eventDetail['pwa_logs'] = $request->pwa_logs;
        }
        if ($request->has('extension_version')) {
            $eventDetail['extension_version'] = $request->extension_version;
        }

        SessionActivityLog::create([
            'tenant_id'               => $terminal->tenant_id,
            'terminal_id'             => $terminal->id,
            'terminal_name'           => $terminal->terminal_name,
            'bank_account_id'         => $account?->id,
            'bank_name'               => $account?->bank_name,
            'account_number_masked'   => $account ? $this->maskAccountNumber($account->account_number) : null,
            'event_type'              => $request->event_type,
            'event_summary'           => $summary,
            'event_detail'            => empty($eventDetail) ? null : $eventDetail,
            'masked_username'         => $request->masked_username,
            'ip_address'              => $request->ip(),
            'session_holder_snapshot' => $holderName,
            'created_at'              => now(),
        ]);

        return response()->json(['status' => 'logged']);
    }

    public function recordActivity(Request $request)
    {
        $request->validate([
            'hardware_id'     => 'required|string',
            'bank_account_id' => 'required|integer',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        $account = BankAccount::where('id', $request->bank_account_id)
            ->where('tenant_id', $terminal->tenant_id)
            ->first();
        if (!$account) return response()->json(['error' => 'Account not accessible'], 403);

        $isNewRow = DB::table('terminal_account_activity')
            ->where('terminal_id', $terminal->id)
            ->where('bank_account_id', $account->id)
            ->doesntExist();

        DB::table('terminal_account_activity')->upsert(
            [
                'terminal_id'     => $terminal->id,
                'bank_account_id' => $account->id,
                'created_at'      => DB::raw('CURRENT_TIMESTAMP'),
                'updated_at'      => DB::raw('CURRENT_TIMESTAMP')
            ],
            ['terminal_id', 'bank_account_id'],
            ['updated_at']
        );

        if ($isNewRow || $this->modeTransitionDetected($account->id)) {
            $this->log($terminal, $account, $isNewRow ? 'terminal_account_opened' : 'sync_mode_changed',
                $isNewRow 
                    ? "Terminal \"{$terminal->terminal_name}\" opened {$account->bank_name} {$this->maskAccountNumber($account->account_number)}"
                    : "Terminal \"{$terminal->terminal_name}\" changed sync mode"
            );
        }

        return response()->json(['status' => 'ok']);
    }

    private function modeTransitionDetected(int $accountId): bool
    {
        $activeCount = DB::table('terminal_account_activity')
            ->where('bank_account_id', $accountId)
            ->where('updated_at', '>=', DB::raw('NOW() - INTERVAL 30 SECOND'))
            ->count();

        return $activeCount === 2;
    }

    public function checkFingerprint(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'account_id'  => 'required|integer',
            'fingerprint' => 'required|string',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        $account = BankAccount::where('id', $request->account_id)
            ->where('tenant_id', $terminal->tenant_id)
            ->first();
        if (!$account) return response()->json(['error' => 'Account not accessible'], 403);

        $cacheKey = "bank_account_fingerprint_{$account->id}";
        $lastFingerprint = Cache::get($cacheKey);

        if ($lastFingerprint && $lastFingerprint === $request->fingerprint) {
            return response()->json(['status' => 'no_change']);
        }

        return response()->json(['status' => 'upload_required']);
    }

    public function updateBmlAuth(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'bank_account_id' => 'required|integer',
            'bml_auth_state' => 'required|json',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) return response()->json(['error' => 'Terminal unauthorized'], 403);

        $account = BankAccount::where('id', $request->bank_account_id)
            ->where('tenant_id', $terminal->tenant_id)
            ->first();

        if (!$account) {
            return response()->json(['error' => 'Account not accessible'], 403);
        }

        $account->update([
            'bml_auth_state' => $request->bml_auth_state
        ]);

        return response()->json(['status' => 'success']);
    }
}
