<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Models\Commission;
use App\Models\Invoice;
use App\Models\PayoutBatch;
use App\Models\ReferralAttribution;
use App\Models\ReferralPerformanceTier;
use App\Models\ReferralSystemConfig;
use App\Models\Tenant;
use App\Models\User;
use App\Services\ReferralCommissionEngine;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class ReferralSystemTest extends TestCase
{
    use DatabaseTransactions;

    public function test_customer_registration_creates_referral_attribution(): void
    {
        $code = 'TEST' . rand(100, 999);
        $affiliate = Affiliate::create([
            'name' => 'Test Partner',
            'email' => 'partner' . rand(1000, 9999) . '@test.com',
            'referral_code' => $code,
            'custom_coupon_code' => 'VIRI-' . $code,
            'status' => 'active',
        ]);

        // 2. Register new customer with referral code
        $response = $this->postJson('/api/register', [
            'company_name' => 'Acme Cafe',
            'name' => 'Customer Admin',
            'email' => 'customer' . rand(1000, 9999) . '@test.com',
            'phone_number' => '7771234',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'referral_code' => $code,
        ]);

        $response->assertStatus(200);

        // 3. Verify attribution created
        $this->assertDatabaseHas('referral_attributions', [
            'affiliate_id' => $affiliate->id,
            'applied_referral_code' => $code,
            'status' => 'active',
        ]);
    }

    public function test_dynamic_upgrade_scaling_calculates_correct_commission(): void
    {
        // 1. Setup Tier with 5% bonus
        $silverTier = ReferralPerformanceTier::firstOrCreate(
            ['name' => 'Silver Partner Test'],
            ['min_monthly_sales' => 10, 'bonus_commission_pct' => 5.00, 'badge_color' => '#06B6D4']
        );

        $code = 'UPG' . rand(100, 999);
        $affiliate = Affiliate::create([
            'name' => 'Upgraded Partner',
            'email' => 'upgraded' . rand(1000, 9999) . '@test.com',
            'referral_code' => $code,
            'current_tier_id' => $silverTier->id,
            'status' => 'active',
        ]);

        $tenant = Tenant::create([
            'name' => 'Upgraded Tenant ' . rand(100, 999),
            'status' => 'approved',
            'features' => ['tier_key' => 'business'], // Upgraded to Business (20% base)
        ]);

        $attribution = ReferralAttribution::create([
            'affiliate_id' => $affiliate->id,
            'tenant_id' => $tenant->id,
            'applied_referral_code' => $code,
            'initial_plan_key' => 'starter',
            'payout_duration_limit_months' => 12,
            'invoices_commissioned_count' => 0,
            'attributed_at' => Carbon::now(),
            'status' => 'active',
        ]);

        // 2. Invoice generated for MVR 2,000 (Business Plan amount)
        $invoice = Invoice::create([
            'tenant_id' => $tenant->id,
            'amount' => 2000.00,
            'billing_period_start' => Carbon::now()->startOfMonth(),
            'billing_period_end' => Carbon::now()->endOfMonth(),
            'status' => 'paid',
        ]);

        $engine = new ReferralCommissionEngine();
        $commission = $engine->processInvoiceCommission($invoice);

        $this->assertNotNull($commission);
        // Base 20% + Tier Bonus 5% = 25% on MVR 2,000 = MVR 500.00
        $this->assertEquals(25.00, $commission->effective_commission_pct);
        $this->assertEquals(500.00, $commission->commission_amount);
        $this->assertEquals('PENDING', $commission->status);

        // Verify affiliate pending balance incremented
        $affiliate->refresh();
        $this->assertEquals(500.00, $affiliate->pending_balance);
        $this->assertEquals(500.00, $affiliate->lifetime_earned);
    }

    public function test_maturity_transition_and_payout_request(): void
    {
        $code = 'MAT' . rand(100, 999);
        $affiliate = Affiliate::create([
            'name' => 'Matured Partner',
            'email' => 'matured' . rand(1000, 9999) . '@test.com',
            'referral_code' => $code,
            'payout_bank_name' => 'BML',
            'payout_account_number' => '7701111524001',
            'payout_account_name' => 'Matured Partner',
            'status' => 'active',
        ]);

        $tenant = Tenant::create(['name' => 'Tenant A ' . rand(100, 999), 'status' => 'approved']);
        $attr = ReferralAttribution::create([
            'affiliate_id' => $affiliate->id,
            'tenant_id' => $tenant->id,
            'applied_referral_code' => $code,
            'attributed_at' => Carbon::now(),
            'status' => 'active',
        ]);

        // Create commission that is already past grace period
        $commission = Commission::create([
            'affiliate_id' => $affiliate->id,
            'referral_attribution_id' => $attr->id,
            'tenant_id' => $tenant->id,
            'plan_key' => 'business',
            'invoice_amount' => 2000.00,
            'base_commission_pct' => 20.00,
            'tier_bonus_pct' => 0.00,
            'effective_commission_pct' => 20.00,
            'commission_amount' => 600.00,
            'month_index' => 1,
            'max_duration_months' => 12,
            'status' => 'PENDING',
            'available_at' => Carbon::now()->subDay(), // Ready for maturity
        ]);

        $affiliate->update(['pending_balance' => 600.00]);

        $engine = new ReferralCommissionEngine();
        $maturedCount = $engine->maturePendingCommissions();

        $this->assertEquals(1, $maturedCount);

        $commission->refresh();
        $this->assertEquals('AVAILABLE', $commission->status);

        $affiliate->refresh();
        $this->assertEquals(0.00, $affiliate->pending_balance);
        $this->assertEquals(600.00, $affiliate->available_balance);
    }

    public function test_standalone_affiliate_registration(): void
    {
        // 1. Verify public config endpoint returns program headline
        $configResponse = $this->getJson('/api/referrals/public-config');
        $configResponse->assertStatus(200);
        $configResponse->assertJsonStructure(['program_headline', 'customer_discount_enabled']);

        // 2. Register partner without bank details (frictionless sign-up)
        $email = 'standalone_partner' . rand(1000, 9999) . '@test.com';
        $customCode = 'STANDALONE' . rand(100, 999);
        $response = $this->postJson('/api/affiliate/register', [
            'name' => 'Standalone Partner',
            'email' => $email,
            'phone_number' => '7991234',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'custom_referral_code' => $customCode,
        ]);

        $response->assertStatus(201);
        $response->assertJsonStructure(['access_token', 'user', 'affiliate']);

        $token = $response->json('access_token');

        $this->assertDatabaseHas('users', [
            'email' => $email,
            'role' => 'affiliate',
        ]);

        $this->assertDatabaseHas('affiliates', [
            'email' => $email,
            'referral_code' => $customCode,
            'payout_bank_name' => null,
            'payout_account_number' => null,
        ]);

        // 3. Update bank payout details from inside partner dashboard
        $updateBankRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->putJson('/api/affiliate/bank-details', [
                'payout_bank_name' => 'BML',
                'payout_account_number' => '7701234567890',
                'payout_account_name' => 'Standalone Partner Bank Name',
            ]);

        $updateBankRes->assertStatus(200);

        $this->assertDatabaseHas('affiliates', [
            'email' => $email,
            'payout_bank_name' => 'BML',
            'payout_account_number' => '7701234567890',
            'payout_account_name' => 'Standalone Partner Bank Name',
        ]);
    }
}
