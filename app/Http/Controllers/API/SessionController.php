<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\SessionActivityLog;
use App\Models\SessionFetchRequest;
use App\Models\Terminal;
use App\Models\TerminalEvent;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
            'created_at'              => now(),
        ]);
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
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $account = $this->resolveAccount((int) $request->bank_account_id, $terminal->tenant_id);
        if (!$account) {
            return response()->json(['error' => 'Bank account not found'], 404);
        }

        $result = DB::transaction(function () use ($account, $terminal) {
            $acc = BankAccount::where('id', $account->id)->lockForUpdate()->first();
            $now = now();
            $isLive = $acc->hasLiveSession();

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

        $account = $this->resolveAccount((int) $request->bank_account_id, $terminal->tenant_id);
        if (!$account) return response()->json(['error' => 'Account not found'], 404);

        $isLive = $account->hasLiveSession();
        $holderName = $isLive ? Terminal::find($account->session_holder_terminal_id)?->terminal_name : null;
        $isSelf = $isLive && $account->session_holder_terminal_id === $terminal->id;

        return response()->json([
            'is_live'              => $isLive,
            'is_self'              => $isSelf,
            'holder_terminal_id'   => $isLive ? $account->session_holder_terminal_id : null,
            'holder_terminal_name' => $holderName,
        ]);
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

        $fetchRequest = SessionFetchRequest::create([
            'bank_account_id'        => $account->id,
            'requesting_terminal_id' => $terminal->id,
            'request_type'           => $request->request_type,
            'target_amount'          => $request->target_amount,
            'status'                 => 'pending',
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
                TerminalEvent::create([
                    'hardware_id' => $leader->hardware_id,
                    'event_type'  => 'verify_request_queued',
                    'payload'     => json_encode([
                        'request_id'      => $fetchRequest->id,
                        'bank_account_id' => $account->id,
                    ])
                ]);
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

        $pending = SessionFetchRequest::with(['bankAccount', 'requestingTerminal'])
            ->whereIn('bank_account_id', $accountIds)
            ->whereIn('status', ['pending'])
            ->orderBy('created_at')
            ->get()
            ->map(fn($r) => [
                'id'           => $r->id,
                'bank_account_id' => $r->bank_account_id,
                'account_number' => $r->bankAccount?->account_number,
                'bank_name'    => $r->bankAccount?->bank_name,
                'mib_profile_type' => $r->bankAccount?->mib_profile_type ?? '0',
                'request_type' => $r->request_type,
                'target_amount'=> $r->target_amount,
                'requester_name' => $r->requestingTerminal?->terminal_name,
            ]);

        return response()->json(['requests' => $pending]);
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
        ]);

        if ($request->status === 'fulfilled' && $account) {
            // Automatically update/create the cache to ensure follower syncs receive the data
            $cache = \App\Models\BankAccountCache::firstOrNew(['bank_account_id' => $account->id]);
            $existing = $cache->transactions ?: [];
            $incoming = $request->result_json['transactions'] ?? [];

            $merged = collect(array_merge($incoming, $existing))
                ->unique(function ($tx) {
                    return trim($tx['date'] ?? '') . '-' . trim($tx['amount'] ?? '') . '-' . trim($tx['details'] ?? '');
                })
                ->take(500)
                ->values()
                ->toArray();

            $cache->tenant_id = $terminal->tenant_id;
            $cache->balance = $request->result_json['balance'] ?? $cache->balance ?? '0.00';
            $cache->transactions = $merged;
            $cache->cached_at = now();
            $cache->cached_by_terminal_id = $terminal->id;
            $cache->cache_version += 1;
            $cache->save();
        }

        $requesterName = $fetchRequest->requestingTerminal?->terminal_name ?? 'Unknown';
        $durationStr = $request->duration_ms ? "{$request->duration_ms}ms" : 'unknown duration';

        if ($request->status === 'fulfilled') {
            $this->log($terminal, $account, 'fetch_request_fulfilled',
                "Holder \"{$terminal->terminal_name}\" fulfilled data request for Terminal \"{$requesterName}\" ({$account?->bank_name} {$this->maskAccountNumber($account?->account_number ?? '')}, {$durationStr})",
                [
                    'request_id'   => $fetchRequest->id,
                    'requester'    => $requesterName,
                    'duration_ms'  => $request->duration_ms,
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
}
