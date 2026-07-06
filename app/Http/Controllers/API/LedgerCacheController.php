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
            $lastHeartbeat = time();
            
            // Set execution limit to 0 (unlimited time)
            if (function_exists('set_time_limit')) {
                @set_time_limit(0);
            }

            while (true) {
                if (connection_aborted()) {
                    break;
                }

                // Check for undelivered events for this terminal
                $events = DB::transaction(function () use ($hardwareId) {
                    $evts = DB::table('terminal_events')
                        ->where('hardware_id', $hardwareId)
                        ->where('delivered', false)
                        ->lockForUpdate()
                        ->get();

                    if ($evts->isNotEmpty()) {
                        DB::table('terminal_events')
                            ->whereIn('id', $evts->pluck('id'))
                            ->update([
                                'delivered' => true,
                                'updated_at' => now()
                            ]);
                    }

                    return $evts;
                });

                foreach ($events as $event) {
                    echo "event: " . $event->event_type . "\n";
                    echo "data: " . $event->payload . "\n\n";
                }

                if (ob_get_level() > 0) {
                    ob_flush();
                }
                flush();

                // Periodic keep-alive event (every 10 seconds)
                if (time() - $lastHeartbeat > 10) {
                    echo ": keep-alive\n\n";
                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                    $lastHeartbeat = time();
                }

                usleep(500000); // 500ms polling pause
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no', // Disable Nginx buffering
        ]);
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

        return response()->json([
            'balance'               => $cache?->balance ?? 'Not synced',
            'transactions'          => $cache?->transactions ?? [],
            'cached_at'             => $cache?->cached_at ? $cache->cached_at->toIso8601String() : null,
            'cache_version'         => $cache?->cache_version ?? 0,
            'is_live'               => $isLive,
            'holder_terminal_id'    => $isLive ? $account->session_holder_terminal_id : null,
            'holder_terminal_name'  => $holderName,
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
        ]);

        $terminal = $this->resolveTerminal($request->hardware_id);
        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $account = $this->resolveAccount((int) $request->bank_account_id, $terminal->tenant_id);
        if (!$account) {
            return response()->json(['error' => 'Bank account not found'], 404);
        }

        DB::transaction(function () use ($request, $account, $terminal) {
            $cache = BankAccountCache::firstOrNew(['bank_account_id' => $account->id]);
            
            $existing = $cache->transactions ?: [];
            $incoming = $request->transactions;

            // Merge & Deduplicate based on transaction date, amount, and details
            $merged = collect(array_merge($incoming, $existing))
                ->unique(function ($tx) {
                    return trim($tx['date'] ?? '') . '-' . trim($tx['amount'] ?? '') . '-' . trim($tx['details'] ?? '');
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

            // Fulfill the request if request_id is supplied
            if ($request->request_id) {
                $fetchRequest = SessionFetchRequest::find($request->request_id);
                if ($fetchRequest) {
                    $fetchRequest->update([
                        'status' => 'fulfilled',
                        'result_json' => [
                            'balance' => $request->balance,
                            'transactions' => array_slice($merged, 0, 10), // return last 10 for quick verification
                        ]
                    ]);
                }
            }
        });

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
                'mib_profile_type'=> $account->mib_profile_type ?? '0',
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
}
