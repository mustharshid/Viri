<?php

namespace Tests\Feature;

use App\Models\BankAccount;
use App\Models\MibCredentialGroup;
use App\Models\MibCredentialProfile;
use App\Models\Tenant;
use App\Models\Terminal;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MibCredentialSecurityTest extends TestCase
{
    use DatabaseTransactions;

    private function hashFor(string $username): string
    {
        return hash('sha256', 'MIB_'.mb_strtolower(trim($username)));
    }

    /**
     * @return array{Tenant, User, Terminal}
     */
    private function makeTenantUserTerminal(): array
    {
        $tenant = Tenant::create(['name' => 'MIB Tenant '.rand(1000, 9999), 'status' => 'approved']);
        $user = User::create([
            'name' => 'MIB Admin',
            'email' => 'mibadmin'.rand(1000, 9999).'@test.com',
            'phone_number' => '7771111',
            'password' => 'password',
            'tenant_id' => $tenant->id,
            'role' => 'company_admin',
            'status' => 'active',
        ]);
        $terminal = Terminal::create([
            'tenant_id' => $tenant->id,
            'terminal_name' => 'MIB Terminal',
            'hardware_id' => 'HW-MIB-'.rand(100000, 999999),
            'status' => 'active',
        ]);

        return [$tenant, $user, $terminal];
    }

    private function makeGroup(Tenant $tenant, Terminal $terminal, string $username = 'bob', string $password = 'secret-pw'): MibCredentialGroup
    {
        return MibCredentialGroup::create([
            'tenant_id' => $tenant->id,
            'terminal_id' => $terminal->id,
            'mib_username' => $username,
            'mib_password' => $password,
            'key1' => 'K1-'.str_repeat('a', 40),
            'key2' => 'K2-'.str_repeat('b', 40),
            'app_id' => 'APP'.rand(1000, 9999),
            'obtained_at' => now(),
        ]);
    }

    private function makeAccount(Tenant $tenant, string $number, array $extra = []): BankAccount
    {
        return BankAccount::create(array_merge([
            'tenant_id' => $tenant->id,
            'bank_name' => 'MIB',
            'account_name' => 'Test Account',
            'account_number' => $number,
            'mib_profile_type' => '0',
        ], $extra));
    }

    public function test_get_keys_single_group_fallback_refuses_unidentified_account(): void
    {
        [$tenant, $user, $terminal] = $this->makeTenantUserTerminal();
        $this->makeGroup($tenant, $terminal);
        $account = $this->makeAccount($tenant, '7711000000');

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/mib/keys?hardware_id='.$terminal->hardware_id.'&account_number='.$account->account_number);

        $response->assertStatus(404);
        // The ambiguous account must not have been auto-linked to the group.
        $this->assertNull($account->fresh()->mib_credential_profile_id);
    }

    public function test_get_keys_single_group_fallback_allows_username_matched_account_and_discloses_password(): void
    {
        [$tenant, $user, $terminal] = $this->makeTenantUserTerminal();
        $group = $this->makeGroup($tenant, $terminal);
        $profile = MibCredentialProfile::create([
            'credential_group_id' => $group->id,
            'profile_id' => 'PROF-1',
            'profile_type' => '0',
            'profile_name' => 'Personal',
        ]);
        $account = $this->makeAccount($tenant, '7711000001', ['mib_username' => 'bob']);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/mib/keys?hardware_id='.$terminal->hardware_id.'&account_number='.$account->account_number);

        $response->assertOk()
            ->assertJson([
                'mib_username' => 'bob',
                'mib_password' => 'secret-pw',
            ]);
        $this->assertEquals($profile->id, $account->fresh()->mib_credential_profile_id);
    }

    public function test_get_keys_single_group_fallback_refuses_mismatched_username(): void
    {
        [$tenant, $user, $terminal] = $this->makeTenantUserTerminal();
        $this->makeGroup($tenant, $terminal);
        $account = $this->makeAccount($tenant, '7711000002', ['mib_username' => 'alice']);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/mib/keys?hardware_id='.$terminal->hardware_id.'&account_number='.$account->account_number);

        $response->assertStatus(404);
        $this->assertNull($account->fresh()->mib_credential_profile_id);
    }

    public function test_get_keys_single_group_fallback_allows_credentials_hash_matched_account(): void
    {
        [$tenant, $user, $terminal] = $this->makeTenantUserTerminal();
        $this->makeGroup($tenant, $terminal);
        MibCredentialProfile::create([
            'credential_group_id' => MibCredentialGroup::where('tenant_id', $tenant->id)->first()->id,
            'profile_id' => 'PROF-HASH',
            'profile_type' => '0',
            'profile_name' => 'Personal',
        ]);
        $account = $this->makeAccount($tenant, '7711000003', ['login_credentials_hash' => $this->hashFor('bob')]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/mib/keys?hardware_id='.$terminal->hardware_id.'&account_number='.$account->account_number);

        $response->assertOk()
            ->assertJsonPath('mib_username', 'bob');
        $this->assertNotNull($account->fresh()->mib_credential_profile_id);
    }

    public function test_store_persists_username_and_credentials_hash_on_account(): void
    {
        [$tenant, $user, $terminal] = $this->makeTenantUserTerminal();
        $account = $this->makeAccount($tenant, '7711000004');

        Sanctum::actingAs($user);

        $hash = $this->hashFor('bob');
        $this->postJson('/api/mib/keys/store', [
            'hardware_id' => $terminal->hardware_id,
            'bank_account_id' => $account->id,
            'mib_username' => 'bob',
            'mib_password' => 'secret-pw',
            'key1' => 'K1-'.str_repeat('a', 40),
            'key2' => 'K2-'.str_repeat('b', 40),
            'app_id' => 'APP-STORE-1',
            'profile_id' => 'PROF-STORE',
            'profile_type' => '0',
            'profile_name' => 'Personal',
            'credentials_hash' => $hash,
        ])->assertOk();

        $account->refresh();
        $this->assertEquals('bob', $account->mib_username);
        $this->assertEquals($hash, $account->login_credentials_hash);
        $this->assertNotNull($account->mib_credential_profile_id);
    }

    public function test_delete_bank_account_removes_orphaned_group_and_profile(): void
    {
        [$tenant, $user, $terminal] = $this->makeTenantUserTerminal();
        $group = $this->makeGroup($tenant, $terminal);
        $profile = MibCredentialProfile::create([
            'credential_group_id' => $group->id,
            'profile_id' => 'PROF-DEL',
            'profile_type' => '0',
            'profile_name' => 'Personal',
        ]);
        $account = $this->makeAccount($tenant, '7711000005', ['mib_credential_profile_id' => $profile->id]);

        Sanctum::actingAs($user);

        $this->deleteJson('/api/company/bank-accounts/'.$account->id)->assertOk();

        $this->assertDatabaseMissing('bank_accounts', ['id' => $account->id]);
        $this->assertDatabaseMissing('mib_credential_profiles', ['id' => $profile->id]);
        $this->assertDatabaseMissing('mib_credential_groups', ['id' => $group->id]);
    }

    public function test_delete_bank_account_keeps_shared_group_when_sibling_references_it(): void
    {
        [$tenant, $user, $terminal] = $this->makeTenantUserTerminal();
        $group = $this->makeGroup($tenant, $terminal);
        $profile = MibCredentialProfile::create([
            'credential_group_id' => $group->id,
            'profile_id' => 'PROF-SIB',
            'profile_type' => '0',
            'profile_name' => 'Personal',
        ]);
        $accountA = $this->makeAccount($tenant, '7711000006', ['mib_credential_profile_id' => $profile->id]);
        $this->makeAccount($tenant, '7711000007', ['mib_credential_profile_id' => $profile->id]);

        Sanctum::actingAs($user);

        $this->deleteJson('/api/company/bank-accounts/'.$accountA->id)->assertOk();

        $this->assertDatabaseHas('mib_credential_profiles', ['id' => $profile->id]);
        $this->assertDatabaseHas('mib_credential_groups', ['id' => $group->id]);
    }

    public function test_clear_api_token_revokes_group_for_sole_identity_known_account(): void
    {
        [$tenant, $user, $terminal] = $this->makeTenantUserTerminal();
        $group = $this->makeGroup($tenant, $terminal);
        MibCredentialProfile::create([
            'credential_group_id' => $group->id,
            'profile_id' => 'PROF-CLR',
            'profile_type' => '0',
            'profile_name' => 'Personal',
        ]);
        $account = $this->makeAccount($tenant, '7711000008', ['mib_username' => 'bob']);

        $this->postJson('/api/terminal/bank-accounts/clear-api-token', [
            'hardware_id' => $terminal->hardware_id,
            'bank_account_id' => $account->id,
        ])->assertOk();

        $this->assertDatabaseMissing('mib_credential_groups', ['id' => $group->id]);
        $this->assertDatabaseMissing('mib_credential_profiles', ['credential_group_id' => $group->id]);
    }

    public function test_clear_api_token_keeps_group_when_sibling_shares_credentials(): void
    {
        [$tenant, $user, $terminal] = $this->makeTenantUserTerminal();
        $group = $this->makeGroup($tenant, $terminal);
        MibCredentialProfile::create([
            'credential_group_id' => $group->id,
            'profile_id' => 'PROF-CLR-SIB',
            'profile_type' => '0',
            'profile_name' => 'Personal',
        ]);
        $hash = $this->hashFor('bob');
        $account = $this->makeAccount($tenant, '7711000009', ['mib_username' => 'bob', 'login_credentials_hash' => $hash]);
        $this->makeAccount($tenant, '7711000010', ['login_credentials_hash' => $hash]);

        $this->postJson('/api/terminal/bank-accounts/clear-api-token', [
            'hardware_id' => $terminal->hardware_id,
            'bank_account_id' => $account->id,
        ])->assertOk();

        $this->assertDatabaseHas('mib_credential_groups', ['id' => $group->id]);
    }
}
