<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\Terminal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TerminalVerifyStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_inactive_or_missing_terminal_returns_terminal_revoked()
    {
        $tenant = Tenant::create([
            'name' => 'Test Corp',
            'status' => 'active',
            'subscription_tier' => 'free',
        ]);

        $terminal = Terminal::create([
            'tenant_id' => $tenant->id,
            'terminal_name' => 'Counter 1',
            'hardware_id' => 'HW_INACTIVE',
            'status' => 'inactive',
        ]);

        $response = $this->postJson('/api/verify-terminal', [
            'hardware_id' => 'HW_INACTIVE',
        ]);

        $response->assertStatus(403);
        $response->assertJson([
            'error' => 'Terminal unauthorized or revoked',
            'error_code' => 'TERMINAL_REVOKED',
        ]);
    }

    public function test_suspended_tenant_returns_tenant_suspended_with_subscription_expired_flag()
    {
        $tenant = Tenant::create([
            'name' => 'Test Corp Suspended',
            'status' => 'suspended',
            'subscription_tier' => 'free',
        ]);

        $terminal = Terminal::create([
            'tenant_id' => $tenant->id,
            'terminal_name' => 'Counter 2',
            'hardware_id' => 'HW_ACTIVE_TENANT_SUSPENDED',
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/verify-terminal', [
            'hardware_id' => 'HW_ACTIVE_TENANT_SUSPENDED',
        ]);

        $response->assertStatus(403);
        $response->assertJson([
            'error' => 'Company account pending approval or suspended',
            'error_code' => 'TENANT_SUSPENDED',
            'subscription_expired' => true,
        ]);
    }

    public function test_active_tenant_and_terminal_returns_authorized()
    {
        $tenant = Tenant::create([
            'name' => 'Test Corp Active',
            'status' => 'active',
            'subscription_tier' => 'free',
        ]);

        $terminal = Terminal::create([
            'tenant_id' => $tenant->id,
            'terminal_name' => 'Counter 3',
            'hardware_id' => 'HW_ACTIVE_VALID',
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/verify-terminal', [
            'hardware_id' => 'HW_ACTIVE_VALID',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'status' => 'authorized',
            'terminal_id' => $terminal->id,
            'permissions' => [
                'sales_exchange_enabled' => false,
            ],
        ]);
    }

    public function test_sales_exchange_enabled_governance_cascade()
    {
        // 1. When tenant has sales_exchange_enabled = false
        $tenantDisabled = Tenant::create([
            'name' => 'Plan Disabled Corp',
            'status' => 'active',
            'subscription_tier' => 'pro',
            'features' => ['sales_exchange_enabled' => false],
        ]);

        $term1 = Terminal::create([
            'tenant_id' => $tenantDisabled->id,
            'terminal_name' => 'Counter A',
            'hardware_id' => 'HW_PLAN_DISABLED',
            'status' => 'active',
            'permissions' => ['sales_exchange_enabled' => true],
        ]);

        $res1 = $this->postJson('/api/verify-terminal', ['hardware_id' => 'HW_PLAN_DISABLED']);
        $res1->assertStatus(200);
        $this->assertFalse($res1->json('permissions.sales_exchange_enabled'));

        // 2. When tenant has sales_exchange_enabled = true AND terminal has sales_exchange_enabled = true
        $tenantEnabled = Tenant::create([
            'name' => 'Plan Enabled Corp',
            'status' => 'active',
            'subscription_tier' => 'pro',
            'features' => ['sales_exchange_enabled' => true],
        ]);

        $term2 = Terminal::create([
            'tenant_id' => $tenantEnabled->id,
            'terminal_name' => 'Counter B',
            'hardware_id' => 'HW_PLAN_ENABLED',
            'status' => 'active',
            'permissions' => ['sales_exchange_enabled' => true],
        ]);

        $res2 = $this->postJson('/api/verify-terminal', ['hardware_id' => 'HW_PLAN_ENABLED']);
        $res2->assertStatus(200);
        $this->assertTrue($res2->json('permissions.sales_exchange_enabled'));
        $this->assertTrue($res2->json('permissions.kyc_enabled'));
    }
}
