<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\MibCredentialGroup;
use App\Models\MibCredentialProfile;
use App\Models\MibDeviceCredential;
use App\Models\Terminal;
use Carbon\Carbon;
use Illuminate\Http\Request;

class MibKeysController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'hardware_id' => 'required|string',
            'bank_account_id' => 'required|integer',
            'mib_username' => 'required|string',
            'mib_password' => 'sometimes|nullable|string',
            'key1' => 'required|string',
            'key2' => 'required|string',
            'app_id' => 'required|string|max:64',
            'profile_id' => 'sometimes|nullable|string',
            'profile_type' => 'sometimes|nullable|string|max:4',
            'profile_name' => 'sometimes|nullable|string',
            'credentials_hash' => 'sometimes|nullable|string',
            'profiles' => 'sometimes|nullable|array',
            'profiles.*.profile_id' => 'required|string',
            'profiles.*.profile_type' => 'sometimes|nullable|string|max:4',
            'profiles.*.profile_name' => 'sometimes|nullable|string',
        ]);

        $terminal = Terminal::where('hardware_id', $validated['hardware_id'])->first();
        if (! $terminal) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        // auth:sanctum is required on this route; the authenticated user must belong
        // to the terminal's tenant (superadmin exempt) so a terminal token can never
        // poison another tenant's credential group.
        $user = $request->user();
        if ($user && $user->role !== 'superadmin' && $user->tenant_id !== $terminal->tenant_id) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        // 1. Upsert credential group — keyed by (tenant_id, mib_username) so the same credentials
        //    share ONE group across all terminals. terminal_id tracks whichever terminal most
        //    recently registered or refreshed the device keys. mib_password is stored encrypted
        //    at rest (model cast) so terminals that lose local state can re-authenticate.
        $group = MibCredentialGroup::updateOrCreate(
            [
                'tenant_id' => $terminal->tenant_id,
                'mib_username' => $validated['mib_username'],
            ],
            array_merge([
                'terminal_id' => $terminal->id,
                'key1' => $validated['key1'],
                'key2' => $validated['key2'],
                'app_id' => $validated['app_id'],
                'obtained_at' => Carbon::now(),
            ], $request->filled('mib_password') ? ['mib_password' => $validated['mib_password']] : [])
        );

        // 1b. Persist the terminal's own device keys (per-terminal registration). This table is
        //     keyed by (terminal_id, bank_account_id, mib_username) — see migration
        //     2026_07_16_163052. Retain per-terminal rows for rebuild/re-auth lookups.
        MibDeviceCredential::updateOrCreate(
            [
                'terminal_id' => $terminal->id,
                'bank_account_id' => $validated['bank_account_id'],
                'mib_username' => $validated['mib_username'],
            ],
            [
                'key1' => $validated['key1'],
                'key2' => $validated['key2'],
                'app_id' => $validated['app_id'],
                'obtained_at' => Carbon::now(),
            ]
        );

        // 2. Resolve and upsert the single profile (backward-compatible single-profile payload)
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

        // 2b. Bulk-persist the full profile list captured at first sign-in so the shared
        // "Choose Profile" list is available to every terminal / the admin dashboard.
        $capturedProfileIds = [];
        if (is_array($validated['profiles'] ?? null)) {
            foreach ($validated['profiles'] as $p) {
                $pid = $p['profile_id'] ?? null;
                if (! $pid) {
                    continue;
                }
                $capturedProfileIds[] = $pid;
                MibCredentialProfile::updateOrCreate(
                    [
                        'credential_group_id' => $group->id,
                        'profile_id' => $pid,
                    ],
                    [
                        'profile_type' => $p['profile_type'] ?? '0',
                        'profile_name' => $p['profile_name'] ?? '',
                    ]
                );
            }
        }

        // 3. Link requesting account to its profile
        $account = BankAccount::where('id', $validated['bank_account_id'])
            ->where('tenant_id', $terminal->tenant_id)
            ->first();

        if ($account) {
            // If the account already has an admin-assigned profile, prefer it over re-linking.
            if ($account->mib_credential_profile_id === null) {
                $account->update(['mib_credential_profile_id' => $profile->id]);

                // Auto-link unlinked sibling MIB accounts under the same tenant — but only
                // ever accounts belonging to the SAME MIB user (matched via
                // login_credentials_hash). Never link by profile-type alone: with several
                // MIB users under one tenant a type-match would attach another user's
                // account to this login's keys/profile. Admin-assigned profiles are left
                // untouched (mib_credential_profile_id NOT NULL above).
                BankAccount::where('tenant_id', $terminal->tenant_id)
                    ->where('bank_name', 'MIB')
                    ->whereNotNull('login_credentials_hash')
                    ->whereNull('mib_credential_profile_id')
                    ->where('login_credentials_hash', $account->login_credentials_hash)
                    ->update(['mib_credential_profile_id' => $profile->id]);
            }
        }

        return response()->json([
            'success' => true,
            'group_id' => $group->id,
            'profile_id' => $profile->id,
            'profiles_persisted' => count($capturedProfileIds),
        ]);
    }

    public function getKeys(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)->first();
        if (! $terminal) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        // auth:sanctum is required on this route; additionally the authenticated user
        // must belong to the terminal's tenant (superadmin is exempt for platform ops).
        $user = $request->user();
        if ($user && $user->role !== 'superadmin' && $user->tenant_id !== $terminal->tenant_id) {
            return response()->json(['error' => 'Unauthorized terminal'], 403);
        }

        $group = null;
        $profile = null;
        $account = null;
        $device = null;

        if ($request->filled('mib_username')) {
            // Groups are now keyed by tenant, not terminal — look up by tenant scope.
            // Match case-insensitively to stay consistent with the admin resolver.
            $group = MibCredentialGroup::where('tenant_id', $terminal->tenant_id)
                ->whereRaw('LOWER(mib_username) = ?', [mb_strtolower(trim((string) $request->mib_username))])
                ->first();
        } elseif ($request->has('bank_account_id')) {
            $account = BankAccount::where('id', $request->bank_account_id)
                ->where('tenant_id', $terminal->tenant_id)
                ->first();
            if ($account) {
                $profile = $account->mibCredentialProfile;
                $group = $profile?->credentialGroup;
                $device = MibDeviceCredential::where('terminal_id', $terminal->id)
                    ->where('bank_account_id', $account->id)
                    ->where('mib_username', $account->mibCredentialProfile?->credentialGroup?->mib_username ?? null)
                    ->first();
            }
        } elseif ($request->has('account_number')) {
            $account = BankAccount::where('account_number', $request->account_number)
                ->where('tenant_id', $terminal->tenant_id)
                ->first();
            if ($account) {
                $profile = $account->mibCredentialProfile;
                $group = $profile?->credentialGroup;
                $device = MibDeviceCredential::where('terminal_id', $terminal->id)
                    ->where('bank_account_id', $account->id)
                    ->where('mib_username', $account->mibCredentialProfile?->credentialGroup?->mib_username ?? null)
                    ->first();
            }
        }

        // Fallback 1: If the requested account has no group, fall back to the
        // tenant's group ONLY when it is unambiguous (exactly one MIB group for
        // the tenant). Never hand a different MIB user's keys/credentials to a
        // look-up — with multiple MIB users under one tenant the fallback would
        // cross-match secrets and reproduce the MIB auth failures.
        if (! $group) {
            $tenantGroups = MibCredentialGroup::where('tenant_id', $terminal->tenant_id)->get();
            if ($tenantGroups->count() === 1) {
                $group = $tenantGroups->first();
            }
        }

        // Auto-heal: If group exists for tenant but account profile is not linked, link it.
        // Only when the group is unambiguous for this account AND the admin has not
        // already assigned a profile. When the account carries an admin-entered
        // username, only auto-heal onto a group belonging to the SAME user — never
        // attach a stored username to a different user's group (C2).
        if ($group && $account && ! $profile && $account->mib_credential_profile_id === null) {
            $accountUsername = $account->mib_username !== null && $account->mib_username !== ''
                ? mb_strtolower(trim((string) $account->mib_username)) : null;
            $groupUsername = $group->mib_username !== null && $group->mib_username !== ''
                ? mb_strtolower(trim((string) $group->mib_username)) : null;

            if ($accountUsername === null || ($groupUsername !== null && $accountUsername === $groupUsername)) {
                $targetType = $account->mib_profile_type ?? '0';
                $profile = MibCredentialProfile::where('credential_group_id', $group->id)
                    ->where('profile_type', $targetType)
                    ->first();

                if (! $profile) {
                    $profile = MibCredentialProfile::where('credential_group_id', $group->id)->first();
                }

                if ($profile) {
                    $account->update(['mib_credential_profile_id' => $profile->id]);
                }
            }
        }

        // Fallback 2: Legacy MibDeviceCredential table lookup
        if (! $group) {
            $query = MibDeviceCredential::where('terminal_id', $terminal->id);
            if ($request->has('mib_username')) {
                $query->where('mib_username', $request->mib_username);
            } elseif ($request->has('bank_account_id')) {
                $query->where('bank_account_id', $request->bank_account_id);
            } elseif ($request->has('account_number')) {
                $query->whereHas('bankAccount', function ($q) use ($request) {
                    $q->where('account_number', $request->account_number);
                });
            }
            $legacy = $query->first();
            if ($legacy) {
                return response()->json([
                    'key1' => $legacy->key1,
                    'key2' => $legacy->key2,
                    'appId' => $legacy->app_id,
                    'obtained_at' => $legacy->obtained_at ? $legacy->obtained_at->toIso8601String() : null,
                ]);
            }

            return response()->json(['error' => 'Not found'], 404);
        }

        // Prefer the requesting terminal's own device keys; fall back to the shared group keys.
        // The password is only disclosed when a concrete bank account is requested (i.e. the
        // terminal is operating on a specific admin-assigned account), never for a username-only
        // lookup that any terminal of the tenant could make.
        $resolvedKey1 = $device?->key1 ?: $group->key1;
        $resolvedKey2 = $device?->key2 ?: $group->key2;
        $resolvedAppId = $device?->app_id ?: $group->app_id;
        $resolvedObtainedAt = $device?->obtained_at ?: $group->obtained_at;

        $allProfiles = $group->profiles()->get()->map(function ($p) {
            return [
                'profile_id' => $p->profile_id,
                'profile_type' => $p->profile_type,
                'profile_name' => $p->profile_name,
            ];
        });

        $hasConcreteAccount = $request->filled('bank_account_id') || $request->filled('account_number');
        $mibUsername = $group->mib_username;

        // H2 + B3 (defense-in-depth): the encrypted password is disclosed to a
        // terminal only when the account is CONFIRMEDLY linked to the resolved group —
        // a profile FK, a stored login hash matching the group's username, or a profile
        // auto-healed in this same request — AND (for accounts carrying a stored
        // username) the usernames match. This blocks the single-group fallback and
        // unconfirmed two-step links from leaking another user's password to a terminal,
        // while preserving disclosure for every extension-paired/legacy account.
        $disclosePassword = $hasConcreteAccount && $account && $group;
        if ($disclosePassword) {
            $isLinked = $account->mib_credential_profile_id !== null
                || ($account->login_credentials_hash !== null
                    && hash_equals(hash('sha256', 'MIB_'.mb_strtolower(trim((string) $group->mib_username))), $account->login_credentials_hash))
                || $profile !== null;
            $disclosePassword = $isLinked;
        }
        if ($disclosePassword && $account->mib_username !== null && $account->mib_username !== '') {
            $stored = mb_strtolower(trim((string) $account->mib_username));
            $grouped = mb_strtolower(trim((string) $group->mib_username));
            if ($stored !== $grouped) {
                $disclosePassword = false;
            }
        }

        return response()->json([
            'key1' => $resolvedKey1,
            'key2' => $resolvedKey2,
            'appId' => $resolvedAppId,
            'mib_username' => $mibUsername,
            'mib_password' => $disclosePassword ? $group->mib_password : null,
            'profileId' => $profile?->profile_id,
            'profileType' => $profile?->profile_type ?? '0',
            'profiles' => $allProfiles,
            'obtained_at' => $resolvedObtainedAt ? $resolvedObtainedAt->toIso8601String() : null,
        ]);
    }

    public function getSiblingCheck(Request $request)
    {
        $request->validate([
            'bank_name' => 'required|string',
            'credentials_hash' => 'required|string',
            'bank_account_id' => 'required|integer',
        ]);

        $tenantId = null;
        if ($request->user()) {
            $tenantId = $request->user()->tenant_id;
        } else {
            $request->validate(['hardware_id' => 'required|string']);
            $terminal = Terminal::where('hardware_id', $request->hardware_id)->first();
            if (! $terminal) {
                return response()->json(['error' => 'Unauthorized terminal'], 403);
            }
            $tenantId = $terminal->tenant_id;
        }

        $bankName = $request->bank_name;
        $hash = $request->credentials_hash;
        $newAccountId = $request->bank_account_id;

        $newAccount = BankAccount::where('tenant_id', $tenantId)->findOrFail($newAccountId);

        // Find any other bank account in this tenant with the same credentials hash
        // that has already been linked to a group or profile, matching the profile type.
        $siblingQuery = BankAccount::where('tenant_id', $tenantId)
            ->where('bank_name', $bankName)
            ->where('login_credentials_hash', $hash)
            ->where('id', '!=', $newAccountId);

        if ($bankName === 'MIB') {
            $isBusiness = ($newAccount->mib_profile_type === '1');
            $siblingQuery->whereNotNull('mib_credential_profile_id')
                ->where(function ($q) use ($isBusiness) {
                    if ($isBusiness) {
                        $q->where('mib_profile_type', '1');
                    } else {
                        $q->where('mib_profile_type', '0')
                            ->orWhereNull('mib_profile_type');
                    }
                });
        } elseif ($bankName === 'BML') {
            $isBusiness = ($newAccount->bml_profile_type === '1');
            $siblingQuery->whereNotNull('bml_credential_group_id')
                ->where(function ($q) use ($isBusiness) {
                    if ($isBusiness) {
                        $q->where('bml_profile_type', '1');
                    } else {
                        $q->where('bml_profile_type', '0')
                            ->orWhereNull('bml_profile_type');
                    }
                });
        } else {
            return response()->json([
                'has_existing_group' => false,
                'can_link' => false,
            ]);
        }

        $sibling = $siblingQuery->first();

        if ($sibling) {
            if ($bankName === 'MIB') {
                $siblingGroup = $sibling->mibCredentialProfile?->credentialGroup;

                // B1 (H1): never rebind an account that is already linked to a
                // different user's profile — require an explicit unlink first.
                if ($newAccount->mib_credential_profile_id !== null) {
                    $currentGroup = $newAccount->mibCredentialProfile?->credentialGroup;
                    if ($currentGroup && $siblingGroup && $currentGroup->id !== $siblingGroup->id) {
                        return response()->json([
                            'has_existing_group' => false,
                            'can_link' => false,
                            'error' => 'Account is already linked to a different MIB profile. Unlink it first.',
                        ]);
                    }
                }

                // B2: when the account carries a stored hash, the sibling group must
                // belong to the same MIB user identified by that hash.
                if ($newAccount->login_credentials_hash && $siblingGroup && $siblingGroup->mib_username) {
                    $expectedHash = hash('sha256', 'MIB_'.mb_strtolower(trim($siblingGroup->mib_username)));
                    if (! hash_equals($expectedHash, $newAccount->login_credentials_hash)) {
                        return response()->json([
                            'has_existing_group' => false,
                            'can_link' => false,
                            'error' => 'Existing credential group does not match this account\'s username.',
                        ]);
                    }
                }

                $newAccount->update(['mib_credential_profile_id' => $sibling->mib_credential_profile_id]);
                $linkedAccounts = BankAccount::where('mib_credential_profile_id', $sibling->mib_credential_profile_id)
                    ->pluck('account_number');

                return response()->json([
                    'has_existing_group' => true,
                    'linked_accounts' => $linkedAccounts,
                    'can_link' => true,
                ]);
            } elseif ($bankName === 'BML') {
                $siblingGroup = $sibling->bmlCredentialGroup;

                // B1 (H1): mirror the MIB guard for BML — never rebind an account
                // that is already linked to a different credential group.
                if ($newAccount->bml_credential_group_id !== null && $newAccount->bml_credential_group_id !== $sibling->bml_credential_group_id) {
                    return response()->json([
                        'has_existing_group' => false,
                        'can_link' => false,
                        'error' => 'Account is already linked to a different BML credential group. Unlink it first.',
                    ]);
                }

                // B2: verify the account's stored hash identifies the sibling's user.
                if ($newAccount->login_credentials_hash && $siblingGroup && $siblingGroup->bml_username) {
                    $expectedHash = hash('sha256', 'BML_'.mb_strtolower(trim($siblingGroup->bml_username)));
                    if (! hash_equals($expectedHash, $newAccount->login_credentials_hash)) {
                        return response()->json([
                            'has_existing_group' => false,
                            'can_link' => false,
                            'error' => 'Existing credential group does not match this account\'s username.',
                        ]);
                    }
                }

                $newAccount->update(['bml_credential_group_id' => $sibling->bml_credential_group_id]);
                $linkedAccounts = BankAccount::where('bml_credential_group_id', $sibling->bml_credential_group_id)
                    ->pluck('account_number');

                return response()->json([
                    'has_existing_group' => true,
                    'linked_accounts' => $linkedAccounts,
                    'can_link' => true,
                ]);
            }
        }

        return response()->json([
            'has_existing_group' => false,
            'can_link' => false,
        ]);
    }

    public function getCredentialSiblings(Request $request)
    {
        $tenantId = null;
        if ($request->user()) {
            $tenantId = $request->user()->tenant_id;
        } else {
            $request->validate(['hardware_id' => 'required|string']);
            $terminal = Terminal::where('hardware_id', $request->hardware_id)->first();
            if (! $terminal) {
                return response()->json(['error' => 'Unauthorized terminal'], 403);
            }
            $tenantId = $terminal->tenant_id;
        }

        $accounts = BankAccount::where('tenant_id', $tenantId)
            ->with(['mibCredentialProfile.credentialGroup', 'bmlCredentialGroup'])
            ->get();

        $mibGroups = [];
        $bmlGroups = [];
        $unlinked = [];

        foreach ($accounts as $acc) {
            if ($acc->bank_name === 'MIB') {
                $profile = $acc->mibCredentialProfile;
                $group = $profile?->credentialGroup;
                if ($group) {
                    $groupKey = $group->mib_username;
                    if (! isset($mibGroups[$groupKey])) {
                        $mibGroups[$groupKey] = [
                            'username' => $group->mib_username,
                            'profiles' => [],
                        ];
                    }
                    $profileKey = $profile->profile_id;
                    if (! isset($mibGroups[$groupKey]['profiles'][$profileKey])) {
                        $mibGroups[$groupKey]['profiles'][$profileKey] = [
                            'profile_id' => $profile->profile_id,
                            'profile_type' => $profile->profile_type,
                            'profile_name' => $profile->profile_name,
                            'accounts' => [],
                        ];
                    }
                    $mibGroups[$groupKey]['profiles'][$profileKey]['accounts'][] = [
                        'id' => $acc->id,
                        'account_number' => $acc->account_number,
                        'account_name' => $acc->account_name,
                        'label' => $acc->label,
                        'currency' => $acc->currency,
                        'login_failures' => $acc->login_failures,
                        'has_api_token' => $acc->has_api_token,
                    ];
                } else {
                    $unlinked[] = [
                        'id' => $acc->id,
                        'bank_name' => $acc->bank_name,
                        'account_number' => $acc->account_number,
                        'account_name' => $acc->account_name,
                        'label' => $acc->label,
                        'currency' => $acc->currency,
                        'login_failures' => $acc->login_failures,
                        'has_api_token' => $acc->has_api_token,
                    ];
                }
            } elseif ($acc->bank_name === 'BML') {
                $group = $acc->bmlCredentialGroup;
                if ($group) {
                    $groupKey = $group->bml_username.'_'.$group->profile_type;
                    if (! isset($bmlGroups[$groupKey])) {
                        $bmlGroups[$groupKey] = [
                            'username' => $group->bml_username,
                            'profile_type' => $group->profile_type,
                            'accounts' => [],
                        ];
                    }
                    $bmlGroups[$groupKey]['accounts'][] = [
                        'id' => $acc->id,
                        'account_number' => $acc->account_number,
                        'account_name' => $acc->account_name,
                        'label' => $acc->label,
                        'currency' => $acc->currency,
                        'login_failures' => $acc->login_failures,
                        'has_api_token' => $acc->has_api_token,
                    ];
                } else {
                    $unlinked[] = [
                        'id' => $acc->id,
                        'bank_name' => $acc->bank_name,
                        'account_number' => $acc->account_number,
                        'account_name' => $acc->account_name,
                        'label' => $acc->label,
                        'currency' => $acc->currency,
                        'login_failures' => $acc->login_failures,
                        'has_api_token' => $acc->has_api_token,
                    ];
                }
            } else {
                $unlinked[] = [
                    'id' => $acc->id,
                    'bank_name' => $acc->bank_name,
                    'account_number' => $acc->account_number,
                    'account_name' => $acc->account_name,
                    'label' => $acc->label,
                    'currency' => $acc->currency,
                    'login_failures' => $acc->login_failures,
                    'has_api_token' => $acc->has_api_token,
                ];
            }
        }

        // Format map to arrays for JSON response
        $formattedMib = [];
        foreach ($mibGroups as $g) {
            $g['profiles'] = array_values($g['profiles']);
            $formattedMib[] = $g;
        }

        return response()->json([
            'mib_groups' => $formattedMib,
            'bml_groups' => array_values($bmlGroups),
            'unlinked' => $unlinked,
        ]);
    }
}
