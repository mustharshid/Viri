<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\BankAccountLock;
use App\Models\BmlCredentialGroup;
use App\Models\BmlOAuthToken;
use App\Models\MibCredentialGroup;
use App\Models\MibCredentialProfile;
use App\Models\MibDeviceCredential;
use App\Models\SessionActivityLog;
use App\Models\Terminal;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BankAccountLockController extends Controller
{
    private function validateTerminalAndAccount(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'bank_account_id' => 'required|integer',
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)
            ->where('status', 'active')
            ->first();

        if (! $terminal) {
            return ['error' => 'Terminal unauthorized or inactive', 'status' => 403];
        }

        $bankAccount = BankAccount::where('id', $request->bank_account_id)
            ->where('tenant_id', $terminal->tenant_id)
            ->first();

        if (! $bankAccount) {
            return ['error' => 'Bank account not found or unauthorized', 'status' => 404];
        }

        return ['terminal' => $terminal, 'bank_account' => $bankAccount];
    }

    public function lockAccount(Request $request)
    {
        $validation = $this->validateTerminalAndAccount($request);
        if (isset($validation['error'])) {
            return response()->json(['error' => $validation['error']], $validation['status']);
        }

        $bankAccountId = $request->bank_account_id;
        $hardwareId = $request->hardware_id;

        $result = DB::transaction(function () use ($bankAccountId, $hardwareId) {
            $existingLock = BankAccountLock::where('bank_account_id', $bankAccountId)
                ->lockForUpdate()
                ->first();

            $now = now();

            if ($existingLock && $existingLock->expires_at->gt($now)) {
                if ($existingLock->hardware_id === $hardwareId) {
                    // Extend the lock
                    $existingLock->expires_at = $now->addSeconds(20);
                    $existingLock->save();

                    return [
                        'status' => 'acquired',
                        'message' => 'Lock extended successfully',
                    ];
                }

                // Locked by someone else
                return [
                    'status' => 'busy',
                    'message' => 'Bank account is currently in use by another terminal',
                    'held_by' => $existingLock->hardware_id,
                    'expires_in' => $existingLock->expires_at->diffInSeconds($now),
                ];
            }

            // Lock does not exist or is expired - acquire it
            BankAccountLock::updateOrCreate(
                ['bank_account_id' => $bankAccountId],
                [
                    'hardware_id' => $hardwareId,
                    'expires_at' => $now->addSeconds(20),
                ]
            );

            return [
                'status' => 'acquired',
                'message' => 'Lock acquired successfully',
            ];
        });

        if ($result['status'] === 'busy') {
            return response()->json($result, 409);
        }

        return response()->json($result);
    }

    public function heartbeat(Request $request)
    {
        $validation = $this->validateTerminalAndAccount($request);
        if (isset($validation['error'])) {
            return response()->json(['error' => $validation['error']], $validation['status']);
        }

        $bankAccountId = $request->bank_account_id;
        $hardwareId = $request->hardware_id;

        $extended = DB::transaction(function () use ($bankAccountId, $hardwareId) {
            $existingLock = BankAccountLock::where('bank_account_id', $bankAccountId)
                ->lockForUpdate()
                ->first();

            if ($existingLock && $existingLock->hardware_id === $hardwareId) {
                $existingLock->expires_at = now()->addSeconds(20);
                $existingLock->save();

                return true;
            }

            return false;
        });

        if (! $extended) {
            return response()->json(['error' => 'Lock not found or held by another terminal'], 403);
        }

        return response()->json(['status' => 'extended', 'message' => 'Lock heartbeat extended']);
    }

    public function unlockAccount(Request $request)
    {
        $validation = $this->validateTerminalAndAccount($request);
        if (isset($validation['error'])) {
            return response()->json(['error' => $validation['error']], $validation['status']);
        }

        BankAccountLock::where('bank_account_id', $request->bank_account_id)
            ->where('hardware_id', $request->hardware_id)
            ->delete();

        return response()->json(['status' => 'released', 'message' => 'Lock released successfully']);
    }

    public function incrementFailures(Request $request)
    {
        $validation = $this->validateTerminalAndAccount($request);
        if (isset($validation['error'])) {
            return response()->json(['error' => $validation['error']], $validation['status']);
        }

        $bankAccount = $validation['bank_account'];
        $terminal = $validation['terminal'];
        $hash = $request->input('credentials_hash');

        // H3: a stale terminal hash must not sever an admin-set linkage — only adopt
        // the incoming hash when the account's current hash is not group-backed.
        if ($hash && $this->shouldWriteHash($bankAccount, $hash)) {
            $bankAccount->update(['login_credentials_hash' => $hash]);
        }

        // Log login failure to session activity if share_pwa_logs is enabled
        $shareLogs = $terminal->permissions['share_pwa_logs'] ?? true;
        if ($shareLogs) {
            $acctNum = preg_replace('/\s+/', '', $bankAccount->account_number);
            $masked = strlen($acctNum) <= 4 ? str_repeat('*', strlen($acctNum)) : substr($acctNum, 0, 4).str_repeat('*', max(0, strlen($acctNum) - 8)).substr($acctNum, -4);
            SessionActivityLog::create([
                'tenant_id' => $terminal->tenant_id,
                'terminal_id' => $terminal->id,
                'terminal_name' => $terminal->terminal_name,
                'bank_account_id' => $bankAccount->id,
                'bank_name' => $bankAccount->bank_name,
                'account_number_masked' => $masked,
                'event_type' => 'session_login_failed',
                'event_summary' => 'Bank login failed on terminal '.$terminal->terminal_name,
                'event_detail' => [
                    'login_failures' => 0,
                    'pwa_logs' => $request->input('pwa_logs', []),
                    'extension_version' => $request->input('extension_version'),
                ],
                'ip_address' => $request->ip(),
                'created_at' => now(),
            ]);
        }

        return response()->json(['status' => 'success', 'login_failures' => 0]);
    }

    public function resetFailures(Request $request)
    {
        $validation = $this->validateTerminalAndAccount($request);
        if (isset($validation['error'])) {
            return response()->json(['error' => $validation['error']], $validation['status']);
        }

        $bankAccount = $validation['bank_account'];
        $terminal = $validation['terminal'];
        $hash = $request->input('credentials_hash');

        // H3: same guard as incrementFailures — never let a stale terminal hash
        // sever an admin-entered linkage.
        if ($hash && $this->shouldWriteHash($bankAccount, $hash)) {
            $bankAccount->update(['login_credentials_hash' => $hash]);
        }

        // Log login success to session activity if share_pwa_logs is enabled
        $shareLogs = $terminal->permissions['share_pwa_logs'] ?? true;
        if ($shareLogs) {
            $acctNum = preg_replace('/\s+/', '', $bankAccount->account_number);
            $masked = strlen($acctNum) <= 4 ? str_repeat('*', strlen($acctNum)) : substr($acctNum, 0, 4).str_repeat('*', max(0, strlen($acctNum) - 8)).substr($acctNum, -4);
            SessionActivityLog::create([
                'tenant_id' => $terminal->tenant_id,
                'terminal_id' => $terminal->id,
                'terminal_name' => $terminal->terminal_name,
                'bank_account_id' => $bankAccount->id,
                'bank_name' => $bankAccount->bank_name,
                'account_number_masked' => $masked,
                'event_type' => 'session_login_success',
                'event_summary' => 'Bank login succeeded on terminal '.$terminal->terminal_name,
                'event_detail' => [
                    'pwa_logs' => $request->input('pwa_logs', []),
                    'extension_version' => $request->input('extension_version'),
                ],
                'ip_address' => $request->ip(),
                'created_at' => now(),
            ]);
        }

        return response()->json(['status' => 'success', 'login_failures' => 0]);
    }

    public function clearApiToken(Request $request)
    {
        $validation = $this->validateTerminalAndAccount($request);
        if (isset($validation['error'])) {
            return response()->json(['error' => $validation['error']], $validation['status']);
        }

        $bankAccount = $validation['bank_account'];
        $terminal = $validation['terminal'];

        // 1. BML: detach/cleanup credential groups
        $bmlGroupId = $bankAccount->bml_credential_group_id;
        if ($bmlGroupId) {
            $bankAccount->update(['bml_credential_group_id' => null]);

            $stillReferenced = BankAccount::where('bml_credential_group_id', $bmlGroupId)->exists();
            // H4: if another tenant account shares these credentials, keep the group so
            // the server copy of the token survives the clear.
            $keepForSibling = $this->retainGroupForSibling($bankAccount);
            if (! $stillReferenced && ! $keepForSibling) {
                BmlCredentialGroup::destroy($bmlGroupId);
            }
        }

        // 2. MIB: detach/cleanup credential profiles
        $mibProfileId = $bankAccount->mib_credential_profile_id;
        if ($mibProfileId) {
            $profile = MibCredentialProfile::find($mibProfileId);
            $groupId = $profile?->credential_group_id;
            $bankAccount->update(['mib_credential_profile_id' => null]);

            $stillReferenced = BankAccount::where('mib_credential_profile_id', $mibProfileId)->exists();
            // H4: keep the profile+group (device keys) when a sibling shares credentials.
            $keepForSibling = $this->retainGroupForSibling($bankAccount);
            if (! $stillReferenced && ! $keepForSibling && $profile) {
                $profile->delete();

                $groupStillUsed = MibCredentialProfile::where('credential_group_id', $groupId)->exists();
                if (! $groupStillUsed) {
                    MibCredentialGroup::destroy($groupId);
                }
            }
        } elseif ($bankAccount->mib_username || $bankAccount->login_credentials_hash) {
            // Unlinked account that is still identity-known (admin username or a
            // credentials hash). Resolve its group and revoke it — deleting the
            // server-side device keys so the next re-auth genuinely requires a
            // fresh C41/C42 + OTP — but only when no sibling account would be
            // affected by the revocation.
            $unlinkedGroup = $this->resolveGroupForAccount($bankAccount);
            if ($unlinkedGroup) {
                $profileIds = MibCredentialProfile::where('credential_group_id', $unlinkedGroup->id)->pluck('id');
                $stillReferenced = BankAccount::whereIn('mib_credential_profile_id', $profileIds)->exists();
                $keepForSibling = $this->retainGroupForSibling($bankAccount);
                if (! $stillReferenced && ! $keepForSibling) {
                    MibCredentialProfile::where('credential_group_id', $unlinkedGroup->id)->delete();
                    MibCredentialGroup::destroy($unlinkedGroup->id);
                }
            }
        }

        // 3. Legacy fallbacks
        BmlOAuthToken::where('bank_account_id', $bankAccount->id)
            ->where('terminal_id', $terminal->id)
            ->delete();

        MibDeviceCredential::where('bank_account_id', $bankAccount->id)
            ->where('terminal_id', $terminal->id)
            ->delete();

        return response()->json(['status' => 'success']);
    }

    public function mapCredentials(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'mapping' => 'required|array',
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)
            ->where('status', 'active')
            ->first();

        if (! $terminal) {
            return response()->json(['error' => 'Terminal unauthorized or inactive'], 403);
        }

        foreach ($request->mapping as $accountId => $hash) {
            $bankAccount = BankAccount::where('id', $accountId)
                ->where('tenant_id', $terminal->tenant_id)
                ->first();

            if (! $bankAccount) {
                continue;
            }

            // H3: never let the cashier's cached username hash overwrite an admin-set
            // linkage. A group-backed current hash is authoritative over the mapping.
            if ($this->shouldWriteHash($bankAccount, $hash)) {
                $bankAccount->update(['login_credentials_hash' => $hash]);
            }
        }

        return response()->json(['status' => 'success']);
    }

    /**
     * Whether the incoming (extension/mapping) credentials hash may replace the
     * account's current hash. Returns false when the current hash is backed by an
     * existing tenant group and the incoming hash differs — i.e. an admin-entered
     * username is authoritative and a stale terminal hash must not sever it.
     */
    private function shouldWriteHash(BankAccount $bankAccount, $incomingHash): bool
    {
        if (! $incomingHash || ! is_string($incomingHash) || $incomingHash === '') {
            return false;
        }

        $current = $bankAccount->login_credentials_hash;
        if (! $current) {
            return true;
        }
        if (hash_equals($current, $incomingHash)) {
            return false;
        }

        return ! $this->hashMatchesTenantGroup($bankAccount->tenant_id, $current);
    }

    /**
     * True when a tenant credential group's username hashes to the given value.
     */
    private function hashMatchesTenantGroup(int $tenantId, string $hash): bool
    {
        foreach (MibCredentialGroup::where('tenant_id', $tenantId)->get(['mib_username']) as $group) {
            if ($group->mib_username && hash_equals(hash('sha256', 'MIB_'.mb_strtolower(trim($group->mib_username))), $hash)) {
                return true;
            }
        }
        foreach (BmlCredentialGroup::where('tenant_id', $tenantId)->whereNotNull('bml_username')->get(['bml_username']) as $group) {
            if ($group->bml_username && hash_equals(hash('sha256', 'BML_'.mb_strtolower(trim($group->bml_username))), $hash)) {
                return true;
            }
        }

        return false;
    }

    /**
     * True when another account in the same tenant shares this account's credentials
     * (by login_credentials_hash or by the matching admin-entered username column).
     * Used to keep a credential group alive across a "Clear Credentials" action.
     */
    private function retainGroupForSibling(BankAccount $bankAccount): bool
    {
        if ($bankAccount->login_credentials_hash) {
            $byHash = BankAccount::where('tenant_id', $bankAccount->tenant_id)
                ->where('id', '!=', $bankAccount->id)
                ->where('login_credentials_hash', $bankAccount->login_credentials_hash)
                ->exists();
            if ($byHash) {
                return true;
            }
        }

        $usernameCol = $bankAccount->bank_name === 'MIB' ? 'mib_username' : 'bml_username';
        $username = $bankAccount->{$usernameCol};
        if ($username) {
            return BankAccount::where('tenant_id', $bankAccount->tenant_id)
                ->where('id', '!=', $bankAccount->id)
                ->where($usernameCol, $username)
                ->exists();
        }

        return false;
    }

    /**
     * Resolve the MIB credential group an identity-known (but profile-unlinked)
     * account belongs to — by stored username, or by matching its credentials
     * hash to a group username. Returns null when no group can be matched.
     */
    private function resolveGroupForAccount(BankAccount $bankAccount): ?MibCredentialGroup
    {
        if ($bankAccount->mib_username) {
            $group = MibCredentialGroup::where('tenant_id', $bankAccount->tenant_id)
                ->whereRaw('LOWER(mib_username) = ?', [mb_strtolower(trim((string) $bankAccount->mib_username))])
                ->first();
            if ($group) {
                return $group;
            }
        }

        if ($bankAccount->login_credentials_hash) {
            foreach (MibCredentialGroup::where('tenant_id', $bankAccount->tenant_id)->get(['id', 'mib_username']) as $group) {
                if ($group->mib_username
                    && hash_equals(hash('sha256', 'MIB_'.mb_strtolower(trim($group->mib_username))), $bankAccount->login_credentials_hash)) {
                    return $group;
                }
            }
        }

        return null;
    }
}
