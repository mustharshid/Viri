<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

use App\Models\MibDeviceCredential;
use Carbon\Carbon;

class MibKeysController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'hardware_id' => 'required|string',
            'bank_account_id' => 'required|integer',
            'mib_username' => 'required|string',
            'key1' => 'required|string',
            'key2' => 'required|string',
            'app_id' => 'required|string|max:64',
            'profile_id' => 'sometimes|nullable|string',
            'profile_type' => 'sometimes|nullable|string|max:4',
            'profile_name' => 'sometimes|nullable|string',
            'credentials_hash' => 'sometimes|nullable|string',
        ]);

        $terminal = \App\Models\Terminal::where('hardware_id', $validated['hardware_id'])->first();
        if (!$terminal) return response()->json(['error' => 'Unauthorized terminal'], 403);

        // 1. Upsert credential group — keyed by (tenant_id, mib_username) so the same credentials
        //    share ONE group across all terminals. terminal_id tracks whichever terminal most
        //    recently registered or refreshed the device keys.
        $group = \App\Models\MibCredentialGroup::updateOrCreate(
            [
                'tenant_id'    => $terminal->tenant_id,
                'mib_username' => $validated['mib_username'],
            ],
            [
                'terminal_id' => $terminal->id,
                'key1'        => $validated['key1'],
                'key2'        => $validated['key2'],
                'app_id'      => $validated['app_id'],
                'obtained_at' => Carbon::now(),
            ]
        );

        // 2. Resolve and upsert the profile
        $profileId = $validated['profile_id'] ?? 'default_profile';
        $profileType = $validated['profile_type'] ?? '0';
        $profileName = $validated['profile_name'] ?? '';

        $profile = \App\Models\MibCredentialProfile::updateOrCreate(
            [
                'credential_group_id' => $group->id,
                'profile_id'          => $profileId,
            ],
            [
                'profile_type' => $profileType,
                'profile_name' => $profileName,
            ]
        );

        // 3. Link requesting bank account to this profile
        $account = \App\Models\BankAccount::where('id', $validated['bank_account_id'])
            ->where('tenant_id', $terminal->tenant_id)
            ->first();

        if ($account) {
            $account->update(['mib_credential_profile_id' => $profile->id]);
        }

        return response()->json(['success' => true, 'group_id' => $group->id, 'profile_id' => $profile->id]);
    }

    public function getKeys(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
        ]);

        $terminal = \App\Models\Terminal::where('hardware_id', $request->hardware_id)->first();
        if (!$terminal) return response()->json(['error' => 'Unauthorized terminal'], 403);

        $group = null;
        $profile = null;
        $account = null;

        if ($request->has('mib_username')) {
            // Groups are now keyed by tenant, not terminal — look up by tenant scope.
            $group = \App\Models\MibCredentialGroup::where('tenant_id', $terminal->tenant_id)
                ->where('mib_username', $request->mib_username)
                ->first();
        } else if ($request->has('bank_account_id')) {
            $account = \App\Models\BankAccount::where('id', $request->bank_account_id)
                ->where('tenant_id', $terminal->tenant_id)
                ->first();
            if ($account) {
                $profile = $account->mibCredentialProfile;
                $group = $profile?->credentialGroup;
            }
        } else if ($request->has('account_number')) {
            $account = \App\Models\BankAccount::where('account_number', $request->account_number)
                ->where('tenant_id', $terminal->tenant_id)
                ->first();
            if ($account) {
                $profile = $account->mibCredentialProfile;
                $group = $profile?->credentialGroup;
            }
        }

        // Fallback 1: any group for this tenant (for legacy accounts not yet linked)
        if (!$group) {
            $group = \App\Models\MibCredentialGroup::where('tenant_id', $terminal->tenant_id)->first();
            if ($group && $account) {
                $profile = $account->mibCredentialProfile;
            }
        }

        // Fallback 2: Legacy MibDeviceCredential table lookup
        if (!$group) {
            $query = \App\Models\MibDeviceCredential::where('terminal_id', $terminal->id);
            if ($request->has('mib_username')) {
                $query->where('mib_username', $request->mib_username);
            } else if ($request->has('bank_account_id')) {
                $query->where('bank_account_id', $request->bank_account_id);
            } else if ($request->has('account_number')) {
                $query->whereHas('bankAccount', function($q) use ($request) {
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

        return response()->json([
            'key1' => $group->key1,
            'key2' => $group->key2,
            'appId' => $group->app_id,
            'profileId' => $profile?->profile_id,
            'profileType' => $profile?->profile_type ?? '0',
            'obtained_at' => $group->obtained_at ? $group->obtained_at->toIso8601String() : null,
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
            $terminal = \App\Models\Terminal::where('hardware_id', $request->hardware_id)->first();
            if (!$terminal) return response()->json(['error' => 'Unauthorized terminal'], 403);
            $tenantId = $terminal->tenant_id;
        }

        $bankName = $request->bank_name;
        $hash = $request->credentials_hash;
        $newAccountId = $request->bank_account_id;

        $newAccount = \App\Models\BankAccount::where('tenant_id', $tenantId)->findOrFail($newAccountId);

        // Find any other bank account in this tenant with the same credentials hash
        // that has already been linked to a group or profile, matching the profile type.
        $siblingQuery = \App\Models\BankAccount::where('tenant_id', $tenantId)
            ->where('bank_name', $bankName)
            ->where('login_credentials_hash', $hash)
            ->where('id', '!=', $newAccountId);

        if ($bankName === 'MIB') {
            $isBusiness = ($newAccount->mib_profile_type === '1');
            $siblingQuery->whereNotNull('mib_credential_profile_id')
                ->where(function($q) use ($isBusiness) {
                    if ($isBusiness) {
                        $q->where('mib_profile_type', '1');
                    } else {
                        $q->where('mib_profile_type', '0')
                          ->orWhereNull('mib_profile_type');
                    }
                });
        } else if ($bankName === 'BML') {
            $isBusiness = ($newAccount->bml_profile_type === '1');
            $siblingQuery->whereNotNull('bml_credential_group_id')
                ->where(function($q) use ($isBusiness) {
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
                $newAccount->update(['mib_credential_profile_id' => $sibling->mib_credential_profile_id]);
                $linkedAccounts = \App\Models\BankAccount::where('mib_credential_profile_id', $sibling->mib_credential_profile_id)
                    ->pluck('account_number');
                return response()->json([
                    'has_existing_group' => true,
                    'linked_accounts' => $linkedAccounts,
                    'can_link' => true,
                ]);
            } else if ($bankName === 'BML') {
                $newAccount->update(['bml_credential_group_id' => $sibling->bml_credential_group_id]);
                $linkedAccounts = \App\Models\BankAccount::where('bml_credential_group_id', $sibling->bml_credential_group_id)
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
            $terminal = \App\Models\Terminal::where('hardware_id', $request->hardware_id)->first();
            if (!$terminal) return response()->json(['error' => 'Unauthorized terminal'], 403);
            $tenantId = $terminal->tenant_id;
        }

        $accounts = \App\Models\BankAccount::where('tenant_id', $tenantId)
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
                    if (!isset($mibGroups[$groupKey])) {
                        $mibGroups[$groupKey] = [
                            'username' => $group->mib_username,
                            'profiles' => []
                        ];
                    }
                    $profileKey = $profile->profile_id;
                    if (!isset($mibGroups[$groupKey]['profiles'][$profileKey])) {
                        $mibGroups[$groupKey]['profiles'][$profileKey] = [
                            'profile_id' => $profile->profile_id,
                            'profile_type' => $profile->profile_type,
                            'profile_name' => $profile->profile_name,
                            'accounts' => []
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
            } else if ($acc->bank_name === 'BML') {
                $group = $acc->bmlCredentialGroup;
                if ($group) {
                    $groupKey = $group->bml_username . '_' . $group->profile_type;
                    if (!isset($bmlGroups[$groupKey])) {
                        $bmlGroups[$groupKey] = [
                            'username' => $group->bml_username,
                            'profile_type' => $group->profile_type,
                            'accounts' => []
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

