<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use App\Models\Tenant;
use App\Models\Terminal;

class TenantApiTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test terminal verification for an active tenant.
     */
    public function test_verify_active_terminal()
    {
        $tenant = Tenant::create([
            'name' => 'Viri Store 1',
            'status' => 'active',
            'license_expires_at' => now()->addDays(30)
        ]);

        $terminal = Terminal::create([
            'tenant_id' => $tenant->id,
            'terminal_name' => 'Counter A',
            'hardware_id' => 'HW-123456',
            'status' => 'active'
        ]);

        $response = $this->postJson('/api/verify-terminal', [
            'hardware_id' => 'HW-123456'
        ]);

        $response->assertStatus(200)
                 ->assertJson([
                     'status' => 'authorized',
                     'tenant' => [
                         'name' => 'Viri Store 1'
                     ]
                 ]);
    }

    /**
     * Test terminal verification fails for a suspended tenant.
     */
    public function test_verify_terminal_fails_for_suspended_tenant()
    {
        $tenant = Tenant::create([
            'name' => 'Viri Store 2',
            'status' => 'suspended', // Suspended
            'license_expires_at' => now()->addDays(30)
        ]);

        $terminal = Terminal::create([
            'tenant_id' => $tenant->id,
            'terminal_name' => 'Counter B',
            'hardware_id' => 'HW-654321',
            'status' => 'active'
        ]);

        $response = $this->postJson('/api/verify-terminal', [
            'hardware_id' => 'HW-654321'
        ]);

        $response->assertStatus(403)
                 ->assertJson([
                     'error' => 'Tenant subscription suspended or expired'
                 ]);
    }

    /**
     * Test admin endpoint rejects unauthorized access.
     */
    public function test_admin_route_unauthorized()
    {
        $response = $this->getJson('/api/admin/tenants');

        // Assuming middleware returns 401 when missing bearer token
        $response->assertStatus(401);
    }
}
