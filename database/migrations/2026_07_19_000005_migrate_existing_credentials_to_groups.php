<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Moves data from legacy mib_device_credentials and bml_oauth_tokens tables
     * to the new mib_credential_groups, mib_credential_profiles, and bml_credential_groups
     * tables, setting foreign key references on bank_accounts.
     */
    public function up(): void
    {
        // 1. Migrate MIB credentials
        if (Schema::hasTable('mib_device_credentials')) {
            $legacyMibs = DB::table('mib_device_credentials')->get();
            foreach ($legacyMibs as $legacy) {
                // Find bank account to get tenant_id
                $account = DB::table('bank_accounts')->where('id', $legacy->bank_account_id)->first();
                if (!$account) continue;

                // Create or find group
                $groupId = DB::table('mib_credential_groups')->insertGetId([
                    'tenant_id' => $account->tenant_id,
                    'terminal_id' => $legacy->terminal_id,
                    'mib_username' => $legacy->mib_username,
                    'key1' => $legacy->key1,
                    'key2' => $legacy->key2,
                    'app_id' => $legacy->app_id,
                    'obtained_at' => $legacy->obtained_at,
                    'created_at' => $legacy->created_at,
                    'updated_at' => $legacy->updated_at,
                ]);

                // Create profile under the group
                $profileType = $account->mib_profile_type ?? '0';
                $profileId = DB::table('mib_credential_profiles')->insertGetId([
                    'credential_group_id' => $groupId,
                    'profile_id' => 'legacy_profile',
                    'profile_type' => $profileType,
                    'profile_name' => 'Legacy Profile',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                // Update the bank account with this profile ID
                DB::table('bank_accounts')
                    ->where('id', $legacy->bank_account_id)
                    ->update(['mib_credential_profile_id' => $profileId]);
            }
        }

        // 2. Migrate BML oauth tokens
        if (Schema::hasTable('bml_oauth_tokens')) {
            $legacyBmls = DB::table('bml_oauth_tokens')->get();
            foreach ($legacyBmls as $legacy) {
                $account = DB::table('bank_accounts')->where('id', $legacy->bank_account_id)->first();
                if (!$account) continue;

                $groupId = DB::table('bml_credential_groups')->insertGetId([
                    'tenant_id' => $account->tenant_id,
                    'terminal_id' => $legacy->terminal_id,
                    'bml_username' => $legacy->bml_username,
                    'profile_type' => $legacy->profile_type ?? 'personal',
                    'access_token' => $legacy->access_token,
                    'refresh_token' => $legacy->refresh_token,
                    'device_id' => $legacy->device_id,
                    'expires_in' => $legacy->expires_in,
                    'token_type' => $legacy->token_type ?? 'Bearer',
                    'last_grant' => $legacy->last_grant ?? 'authorization_code',
                    'obtained_at' => $legacy->obtained_at,
                    'expires_at' => $legacy->expires_at,
                    'created_at' => $legacy->created_at,
                    'updated_at' => $legacy->updated_at,
                ]);

                // Update bank account with this group ID
                DB::table('bank_accounts')
                    ->where('id', $legacy->bank_account_id)
                    ->update(['bml_credential_group_id' => $groupId]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // De-associate
        DB::table('bank_accounts')->update([
            'mib_credential_profile_id' => null,
            'bml_credential_group_id' => null,
        ]);
        // Delete records
        DB::table('mib_credential_profiles')->delete();
        DB::table('mib_credential_groups')->delete();
        DB::table('bml_credential_groups')->delete();
    }
};
