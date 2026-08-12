<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\BmlCredentialGroup;
use App\Models\BmlOAuthToken;
use App\Models\Terminal;
use Carbon\Carbon;
use Illuminate\Http\Request;

class BmlOAuthController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'hardware_id' => 'required|string',
            'bank_account_id' => 'required|integer',
            'bml_username' => 'nullable|string',   // optional: not always known in browser-based OAuth
            'profile_type' => 'required|in:personal,business',
            'access_token' => 'required|string',
            'refresh_token' => 'required|string',
            'device_id' => 'required|string',
            'expires_in' => 'required|integer',
            'credentials_hash' => 'sometimes|nullable|string',
        ]);

        $terminal = $this->resolveTerminal($validated['hardware_id'], $validated['bank_account_id']);
        if (! $terminal) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        $expiresAt = Carbon::now()->addSeconds($validated['expires_in']);

        // Normalize empty username to NULL. Empty string and NULL are semantically the same
        // (username not yet known), but MySQL treats each NULL as unique in a unique index,
        // preventing separate accounts from colliding into the same group row.
        $bmlUsername = ($validated['bml_username'] ?? '') ?: null;

        // Look up the account first — needed for both group resolution and linking.
        $account = BankAccount::where('id', $validated['bank_account_id'])
            ->where('tenant_id', $terminal->tenant_id)
            ->first();

        // The extension cannot capture the username during the BML website login, so
        // an admin-entered username on the account record is authoritative. When the
        // request carries no username but the account has one stored, use it — this
        // joins the account to the shared tenant group instead of a per-terminal
        // NULL-username group.
        if ($bmlUsername === null && $account && $account->bml_username !== null && $account->bml_username !== '') {
            $bmlUsername = trim($account->bml_username);
        }

        // Retain the account's previous group so an orphaned NULL-username group can
        // be cleaned up once the account moves onto a shared tenant group below.
        $oldGroupId = $account?->bml_credential_group_id;
        $oldGroup = $oldGroupId ? BmlCredentialGroup::find($oldGroupId) : null;

        if ($bmlUsername !== null) {
            // --- Username known: upsert the tenant-scoped shared group ---------------
            // Same credentials across multiple accounts (siblings) correctly share ONE
            // group and therefore ONE token/device_id.
            $group = BmlCredentialGroup::updateOrCreate(
                [
                    'tenant_id' => $terminal->tenant_id,
                    'bml_username' => $bmlUsername,
                    'profile_type' => $validated['profile_type'],
                ],
                [
                    'terminal_id' => $terminal->id,
                    'access_token' => $validated['access_token'],
                    'refresh_token' => $validated['refresh_token'],
                    'device_id' => $validated['device_id'],
                    'expires_in' => $validated['expires_in'],
                    'expires_at' => $expiresAt,
                    'obtained_at' => Carbon::now(),
                ]
            );
        } else {
            // --- Username unknown: anchor to this account's existing group -----------
            // The cashier hasn't entered credentials yet (ZK store is empty for this
            // account), so bml_username is null. We cannot share with siblings because
            // we don't know the username. Reuse this account's own group if it already
            // has one; otherwise create a new standalone group (bml_username = NULL).
            // NULL groups are NOT subject to the username-based unique constraint, so
            // they never collide with other null-username accounts.
            if (! $account) {
                // Nothing to link this token to — avoid creating an unreferenced group.
                return response()->json(['success' => true]);
            }

            $group = $account->bml_credential_group_id
                ? BmlCredentialGroup::find($account->bml_credential_group_id)
                : null;

            $tokenFields = [
                'terminal_id' => $terminal->id,
                'access_token' => $validated['access_token'],
                'refresh_token' => $validated['refresh_token'],
                'device_id' => $validated['device_id'],
                'expires_in' => $validated['expires_in'],
                'expires_at' => $expiresAt,
                'obtained_at' => Carbon::now(),
            ];

            if ($group) {
                $group->update($tokenFields);
            } else {
                $group = BmlCredentialGroup::create(array_merge($tokenFields, [
                    'tenant_id' => $terminal->tenant_id,
                    'bml_username' => null,
                    'profile_type' => $validated['profile_type'],
                ]));
            }
        }

        // Link requesting bank account to this group

        if ($account) {
            $account->update(['bml_credential_group_id' => $group->id]);

            // Clean up the orphaned per-terminal NULL-username group the account was
            // previously anchored to, once it has moved onto a shared tenant group.
            if ($oldGroup && $oldGroup->id !== $group->id && $oldGroup->bml_username === null) {
                $stillReferenced = BankAccount::where('bml_credential_group_id', $oldGroup->id)
                    ->where('id', '!=', $account->id)
                    ->exists();
                if (! $stillReferenced) {
                    $oldGroup->delete();
                }
            }
        }

        return response()->json(['success' => true]);
    }

    public function getTokens(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
        ]);

        $terminal = $this->resolveTerminal(
            $request->hardware_id,
            $request->has('bank_account_id') ? (int) $request->bank_account_id : null
        );
        if (! $terminal) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        $group = null;
        $dbAccount = null;

        // Prefer the bank-account FK path when present: an admin-linked account must
        // always resolve through its group even if a stale cached username is sent
        // alongside it (W2). The username lookup below remains as a fallback for
        // requests that carry a username but no bank_account_id.
        if ($request->has('bank_account_id')) {
            $dbAccount = BankAccount::where('id', $request->bank_account_id)
                ->where('tenant_id', $terminal->tenant_id)
                ->first();
            if ($dbAccount && $dbAccount->bmlCredentialGroup) {
                $group = $dbAccount->bmlCredentialGroup;
                // If the caller requested a specific profile_type, verify the group
                // matches. The FK chain is 1:1 — an account can only point to one
                // group — but a user may have both personal and business profiles.
                // A mismatch means the FK points to the OTHER profile's group.
                if ($request->has('profile_type') && $group->profile_type !== $request->profile_type) {
                    $group = null;
                }
            }

            // Direct group lookup: when the FK chain yields nothing (either the FK
            // is NULL or its profile_type doesn't match), search BmlCredentialGroup
            // directly. Strategy differs by username availability:
            //
            // KNOWN username: groups are tenant-scoped (unique on tenant+bml_username+profile_type).
            // Use tenant scope — this finds groups created by sibling terminals in the same tenant.
            //
            // NULL username: groups are per-terminal (NULLs are distinct in unique index).
            // Use terminal+tenant scope with null bml_username filter and deterministic ordering
            // (updated_at DESC) to handle the multi-NULL-row case.
            if (! $group && $request->has('profile_type')) {
                $query = BmlCredentialGroup::where('profile_type', $request->profile_type);

                if ($request->has('bml_username') && $request->bml_username !== null && $request->bml_username !== '') {
                    $query->where('tenant_id', $terminal->tenant_id)
                        ->where('bml_username', $request->bml_username);
                } else {
                    $query->where('terminal_id', $terminal->id)
                        ->where('tenant_id', $terminal->tenant_id)
                        ->whereNull('bml_username')
                        ->orderByDesc('updated_at');
                }
                $group = $query->first();

                // Validate token after decrypt — whereNotNull can't filter encrypted columns
                if ($group && empty($group->access_token)) {
                    $group = null;
                }

                // Self-heal: link the account to the group ONLY if the account has no
                // existing FK. Never overwrite an FK set by store() — it's authoritative.
                if ($group && $dbAccount && ! $dbAccount->bml_credential_group_id) {
                    $dbAccount->update(['bml_credential_group_id' => $group->id]);
                }
            }
        }

        // Username lookup fallback for requests without a bank_account_id.
        if (! $group && $request->has('bml_username') && $request->has('profile_type') && $request->bml_username !== null && $request->bml_username !== '') {
            $group = BmlCredentialGroup::where('tenant_id', $terminal->tenant_id)
                ->where('bml_username', $request->bml_username)
                ->where('profile_type', $request->profile_type)
                ->first();
        }

        // Fallback: Legacy BmlOAuthToken lookup
        if (! $group) {
            $query = BmlOAuthToken::where('terminal_id', $terminal->id);
            if ($request->has('bml_username') && $request->has('profile_type')) {
                $query->where('bml_username', $request->bml_username)
                    ->where('profile_type', $request->profile_type);
            } elseif ($request->has('bank_account_id')) {
                $query->where('bank_account_id', $request->bank_account_id);
            }
            $legacy = $query->first();
            if ($legacy) {
                return response()->json([
                    'access_token' => $legacy->access_token,
                    'refresh_token' => $legacy->refresh_token,
                    'device_id' => $legacy->device_id,
                    'expires_in' => $legacy->expires_in,
                    'expires_at' => $legacy->expires_at ? $legacy->expires_at->toIso8601String() : null,
                ]);
            }

            return response()->json(['error' => 'Not found'], 404);
        }

        return response()->json([
            'access_token' => $group->access_token,
            'refresh_token' => $group->refresh_token,
            'device_id' => $group->device_id,
            'expires_in' => $group->expires_in,
            'expires_at' => $group->expires_at ? $group->expires_at->toIso8601String() : null,
        ]);
    }

    public function updateTokens(Request $request)
    {
        $validated = $request->validate([
            'hardware_id' => 'required|string',
            'bank_account_id' => 'required|integer',
            'access_token' => 'required|string',
            'refresh_token' => 'required|string',
            'expires_in' => 'sometimes|integer',
        ]);

        $terminal = $this->resolveTerminal($validated['hardware_id'], $validated['bank_account_id']);
        if (! $terminal) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        $account = BankAccount::where('id', $validated['bank_account_id'])
            ->where('tenant_id', $terminal->tenant_id)
            ->first();

        $group = $account ? $account->bmlCredentialGroup : null;

        if (! $group) {
            // Fallback: check legacy
            $legacy = BmlOAuthToken::where('terminal_id', $terminal->id)
                ->where('bank_account_id', $validated['bank_account_id'])
                ->first();
            if ($legacy) {
                $legacy->access_token = $validated['access_token'];
                $legacy->refresh_token = $validated['refresh_token'];
                if (isset($validated['expires_in'])) {
                    $legacy->expires_in = $validated['expires_in'];
                    $legacy->expires_at = Carbon::now()->addSeconds($validated['expires_in']);
                    $legacy->obtained_at = Carbon::now();
                }
                $legacy->save();

                return response()->json(['success' => true]);
            }

            return response()->json(['error' => 'Not found'], 404);
        }

        $group->access_token = $validated['access_token'];
        $group->refresh_token = $validated['refresh_token'];
        if (isset($validated['expires_in'])) {
            $group->expires_in = $validated['expires_in'];
            $group->expires_at = Carbon::now()->addSeconds($validated['expires_in']);
            $group->obtained_at = Carbon::now();
        }
        $group->save();

        return response()->json(['success' => true]);
    }

    /**
     * Resolve a terminal by hardware_id, falling back to the bank account's
     * BML credential group chain when the hardware_id doesn't match.
     *
     * This handles PWA reinstall / extension re-pairing scenarios where the
     * hardware_id changes but the bank_account → credential_group → terminal
     * chain remains authoritative.
     */
    private function resolveTerminal(string $hardwareId, ?int $bankAccountId): ?Terminal
    {
        $terminal = Terminal::where('hardware_id', $hardwareId)->first();
        if ($terminal) {
            return $terminal;
        }

        if (! $bankAccountId) {
            return null;
        }

        $account = BankAccount::with('bmlCredentialGroup.terminal')
            ->find($bankAccountId);

        return $account?->bmlCredentialGroup?->terminal;
    }
}
