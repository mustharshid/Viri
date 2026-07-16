<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\BankAccountCache;
use App\Models\SessionActivityLog;
use App\Models\SessionFetchRequest;
use App\Models\Terminal;
use App\Models\TerminalEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Events\SyncCompleted;

class LedgerCacheController extends Controller
{
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

    private function maskAccountNumber(string $number): string
    {
        $clean = preg_replace('/\s+/', '', $number);
        $len = strlen($clean);
        if ($len <= 4) return str_repeat('*', $len);
        return substr($clean, 0, 4) . str_repeat('*', max(0, $len - 8)) . substr($clean, -4);
    }

    private function logEvent(
        Terminal $terminal,
        ?BankAccount $account,
        string $eventType,
        string $summary,
        array $detail = []
    ): void {
        SessionActivityLog::create([
            'tenant_id'             => $terminal->tenant_id,
            'terminal_id'           => $terminal->id,
            'terminal_name'         => $terminal->terminal_name,
            'bank_account_id'       => $account?->id,
            'bank_name'             => $account?->bank_name,
            'account_number_masked' => $account ? $this->maskAccountNumber($account->account_number) : null,
            'event_type'            => $eventType,
            'event_summary'         => $summary,
            'event_detail'          => $detail ?: null,
            'created_at'            => now(),
        ]);
    }

