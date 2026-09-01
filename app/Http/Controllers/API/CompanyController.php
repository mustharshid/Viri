<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BankAccount;
use App\Models\BmlCredentialGroup;
use App\Models\MibCredentialGroup;
use App\Models\MibCredentialProfile;
use App\Models\PaymentReceipt;
use App\Models\Terminal;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class CompanyController extends Controller
{
    public function getAuditLogs(Request $request)
    {
        $tenantId = $request->user()->tenant_id;
        $perPage = min((int) $request->input('per_page', 20), 100);
        $logs = AuditLog::where('tenant_id', $tenantId)
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);

        return response()->json($logs);
    }

    // === TERMINALS ===
    public function getTerminals(Request $request)
    {
        $tenantId = $request->user()->tenant_id;
        $terminals = Terminal::where('tenant_id', $tenantId)->get();

        return response()->json($terminals);
    }

    public function createTerminal(Request $request)
    {
        $request->validate([
            'name' => 'required|string',
            'permissions' => 'nullable|array',
            'settings_pin' => 'nullable|string|max:6',
        ]);

        $tenant = $request->user()->tenant;
        $tenantId = $tenant->id;

        // Check subscription terminal limits
        $currentTerminals = Terminal::where('tenant_id', $tenantId)->count();
        $maxTerminals = $tenant->max_terminals ?? 1;

        if ($currentTerminals >= $maxTerminals) {
            return response()->json([
                'message' => 'Cashier terminal limit reached for your subscription plan. Please contact support or upgrade.',
            ], 403);
        }

        // Generate a random hardware ID
        $hardwareId = 'term_'.bin2hex(random_bytes(8));
        // Generate a 6-digit pairing code
        $pairingCode = str_pad(mt_rand(0, 999999), 6, '0', STR_PAD_LEFT);

        $permissions = $request->input('permissions', []);
        $tier = $tenant->subscription_tier;
        $features = $tenant->features;
        $isFreeOr499 = ($tier === 'free' || $tier === '499');

        $hasFeature = function ($key) use ($features, $isFreeOr499) {
            if ($key === 'verification_enabled') {
                return true;
            }
            if ($features !== null && is_array($features) && array_key_exists($key, $features)) {
                return filter_var($features[$key], FILTER_VALIDATE_BOOLEAN);
            }

            return ! $isFreeOr499;
        };

        $permissions = [
            'verification_enabled' => $hasFeature('verification_enabled'),
            'ledger_enabled' => $hasFeature('ledger_enabled') && filter_var($permissions['ledger_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'ledger_show_balance' => $hasFeature('ledger_show_balance') && filter_var($permissions['ledger_show_balance'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'ledger_show_debit' => $hasFeature('ledger_show_debit') && filter_var($permissions['ledger_show_debit'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'reports_enabled' => $hasFeature('reports_enabled') && filter_var($permissions['reports_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'statement_enabled' => $hasFeature('statement_enabled') && filter_var($permissions['statement_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'kyc_enabled' => $hasFeature('kyc_enabled') && filter_var($permissions['kyc_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'show_vbtl' => filter_var($permissions['show_vbtl'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'share_pwa_logs' => filter_var($permissions['share_pwa_logs'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'bml_combined_ledger' => $hasFeature('bml_combined_ledger') && filter_var($permissions['bml_combined_ledger'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'shift_claim_report_enabled' => true,
            'terminal_pin' => isset($permissions['terminal_pin']) && $permissions['terminal_pin'] !== '' ? substr(preg_replace('/\D/', '', (string) $permissions['terminal_pin']), 0, 4) : null,
        ];

        $terminal = Terminal::create([
            'tenant_id' => $tenantId,
            'terminal_name' => $request->name,
            'hardware_id' => $hardwareId,
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(10),
            'settings_pin' => $request->settings_pin,
            'status' => 'active',
            'permissions' => $permissions,
        ]);

        AuditLog::create([
            'tenant_id' => $tenantId,
            'event_type' => 'terminal_created',
            'actor' => $request->user()->name,
            'ip_address' => $request->ip(),
            'metadata' => ['terminal_id' => $terminal->id, 'terminal_name' => $terminal->terminal_name],
        ]);

        return response()->json(['terminal' => $terminal]);
    }

    public function updateTerminal(Request $request, $id)
    {
        try {
            $request->validate([
                'name' => 'required|string',
                'permissions' => 'nullable|array',
                'settings_pin' => 'nullable|string|max:6',
            ]);

            $tenant = $request->user()->tenant;
            $terminal = Terminal::where('tenant_id', $tenant->id)->findOrFail($id);

            $permissions = $request->input('permissions', []);
            $tier = $tenant->subscription_tier;
            $features = $tenant->features;
            $isFreeOr499 = ($tier === 'free' || $tier === '499');

            $hasFeature = function ($key) use ($features, $isFreeOr499) {
                if ($key === 'verification_enabled') {
                    return true;
                }
                if ($features !== null && is_array($features) && array_key_exists($key, $features)) {
                    return filter_var($features[$key], FILTER_VALIDATE_BOOLEAN);
                }

                return ! $isFreeOr499;
            };

            $permissions = [
                'verification_enabled' => $hasFeature('verification_enabled'),
                'ledger_enabled' => $hasFeature('ledger_enabled') && filter_var($permissions['ledger_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'ledger_show_balance' => $hasFeature('ledger_show_balance') && filter_var($permissions['ledger_show_balance'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'ledger_show_debit' => $hasFeature('ledger_show_debit') && filter_var($permissions['ledger_show_debit'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'reports_enabled' => $hasFeature('reports_enabled') && filter_var($permissions['reports_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'statement_enabled' => $hasFeature('statement_enabled') && filter_var($permissions['statement_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'kyc_enabled' => $hasFeature('kyc_enabled') && filter_var($permissions['kyc_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'show_vbtl' => filter_var($permissions['show_vbtl'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'share_pwa_logs' => filter_var($permissions['share_pwa_logs'] ?? true, FILTER_VALIDATE_BOOLEAN),
                'sales_claiming_enabled' => filter_var($permissions['sales_claiming_enabled'] ?? true, FILTER_VALIDATE_BOOLEAN),
                'show_sale_reference_popover' => filter_var($permissions['show_sale_reference_popover'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'bml_combined_ledger' => $hasFeature('bml_combined_ledger') && filter_var($permissions['bml_combined_ledger'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'shift_claim_report_enabled' => true,
                'terminal_pin' => isset($permissions['terminal_pin']) && $permissions['terminal_pin'] !== '' ? substr(preg_replace('/\D/', '', (string) $permissions['terminal_pin']), 0, 4) : null,
            ];

            $terminal->update([
                'terminal_name' => $request->name,
                'settings_pin' => $request->settings_pin,
                'permissions' => $permissions,
            ]);

            try {
                AuditLog::create([
                    'tenant_id' => $tenant->id,
                    'event_type' => 'terminal_updated',
                    'actor' => $request->user()->name,
                    'ip_address' => $request->ip(),
                    'metadata' => ['terminal_id' => $terminal->id, 'terminal_name' => $terminal->terminal_name],
                ]);
            } catch (\Exception $auditEx) {
                // Audit log failure should not block terminal update
            }

            return response()->json(['terminal' => $terminal]);

        } catch (ValidationException $e) {
            return response()->json(['message' => implode(' ', $e->validator->errors()->all())], 422);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to update terminal: '.$e->getMessage()], 500);
        }
    }

    public function deleteTerminal(Request $request, $id)
    {
        $terminal = Terminal::where('tenant_id', $request->user()->tenant_id)->findOrFail($id);

        AuditLog::create([
            'tenant_id' => $request->user()->tenant_id,
            'event_type' => 'terminal_deleted',
            'actor' => $request->user()->name,
            'ip_address' => $request->ip(),
            'metadata' => ['terminal_id' => $terminal->id, 'terminal_name' => $terminal->terminal_name],
        ]);

        $terminal->delete();

        return response()->json(['message' => 'Terminal deleted']);
    }

    public function enableDebug(Request $request, $id)
    {
        $terminal = Terminal::where('tenant_id', $request->user()->tenant_id)->findOrFail($id);

        $code = strtoupper(substr(md5(uniqid(mt_rand(), true)), 0, 6));
        $until = now()->addHours(2);

        $terminal->update([
            'debug_one_time_code' => $code,
            'allow_debug_until' => $until,
        ]);

        return response()->json([
            'message' => 'Debug access enabled for 2 hours.',
            'debug_one_time_code' => $code,
            'allow_debug_until' => $until->toIso8601String(),
        ]);
    }

    public function regeneratePairingCode(Request $request, $id)
    {
        $tenantId = $request->user()->tenant_id;
        $terminal = Terminal::where('tenant_id', $tenantId)->findOrFail($id);

        // Generate a 6-digit pairing code
        $pairingCode = str_pad(mt_rand(0, 999999), 6, '0', STR_PAD_LEFT);

        $terminal->update([
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => now()->addMinutes(10),
        ]);

        return response()->json([
            'message' => 'Pairing code generated successfully.',
            'pairing_code' => $pairingCode,
            'pairing_code_expires_at' => $terminal->pairing_code_expires_at->toIso8601String(),
        ]);
    }

    // === BANK ACCOUNTS ===
    public function getBankAccounts(Request $request)
    {
        $tenantId = $request->user()->tenant_id;
        $accounts = BankAccount::where('tenant_id', $tenantId)
            ->with(['mibCredentialProfile.credentialGroup', 'bmlCredentialGroup'])
            ->get();

        return response()->json($accounts);
    }

    public function createBankAccount(Request $request)
    {
        $tenantId = $request->user()->tenant_id;
        $tenant = $request->user()->tenant;

        // Check subscription limits
        $currentAccounts = BankAccount::where('tenant_id', $tenantId)->count();
        $limit = $tenant->max_bank_accounts ?? 1;

        if ($currentAccounts >= $limit) {
            return response()->json(['message' => 'Bank account limit reached for your subscription tier.'], 403);
        }

        $request->validate([
            'bank_name' => 'required|string',
            'account_name' => 'required|string',
            'account_number' => 'required|string',
            'mib_profile_type' => 'nullable|string|in:0,1',
            'bml_profile_type' => 'nullable|string|in:0,1',
            'label' => 'nullable|string',
            'currency' => 'nullable|string|in:MVR,USD',
            'mib_username' => 'nullable|string|max:255',
            'bml_username' => 'nullable|string|max:255',
        ]);

        $account = BankAccount::create([
            'tenant_id' => $tenantId,
            'bank_name' => $request->bank_name,
            'account_name' => $request->account_name,
            'account_number' => $request->account_number,
            'mib_profile_type' => $request->mib_profile_type ?? '0',
            'bml_profile_type' => $request->bml_profile_type ?? '0',
            'label' => $request->label,
            'currency' => $request->currency ?? 'MVR',
            'mib_username' => $request->filled('mib_username') ? trim($request->mib_username) : null,
            'bml_username' => $request->filled('bml_username') ? trim($request->bml_username) : null,
        ]);

        // Usernames are stored on the account, but the login_credentials_hash and
        // any profile/group linkage are deferred to an explicit confirmation
        // (PUT /company/bank-accounts/{id} with confirm_link=true). This prevents a
        // typo'd username from silently binding the account to another user's group.
        $link = null;
        if ($request->filled('mib_username')) {
            $link = $this->resolveMibLinkResponse($account, trim($request->mib_username));
        } elseif ($request->filled('bml_username')) {
            $link = $this->resolveBmlLinkResponse($account, trim($request->bml_username));
        }

        $payload = ['account' => $account->fresh()];
        if ($link && $link['needs_confirmation']) {
            $payload['link'] = $link;
        }

        return response()->json($payload);
    }

    public function deleteBankAccount(Request $request, $id)
    {
        $tenantId = $request->user()->tenant_id;
        $account = BankAccount::where('tenant_id', $tenantId)->findOrFail($id);

        DB::transaction(function () use ($account) {
            // Capture credential linkages BEFORE the delete: mib_device_credentials
            // cascade, but mib_credential_profiles / *_credential_groups have no FK
            // to bank_accounts and would otherwise be orphaned — a re-added account
            // could then silently inherit the stale device keys (OTP-free re-auth).
            $mibProfileId = $account->mib_credential_profile_id;
            $mibGroup = null;
            if ($mibProfileId) {
                $mibGroup = MibCredentialProfile::find($mibProfileId)?->credentialGroup;
            }
            $bmlGroupId = $account->bml_credential_group_id;

            $account->delete();

            // MIB: remove the orphaned profile and, if the group is now unused,
            // the orphaned group too — unless a sibling account still belongs to
            // the same MIB user (username or credentials-hash match).
            if ($mibProfileId) {
                $profileStillReferenced = BankAccount::where('mib_credential_profile_id', $mibProfileId)->exists();
                if (! $profileStillReferenced) {
                    MibCredentialProfile::where('id', $mibProfileId)->delete();
                }
                if ($mibGroup && ! $this->mibGroupStillNeeded($account->tenant_id, $account->id, $mibGroup)) {
                    $groupStillHasProfiles = MibCredentialProfile::where('credential_group_id', $mibGroup->id)->exists();
                    if (! $groupStillHasProfiles) {
                        MibCredentialGroup::where('id', $mibGroup->id)->delete();
                    }
                }
            }

            // BML: remove the orphaned group when no other account references it.
            if ($bmlGroupId) {
                $groupStillReferenced = BankAccount::where('bml_credential_group_id', $bmlGroupId)->exists();
                if (! $groupStillReferenced) {
                    BmlCredentialGroup::where('id', $bmlGroupId)->delete();
                }
            }
        });

        return response()->json(['message' => 'Bank account deleted']);
    }

    /**
     * Whether a MIB credential group is still needed after the given account is
     * removed — true when a sibling account in the tenant belongs to the same
     * MIB user (matched by stored username or credentials hash). Preserves the
     * shared (tenant, username) group across the delete of one of its accounts.
     */
    private function mibGroupStillNeeded(int $tenantId, int $excludedAccountId, MibCredentialGroup $group): bool
    {
        $username = trim((string) $group->mib_username);
        if ($username === '') {
            return false;
        }
        $expectedHash = hash('sha256', 'MIB_'.mb_strtolower($username));

        return BankAccount::where('tenant_id', $tenantId)
            ->where('id', '!=', $excludedAccountId)
            ->where(function ($q) use ($username, $expectedHash) {
                $q->where('mib_username', $username)
                  ->orWhere('login_credentials_hash', $expectedHash);
            })
            ->exists();
    }

    public function updateBankAccount(Request $request, $id)
    {
        $tenantId = $request->user()->tenant_id;
        $account = BankAccount::where('tenant_id', $tenantId)->findOrFail($id);

        $request->validate([
            'bank_name' => 'required|string',
            'account_name' => 'required|string',
            'mib_profile_type' => 'nullable|string|in:0,1',
            'bml_profile_type' => 'nullable|string|in:0,1',
            'label' => 'nullable|string',
            'currency' => 'nullable|string|in:MVR,USD',
            'mib_username' => 'nullable|string|max:255',
            'bml_username' => 'nullable|string|max:255',
            'confirm_link' => 'nullable|boolean',
        ]);

        // Capture persisted profile types BEFORE applying the request, so the
        // linkage lookups below use the pre-update values (not the request default).
        $origMibType = (string) ($account->getOriginal('mib_profile_type') ?? '0');
        $origBmlType = (string) ($account->getOriginal('bml_profile_type') ?? '0');

        $updates = [
            'bank_name' => $request->bank_name,
            'account_name' => $request->account_name,
            'label' => $request->label,
            'currency' => $request->currency ?? 'MVR',
        ];

        // M1: when a profile/group FK is set, the profile_type column must stay
        // consistent with the linked group rather than the request value.
        if ($account->mib_credential_profile_id !== null) {
            $updates['mib_profile_type'] = (string) ($account->mibCredentialProfile?->profile_type ?? $origMibType);
        } else {
            $updates['mib_profile_type'] = $request->mib_profile_type ?? $origMibType;
        }

        if ($account->bml_credential_group_id !== null) {
            $bmlGroupType = $account->bmlCredentialGroup?->profile_type;
            $updates['bml_profile_type'] = $bmlGroupType === 'business' ? '1' : ($bmlGroupType === 'personal' ? '0' : $origBmlType);
        } else {
            $updates['bml_profile_type'] = $request->bml_profile_type ?? $origBmlType;
        }

        // MED1: the hash/FK/username writes are applied conditionally below — never
        // pushed into the update array when the username is empty or unresolvable.
        // The username column itself is only written inside applyMibLink/applyBmlLink,
        // after the H1 conflict check, so a 409 never persists a conflicting username.

        $account->update($updates);

        $confirmLink = $request->boolean('confirm_link');
        $link = null;

        if ($request->filled('mib_username')) {
            $link = $this->applyMibLink($account, trim($request->mib_username), $origMibType, $confirmLink);
            if ($link instanceof \Symfony\Component\HttpFoundation\Response) {
                return $link;
            }
        } elseif ($request->filled('bml_username')) {
            $link = $this->applyBmlLink($account, trim($request->bml_username), $origBmlType, $confirmLink);
            if ($link instanceof \Symfony\Component\HttpFoundation\Response) {
                return $link;
            }
        }

        $payload = ['account' => $account->fresh()];
        if ($link && $link['needs_confirmation']) {
            $payload['link'] = $link;
        }

        return response()->json($payload);
    }

    /**
     * Resolve the MIB credential group for an admin-entered username, applying
     * H5 pinning: the account is only pinned to a profile when the group has
     * exactly ONE profile of the account's persisted mib_profile_type.
     */
    private function resolveMibProfile(BankAccount $account, string $username, string $profileType)
    {
        $group = MibCredentialGroup::where('tenant_id', $account->tenant_id)
            ->whereRaw('LOWER(mib_username) = ?', [mb_strtolower(trim($username))])
            ->first();

        if (! $group) {
            return null;
        }

        $profile = MibCredentialProfile::where('credential_group_id', $group->id)
            ->where('profile_type', (string) $profileType)
            ->get();

        // H5: pin only when unambiguous — exactly one profile of the persisted type.
        if ($profile->count() === 1) {
            return ['group' => $group, 'profile' => $profile->first()];
        }

        return ['group' => $group, 'profile' => null];
    }

    /**
     * Build the confirmation payload for a MIB username match (used by create).
     */
    private function resolveMibLinkResponse(BankAccount $account, string $username)
    {
        $resolved = $this->resolveMibProfile($account, $username, (string) ($account->mib_profile_type ?? '0'));
        if (! $resolved) {
            return ['needs_confirmation' => false];
        }

        $group = $resolved['group'];
        $siblingCount = BankAccount::where('tenant_id', $account->tenant_id)
            ->whereHas('mibCredentialProfile', function ($q) use ($group) {
                $q->where('credential_group_id', $group->id);
            })->count();

        return [
            'needs_confirmation' => true,
            'type' => 'mib',
            'masked_username' => $this->maskUsername($group->mib_username),
            'sibling_account_count' => $siblingCount,
        ];
    }

    /**
     * Apply (or prepare) the MIB linkage on update. Returns the link payload, or a
     * 409 Response when the account is already bound to a different group (H1).
     */
    private function applyMibLink(BankAccount $account, string $username, string $profileType, bool $confirmLink)
    {
        $resolved = $this->resolveMibProfile($account, $username, $profileType);
        if (! $resolved) {
            // HIGH2: never write a hash that matches no group. The username is still
            // persisted so a future group matching it can auto-link the account.
            $account->update(['mib_username' => $username]);

            return ['needs_confirmation' => false];
        }

        $group = $resolved['group'];

        $isAlreadyLinked = false;
        if ($account->mib_credential_profile_id !== null) {
            $currentGroup = $account->mibCredentialProfile?->credentialGroup;
            if ($currentGroup && $currentGroup->id !== $group->id) {
                return response()->json([
                    'error' => 'Account is already linked to the MIB profile for a different username. Unlink it first or clear the MIB profile.',
                    'link' => $this->resolveMibLinkResponse($account, $username),
                ], 409);
            }
            $isAlreadyLinked = $currentGroup && $currentGroup->id === $group->id;
        }

        $account->update(['mib_username' => $username]);

        $siblingCount = BankAccount::where('tenant_id', $account->tenant_id)
            ->whereHas('mibCredentialProfile', function ($q) use ($group) {
                $q->where('credential_group_id', $group->id);
            })->count();

        if (! $confirmLink) {
            // W1: an account already linked to this group needs no confirmation —
            // a plain edit/save of a linked account should not pop the dialog.
            if ($isAlreadyLinked) {
                return ['needs_confirmation' => false];
            }

            return [
                'needs_confirmation' => true,
                'type' => 'mib',
                'masked_username' => $this->maskUsername($group->mib_username),
                'sibling_account_count' => $siblingCount,
            ];
        }

        $account->update(['login_credentials_hash' => $this->computeMibHash($username)]);

        $profile = $resolved['profile'];
        if ($profile && $account->mib_credential_profile_id === null) {
            $account->update(['mib_credential_profile_id' => $profile->id]);
        }

        return ['needs_confirmation' => false];
    }

    /**
     * Resolve the BML credential group for an admin-entered username.
     */
    private function resolveBmlGroup(BankAccount $account, string $username, string $profileType)
    {
        $bmlProfileType = $profileType === '1' ? 'business' : 'personal';

        return BmlCredentialGroup::where('tenant_id', $account->tenant_id)
            ->whereRaw('LOWER(bml_username) = ?', [mb_strtolower(trim($username))])
            ->where('profile_type', $bmlProfileType)
            ->first();
    }

    private function resolveBmlLinkResponse(BankAccount $account, string $username)
    {
        $group = $this->resolveBmlGroup($account, $username, (string) ($account->bml_profile_type ?? '0'));
        if (! $group) {
            return ['needs_confirmation' => false];
        }

        $siblingCount = BankAccount::where('tenant_id', $account->tenant_id)
            ->where('bml_credential_group_id', $group->id)->count();

        return [
            'needs_confirmation' => true,
            'type' => 'bml',
            'masked_username' => $this->maskUsername($group->bml_username),
            'sibling_account_count' => $siblingCount,
        ];
    }

    /**
     * Apply (or prepare) the BML linkage on update.
     */
    private function applyBmlLink(BankAccount $account, string $username, string $profileType, bool $confirmLink)
    {
        $group = $this->resolveBmlGroup($account, $username, $profileType);
        if (! $group) {
            // HIGH2: never write a hash that matches no group.
            $account->update(['bml_username' => $username]);

            return ['needs_confirmation' => false];
        }

        $isAlreadyLinked = $account->bml_credential_group_id !== null && $account->bml_credential_group_id === $group->id;

        if ($account->bml_credential_group_id !== null && $account->bml_credential_group_id !== $group->id) {
            return response()->json([
                'error' => 'Account is already linked to a BML credential group for a different username. Unlink it first or clear the BML credentials.',
                'link' => $this->resolveBmlLinkResponse($account, $username),
            ], 409);
        }

        $account->update(['bml_username' => $username]);

        $siblingCount = BankAccount::where('tenant_id', $account->tenant_id)
            ->where('bml_credential_group_id', $group->id)->count();

        if (! $confirmLink) {
            // W1: an account already linked to this group needs no confirmation.
            if ($isAlreadyLinked) {
                return ['needs_confirmation' => false];
            }

            return [
                'needs_confirmation' => true,
                'type' => 'bml',
                'masked_username' => $this->maskUsername($group->bml_username),
                'sibling_account_count' => $siblingCount,
            ];
        }

        $account->update(['login_credentials_hash' => $this->computeBmlHash($username)]);

        if ($account->bml_credential_group_id === null) {
            $account->update(['bml_credential_group_id' => $group->id]);
        }

        return ['needs_confirmation' => false];
    }

    private function computeMibHash(string $username): string
    {
        return hash('sha256', 'MIB_'.mb_strtolower(trim($username)));
    }

    private function computeBmlHash(string $username): string
    {
        return hash('sha256', 'BML_'.mb_strtolower(trim($username)));
    }

    private function maskUsername(?string $username): ?string
    {
        if ($username === null || $username === '') {
            return null;
        }
        $len = mb_strlen($username);
        if ($len <= 1) {
            return str_repeat('*', max(1, $len));
        }
        if ($len <= 3) {
            return mb_substr($username, 0, 1).str_repeat('*', $len - 1);
        }

        return mb_substr($username, 0, 1).str_repeat('*', $len - 2).mb_substr($username, -1);
    }

    /**
     * Assign (or clear) the MIB profile under which a bank account lives,
     * based on the profile list captured at first sign-in for the username's
     * credential group. Admin-driven mapping takes precedence over the
     * extension's auto-heal/auto-link logic.
     */
    public function updateMibProfile(Request $request, $id)
    {
        $account = BankAccount::where('tenant_id', $request->user()->tenant_id)->findOrFail($id);

        $request->validate([
            'profile_id' => 'required|integer|exists:mib_credential_profiles,id',
        ]);

        $profile = MibCredentialProfile::findOrFail($request->profile_id);
        $group = $profile->credentialGroup;

        if (! $group || $group->tenant_id !== $request->user()->tenant_id) {
            return response()->json(['error' => 'Profile does not belong to this company'], 403);
        }

        // C1: never point the account at a profile whose group belongs to a different
        // MIB user than the one already pinned by this account's username/hash.
        $groupUsername = trim((string) $group->mib_username);
        if ($account->mib_username !== null && $account->mib_username !== '') {
            if (mb_strtolower(trim((string) $account->mib_username)) !== mb_strtolower($groupUsername)) {
                return response()->json([
                    'error' => 'Profile belongs to a different MIB user ('.$this->maskUsername($groupUsername).'). Unlink the current MIB profile first.',
                ], 409);
            }
        } elseif ($account->login_credentials_hash) {
            $expected = hash('sha256', 'MIB_'.mb_strtolower($groupUsername));
            if (! hash_equals($expected, $account->login_credentials_hash)) {
                return response()->json([
                    'error' => 'Profile belongs to a different MIB user ('.$this->maskUsername($groupUsername).'). Unlink the current MIB profile first.',
                ], 409);
            }
        }

        $account->update([
            'mib_credential_profile_id' => $profile->id,
            'mib_profile_type' => $profile->profile_type,
            'login_credentials_hash' => $this->computeMibHash($groupUsername),
        ]);

        return response()->json(['account' => $account]);
    }

    public function resetBankAccountFailures(Request $request, $id)
    {
        return response()->json(['message' => 'Account status OK']);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'phone_number' => 'required|string|max:255',
            'password' => 'nullable|string|min:8|confirmed',
            'expiry_warning_days' => 'nullable|integer|min:0|max:90',
            'recent_tx_limit' => 'nullable|integer|in:0,1,3,5,10,9999',
        ]);

        $user->phone_number = $request->phone_number;
        if ($request->filled('password')) {
            $user->password = Hash::make($request->password);
        }
        $user->save();

        if ($request->has('expiry_warning_days') || $request->has('recent_tx_limit')) {
            $tenant = $user->tenant;
            $features = $tenant->features ?? [];
            if ($request->has('expiry_warning_days')) {
                $features['expiry_warning_days'] = (int) $request->expiry_warning_days;
            }
            if ($request->has('recent_tx_limit')) {
                $features['recent_tx_limit'] = (int) $request->recent_tx_limit;
            }
            $tenant->features = $features;
            $tenant->save();
        }

        return response()->json([
            'message' => 'Profile updated successfully',
            'user' => $user->load('tenant'),
        ]);
    }

    public function disableDebug(Request $request, $id)
    {
        $terminal = Terminal::where('tenant_id', $request->user()->tenant_id)->findOrFail($id);

        $terminal->update([
            'debug_one_time_code' => null,
            'allow_debug_until' => null,
        ]);

        return response()->json([
            'message' => 'Debug access revoked successfully.',
        ]);
    }

    public function getPayments(Request $request)
    {
        $payments = PaymentReceipt::where('tenant_id', $request->user()->tenant_id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($payments);
    }

    public function storePayment(Request $request)
    {
        $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'reference_number' => 'nullable|string|max:255',
            'receipt_slip' => 'required|image|mimes:jpeg,png|max:5120',
            'requested_tier' => 'nullable|string|max:100',
            'remarks' => 'nullable|string|max:1000',
        ]);

        $user = $request->user();

        if ($request->hasFile('receipt_slip')) {
            $path = $request->file('receipt_slip')->store('receipts', 'public');
            $receiptSlipPath = '/storage/'.$path;
        } else {
            return response()->json(['error' => 'Receipt slip file is required'], 400);
        }

        // Auto-renew license for 1 month upon payment receipt upload
        $tenant = $user->tenant;
        $previousExpiry = $tenant->license_expires_at; // could be null
        // Determine new expiry date
        if ($previousExpiry && $previousExpiry->gt(now())) {
            $newExpiry = (clone $previousExpiry)->addMonth();
        } else {
            $newExpiry = now()->addMonth();
        }
        // Update tenant's license expiry
        $tenant->license_expires_at = $newExpiry;
        $tenant->save();

        $payment = PaymentReceipt::create([
            'tenant_id' => $user->tenant_id,
            'amount' => $request->amount,
            'reference_number' => $request->reference_number ?? null,
            'receipt_slip_path' => $receiptSlipPath,
            'status' => 'pending',
            'requested_tier' => $request->requested_tier ?? null,
            'remarks' => $request->remarks,
            // Store previous expiry for potential rollback on rejection
            'previous_license_expires_at' => $previousExpiry,
        ]);

        return response()->json([
            'message' => 'Payment receipt uploaded successfully. Awaiting superadmin verification.',
            'payment' => $payment,
        ]);
    }

    public function requestPlanChange(Request $request)
    {
        $request->validate([
            'requested_tier' => 'required|string|max:100',
            'amount' => 'nullable|numeric|min:0',
            'remarks' => 'nullable|string|max:1000',
            'receipt_slip' => 'nullable|image|mimes:jpeg,png|max:5120',
        ]);

        $user = $request->user();
        $plan = \App\Models\SubscriptionPlan::where('tier_key', $request->requested_tier)->first();
        $amount = $request->filled('amount') ? (float) $request->amount : ($plan ? (float) $plan->price : 0.00);

        $receiptSlipPath = null;
        if ($request->hasFile('receipt_slip')) {
            $path = $request->file('receipt_slip')->store('receipts', 'public');
            $receiptSlipPath = '/storage/'.$path;
        }

        $payment = PaymentReceipt::create([
            'tenant_id' => $user->tenant_id,
            'amount' => $amount,
            'reference_number' => $request->reference_number ?? ('REQ-'.strtoupper(substr(uniqid(), -6))),
            'receipt_slip_path' => $receiptSlipPath,
            'status' => 'pending',
            'requested_tier' => $request->requested_tier,
            'remarks' => $request->remarks ?: ("Plan change requested to ".($plan ? $plan->name : $request->requested_tier)),
            'previous_license_expires_at' => $user->tenant->license_expires_at,
        ]);

        return response()->json([
            'message' => 'Plan change request submitted successfully. Superadmin has been notified for approval.',
            'payment' => $payment,
        ]);
    }
}
