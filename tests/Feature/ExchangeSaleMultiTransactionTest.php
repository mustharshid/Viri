<?php

namespace Tests\Feature;

use App\Models\ExchangeSale;
use App\Models\Tenant;
use App\Models\Terminal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExchangeSaleMultiTransactionTest extends TestCase
{
    use RefreshDatabase;

    public function test_multi_transaction_sale_creation_and_claimed_token_splitting(): void
    {
        $tenant = Tenant::create([
            'name' => 'Exchange Multi Corp',
            'status' => 'active',
            'subscription_tier' => 'enterprise',
        ]);

        $terminal = Terminal::create([
            'tenant_id' => $tenant->id,
            'terminal_name' => 'Counter 1',
            'hardware_id' => 'HW_EXCHANGE_MULTI',
            'status' => 'active',
        ]);

        $payload = [
            'hardware_id' => 'HW_EXCHANGE_MULTI',
            'sale_type' => 'buy',
            'base_currency' => 'USD',
            'quote_currency' => 'MVR',
            'base_amount' => 1500.00,
            'exchange_rate' => 17.50,
            'quote_amount' => 26250.00,

            'received_payment_type' => 'bank',
            'received_transaction_id' => 'REF-A, REF-B, REF-C',
            'received_transaction_hash' => 'hash_a_64char_long_string_sample_12345678901234567890123456789012, hash_b_64char_long_string_sample_12345678901234567890123456789012',
            'received_transactions' => [
                ['hash' => 'hash_a_64char_long_string_sample_12345678901234567890123456789012', 'reference' => 'REF-A', 'amount' => '500.00', 'details' => 'Part 1'],
                ['hash' => 'hash_b_64char_long_string_sample_12345678901234567890123456789012', 'reference' => 'REF-B', 'amount' => '1000.00', 'details' => 'Part 2'],
            ],
            'received_amount' => 1500.00,
            'received_currency' => 'USD',

            'sent_payment_type' => 'cash',
            'sent_amount' => 26250.00,
            'sent_currency' => 'MVR',

            'customer_name' => 'Ahmed Multi',
        ];

        // 1. Create multi-transaction sale
        $response = $this->postJson('/api/terminal/exchange-sales', $payload);
        $response->assertStatus(201);
        $this->assertDatabaseHas('exchange_sales', [
            'tenant_id' => $tenant->id,
            'customer_name' => 'Ahmed Multi',
            'base_amount' => 1500.00,
        ]);

        // 2. Fetch claimed transactions
        $claimedRes = $this->getJson('/api/terminal/exchange-sales/claimed-tx-keys?hardware_id=HW_EXCHANGE_MULTI');
        $claimedRes->assertStatus(200);
        $keys = $claimedRes->json('claimed_keys');

        // Verify that individual tokens from comma-separated strings and JSON arrays were properly split
        $this->assertContains('REF-A', $keys);
        $this->assertContains('REF-B', $keys);
        $this->assertContains('hash_a_64char_long_string_sample_12345678901234567890123456789012', $keys);
        $this->assertContains('hash_b_64char_long_string_sample_12345678901234567890123456789012', $keys);

        // 3. Attempting to reuse one of the claimed transactions in a new sale must be rejected with 409
        $dupPayload = $payload;
        $dupPayload['received_transaction_id'] = 'REF-A';
        $dupPayload['received_transaction_hash'] = 'hash_a_64char_long_string_sample_12345678901234567890123456789012';
        $dupPayload['received_transactions'] = [
            ['hash' => 'hash_a_64char_long_string_sample_12345678901234567890123456789012', 'reference' => 'REF-A', 'amount' => '500.00']
        ];

        $dupRes = $this->postJson('/api/terminal/exchange-sales', $dupPayload);
        $dupRes->assertStatus(409);
        $dupRes->assertJsonStructure(['error']);
    }

    public function test_delete_sale_releases_claimed_transactions(): void
    {
        $tenant = Tenant::create([
            'name' => 'Delete Test Corp',
            'status' => 'active',
            'subscription_tier' => 'enterprise',
        ]);

        $terminal = Terminal::create([
            'tenant_id' => $tenant->id,
            'terminal_name' => 'Counter 2',
            'hardware_id' => 'HW_EXCHANGE_DELETE',
            'status' => 'active',
        ]);

        $payload = [
            'hardware_id' => 'HW_EXCHANGE_DELETE',
            'sale_type' => 'buy',
            'base_currency' => 'USD',
            'quote_currency' => 'MVR',
            'base_amount' => 100.00,
            'exchange_rate' => 17.50,
            'quote_amount' => 1750.00,

            'received_payment_type' => 'bank',
            'received_transaction_id' => 'TX-RELEASABLE-001',
            'received_transaction_hash' => 'hash_releasable_1234567890abcdef',
            'received_amount' => 100.00,
            'received_currency' => 'USD',

            'sent_payment_type' => 'cash',
            'sent_amount' => 1750.00,
            'sent_currency' => 'MVR',

            'customer_name' => 'Releasable Test',
        ];

        // 1. Create sale
        $createRes = $this->postJson('/api/terminal/exchange-sales', $payload);
        $createRes->assertStatus(201);
        $saleId = $createRes->json('sale.id');

        // Verify transaction is claimed
        $claimedRes1 = $this->getJson('/api/terminal/exchange-sales/claimed-tx-keys?hardware_id=HW_EXCHANGE_DELETE');
        $claimedRes1->assertStatus(200);
        $this->assertContains('TX-RELEASABLE-001', $claimedRes1->json('claimed_keys'));
        $this->assertContains('hash_releasable_1234567890abcdef', $claimedRes1->json('claimed_keys'));

        // 2. Delete sale
        $deleteRes = $this->deleteJson("/api/terminal/exchange-sales/{$saleId}?hardware_id=HW_EXCHANGE_DELETE");
        $deleteRes->assertStatus(200);
        $deleteRes->assertJson([
            'status' => 'success',
        ]);
        $this->assertDatabaseMissing('exchange_sales', [
            'id' => $saleId,
        ]);

        // 3. Verify claimed transactions are now released (no longer returned in claimed-tx-keys)
        $claimedRes2 = $this->getJson('/api/terminal/exchange-sales/claimed-tx-keys?hardware_id=HW_EXCHANGE_DELETE');
        $claimedRes2->assertStatus(200);
        $this->assertNotContains('TX-RELEASABLE-001', $claimedRes2->json('claimed_keys'));
        $this->assertNotContains('hash_releasable_1234567890abcdef', $claimedRes2->json('claimed_keys'));

        // 4. Verify transaction can now be used again without 409 Conflict
        $recreateRes = $this->postJson('/api/terminal/exchange-sales', $payload);
        $recreateRes->assertStatus(201);
    }
}