    /**
     * GET /api/terminal/events
     * SSE Stream for real-time signaling.
     */
    public function streamEvents(Request $request)
    {
        $hardwareId = $request->query('hardware_id');
        if (!$hardwareId) {
            return response()->json(['error' => 'hardware_id parameter is required'], 400);
        }

        return response()->stream(function () use ($hardwareId) {
            $startTime = time();
            $lastHeartbeat = time();
            
            // Set execution limit to 0 (unlimited time)
            if (function_exists('set_time_limit')) {
                @set_time_limit(0);
            }

            while (true) {
                if (connection_aborted() || (time() - $startTime >= 25)) {
                    break;
                }

                // Check for undelivered events for this terminal locklessly
                $events = DB::table('terminal_events')
                    ->where('hardware_id', $hardwareId)
                    ->where('delivered', false)
                    ->get();

                if ($events->isNotEmpty()) {
                    DB::table('terminal_events')
                        ->whereIn('id', $events->pluck('id'))
                        ->update([
                            'delivered' => true,
                            'updated_at' => now()
                        ]);

                    foreach ($events as $event) {
                        echo "event: " . $event->event_type . "\n";
                        echo "data: " . $event->payload . "\n\n";
                    }

                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                }

                // Periodic keep-alive event (every 10 seconds)
                if (time() - $lastHeartbeat > 10) {
                    echo ": keep-alive\n\n";
                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                    $lastHeartbeat = time();
                }

                usleep(1500000); // 1.5s polling pause to reduce CPU load
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no', // Disable Nginx buffering
        ]);
    }

    public function pollEvents(Request $request)
    {
        $hardwareId = $request->query('hardware_id');
        if (!$hardwareId) {
            return response()->json(['error' => 'hardware_id parameter is required'], 400);
        }

        // Fast lockless query
        $events = DB::table('terminal_events')
            ->where('hardware_id', $hardwareId)
            ->where('delivered', false)
            ->get();

        if ($events->isNotEmpty()) {
            DB::table('terminal_events')
                ->whereIn('id', $events->pluck('id'))
                ->update([
                    'delivered' => true,
                    'updated_at' => now()
                ]);
        }

        return response()->json($events);
    }

    /**
     * GET /api/terminal/ledger-cache/{account_id}
     */
    public function readCache(Request $request, $bankAccountId)
    {
        $request->validate(['hardware_id' => 'required|string']);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $account = $this->resolveAccount((int) $bankAccountId, $terminal->tenant_id);
        if (!$account) {
            return response()->json(['error' => 'Bank account not found'], 404);
        }

        $cache = BankAccountCache::where('bank_account_id', $account->id)->first();

        // Check if there is an active session holder
        $isLive = $account->hasLiveSession();
        $holderName = $isLive ? Terminal::find($account->session_holder_terminal_id)?->terminal_name : null;

        $transactions = $cache?->transactions ?? [];
        $transactions = array_map(function ($tx) use ($account) {
            if (!isset($tx['hash'])) {
                $tx['hash'] = hash('sha256', implode('|', [
                    $account->id,
                    $tx['date'] ?? '',
                    $tx['amount'] ?? '',
                    $tx['details'] ?? '',
                    $tx['reference'] ?? '',
                ]));
            }
            return $tx;
        }, $transactions);

        return response()->json([
            'balance'               => $cache?->balance ?? 'Not synced',
            'transactions'          => $transactions,
            'cached_at'             => $cache?->cached_at ? $cache->cached_at->toIso8601String() : null,
            'cache_version'         => $cache?->cache_version ?? 0,
            'is_live'               => $isLive,
            'holder_terminal_id'    => $isLive ? $account->session_holder_terminal_id : null,
            'holder_terminal_name'  => $holderName,
            'checked_hashes'        => DB::table('bank_transactions')->where('bank_account_id', $account->id)->where('is_checked', true)->pluck('transaction_hash'),
        ]);
    }

    /**
     * POST /api/terminal/ledger-cache/push
     */
    public function pushCache(Request $request)
    {
        $request->validate([
            'hardware_id'     => 'required|string',
            'bank_account_id' => 'required|integer',
            'balance'         => 'required|string',
            'transactions'    => 'required|array',
            'request_id'      => 'nullable|integer',
            'fingerprint'     => 'nullable|string',
            'duration_ms'     => 'nullable|integer',
            'status'          => 'nullable|string',
            'error_message'   => 'nullable|string',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $account = $this->resolveAccount((int) $request->bank_account_id, $terminal->tenant_id);
        if (!$account) {
            return response()->json(['error' => 'Bank account not found'], 404);
        }

        $status = $request->status ?? 'fulfilled';

        $fetchRequest = null;
        if ($request->request_id) {
            $fetchRequest = SessionFetchRequest::find($request->request_id);
            if ($fetchRequest) {
                $fetchRequest->update([
                    'status' => $status,
                    'result_json' => [
                        'balance' => $request->balance,
                        'transactions' => $request->transactions,
                    ],
                    'error_message' => $request->error_message,
                    'bank_fetch_completed_at' => now(),
                    'result_received_by_requester_at' => now(),
                ]);
            }
        }

        if ($status === 'fulfilled') {
            // Update sync versions & timestamps on bank account atomically (Synchronous)
            BankAccount::where('id', $account->id)->update([
                'sync_version' => DB::raw('sync_version + 1'),
                'last_bank_fetch_at' => DB::raw('CURRENT_TIMESTAMP'),
                'last_successful_fetch_terminal_id' => $terminal->id,
            ]);

            // Save transactions to permanent ledger (insertOrIgnore to avoid duplicates)
            $incoming = $request->transactions;
            foreach ($incoming as $tx) {
                $hash = hash('sha256', implode('|', [
                    $account->id,
                    $tx['date'] ?? '',
                    $tx['amount'] ?? '',
                    $tx['details'] ?? '',
                    $tx['reference'] ?? '',
                ]));

                DB::table('bank_transactions')->insertOrIgnore([
                    'bank_account_id' => $account->id,
                    'transaction_hash' => $hash,
                    'amount' => $tx['amount'] ?? '0.00',
                    'transaction_date' => $tx['date'] ?? now()->toDateString(),
                    'description' => $tx['details'] ?? '',
                    'reference' => $tx['reference'] ?? null,
                    'created_at' => DB::raw('CURRENT_TIMESTAMP'),
                    'updated_at' => DB::raw('CURRENT_TIMESTAMP'),
                ]);
            }

            // Cache fingerprint if provided
            if ($request->fingerprint) {
                Cache::forever("bank_account_fingerprint_{$account->id}", $request->fingerprint);
            }

            // Automatically update/create the cache snapshot
            $cache = BankAccountCache::firstOrNew(['bank_account_id' => $account->id]);
            $existing = $cache->transactions ?: [];

            $merged = collect(array_merge($incoming, $existing))
                ->unique(function ($tx) {
                    return trim($tx['date'] ?? '') . '-' . trim($tx['amount'] ?? '') . '-' . trim($tx['details'] ?? '');
                })
                ->map(function ($tx) use ($account) {
                    if (!isset($tx['hash'])) {
                        $tx['hash'] = hash('sha256', implode('|', [
                            $account->id,
                            $tx['date'] ?? '',
                            $tx['amount'] ?? '',
                            $tx['details'] ?? '',
                            $tx['reference'] ?? '',
                        ]));
                    }
                    return $tx;
                })
                ->take(500)
                ->values()
                ->toArray();

            $cache->tenant_id = $terminal->tenant_id;
            $cache->balance = $request->balance;
            $cache->transactions = $merged;
            $cache->cached_at = now();
            $cache->cached_by_terminal_id = $terminal->id;
            $cache->cache_version += 1;
            $cache->save();
        }

        // Always release the fetch lock
        BankAccount::where('id', $account->id)->update([
            'fetch_in_progress_until' => null,
            'fetch_started_at' => null,
            'fetch_started_by_terminal_id' => null,
        ]);

        $durationMs = $request->duration_ms ?? 0;
        $durationStr = $durationMs ? "{$durationMs}ms" : 'unknown duration';

        // Audit Logging (Deferred)
        dispatch(function () use ($terminal, $account, $status, $durationStr, $request, $fetchRequest) {
            $requesterName = $fetchRequest ? ($fetchRequest->requestingTerminal?->terminal_name ?? 'Unknown') : 'System';
            if ($status === 'fulfilled') {
                SessionActivityLog::create([
                    'tenant_id' => $terminal->tenant_id,
                    'terminal_id' => $terminal->id,
                    'terminal_name' => $terminal->terminal_name,
                    'bank_account_id' => $account->id,
                    'bank_name' => $account->bank_name,
                    'account_number_masked' => $account->account_number ? substr($account->account_number, 0, 4) . '...' : null,
                    'event_type' => 'fetch_request_fulfilled',
                    'event_summary' => "Holder \"{$terminal->terminal_name}\" fulfilled data request for Terminal \"{$requesterName}\" ({$account->bank_name}, {$durationStr})",
                    'event_detail' => $request->all(),
                    'created_at' => DB::raw('CURRENT_TIMESTAMP'),
                ]);
            } else {
                SessionActivityLog::create([
                    'tenant_id' => $terminal->tenant_id,
                    'terminal_id' => $terminal->id,
                    'terminal_name' => $terminal->terminal_name,
                    'bank_account_id' => $account->id,
                    'bank_name' => $account->bank_name,
                    'account_number_masked' => $account->account_number ? substr($account->account_number, 0, 4) . '...' : null,
                    'event_type' => 'fetch_request_failed',
                    'event_summary' => "Holder \"{$terminal->terminal_name}\" failed to fulfil request for Terminal \"{$requesterName}\" — {$request->error_message}",
                    'event_detail' => $request->all(),
                    'created_at' => DB::raw('CURRENT_TIMESTAMP'),
                ]);
            }
        })->afterResponse();

        // Dispatch SyncCompleted Event (DEFERRED Telemetry)
        if ($fetchRequest) {
            dispatch(function () use ($fetchRequest, $terminal, $durationMs, $status, $request) {
                event(new \App\Events\SyncCompleted(
                    requestId: $fetchRequest->id,
                    bankAccountId: $fetchRequest->bank_account_id,
                    terminalId: $terminal->id,
                    durationMs: $durationMs,
                    status: $status === 'fulfilled' ? 'success' : 'failed',
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

    /**
     * POST /api/terminal/ledger-cache/request-refresh
     */
    public function requestRefresh(Request $request)
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

        $isLive = $account->hasLiveSession();
        if (!$isLive || !$account->session_holder_terminal_id) {
            return response()->json(['status' => 'no_holder', 'error' => 'No active session holder. Sync directly.']);
        }

        $leader = Terminal::find($account->session_holder_terminal_id);
        if (!$leader || $leader->status !== 'active') {
            return response()->json(['status' => 'no_holder', 'error' => 'Active session holder is offline or inactive.']);
        }

        // Expire previous pending requests from this terminal for this account
        SessionFetchRequest::where('bank_account_id', $account->id)
            ->where('requesting_terminal_id', $terminal->id)
            ->whereIn('status', ['pending', 'syncing', 'needs_retry'])
            ->update(['status' => 'expired']);

        // Create fetch request
        $fetchReq = SessionFetchRequest::create([
            'bank_account_id'        => $account->id,
            'requesting_terminal_id' => $terminal->id,
            'request_type'           => 'ledger',
            'status'                 => 'pending',
        ]);

        // Push event via SSE queue to the leader's hardware ID
        TerminalEvent::create([
            'hardware_id' => $leader->hardware_id,
            'event_type'  => 'cache_refresh_requested',
            'payload'     => [
                'request_id'      => $fetchReq->id,
                'bank_account_id' => $account->id,
                'bank_name'       => $account->bank_name,
                'account_number'  => $account->account_number,
                'account_name'    => $account->account_name,
                'mib_profile_type'=> $account->mib_profile_type ?? '0',
                'bml_profile_type'=> $account->bml_profile_type ?? '0',
                'bml_auth_state'  => $account->bml_auth_state,
                'requester_name'  => $terminal->terminal_name,
            ]
        ]);

        $this->logEvent($terminal, $account, 'fetch_request_submitted',
            "Terminal \"{$terminal->terminal_name}\" requested real-time cache refresh for {$account->bank_name} via leader \"{$leader->terminal_name}\" (Request ID: {$fetchReq->id})"
        );

        return response()->json([
            'status'     => 'pending',
            'request_id' => $fetchReq->id,
        ]);
    }

    /**
     * POST /api/terminal/session/acknowledge
     */
    public function acknowledge(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'request_id'  => 'required|integer',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $fetchReq = SessionFetchRequest::find($request->request_id);
        if (!$fetchReq) {
            return response()->json(['error' => 'Request not found'], 404);
        }

        // Verify the terminal acknowledging is actually the holder of the account
        $account = $fetchReq->bankAccount;
        if (!$account || $account->session_holder_terminal_id !== $terminal->id) {
            return response()->json(['error' => 'Not the session holder for this account'], 403);
        }

        $fetchReq->update(['status' => 'syncing']);

        $this->logEvent($terminal, $account, 'fetch_request_syncing',
            "Leader \"{$terminal->terminal_name}\" acknowledged request ID {$fetchReq->id} and is now syncing..."
        );

        return response()->json(['status' => 'ok']);
    }

    /**
     * POST /api/terminal/transaction/check
     */
    public function checkTransaction(Request $request)
    {
        $request->validate([
            'hardware_id'     => 'required|string',
            'bank_account_id' => 'required|integer',
            'hash'            => 'required|string',
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $account = $this->resolveAccount((int) $request->bank_account_id, $terminal->tenant_id);
        if (!$account) {
            return response()->json(['error' => 'Bank account not found'], 404);
        }

        $tx = DB::table('bank_transactions')
            ->where('bank_account_id', $account->id)
            ->where('transaction_hash', $request->hash)
            ->first();

        if (!$tx) {
            return response()->json(['error' => 'Transaction not found'], 404);
        }

        if ($tx->is_checked) {
            return response()->json(['error' => 'Already checked'], 400);
        }

        DB::table('bank_transactions')
            ->where('id', $tx->id)
            ->update([
                'is_checked' => true,
                'checked_by' => $request->user()->id ?? null,
                'updated_at' => now(),
            ]);

        // Broadcast to all OTHER active terminals in the tenant
        $activeTerminals = \App\Models\Terminal::where('tenant_id', $terminal->tenant_id)
            ->where('status', 'active')
            ->where('id', '!=', $terminal->id)
            ->get();

        foreach ($activeTerminals as $t) {
            \App\Models\TerminalEvent::create([
                'tenant_id'          => $terminal->tenant_id,
                'target_terminal_id' => $t->id,
                'hardware_id'        => $t->hardware_id,
                'event_type'         => 'transaction_checked',
                'payload'            => [
                    'hash'            => $request->hash,
                    'bank_account_id' => $account->id,
                ]
            ]);
        }

        return response()->json(['success' => true]);
    }
}
