<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // 1. Central Referral System Configuration
        Schema::create('referral_system_configs', function (Blueprint $table) {
            $table->id();
            $table->enum('payout_mode', ['manual_request', 'automated_batch'])->default('manual_request');
            $table->decimal('min_payout_threshold', 10, 2)->default(500.00);
            $table->unsignedTinyInteger('auto_payout_day_of_month')->default(1);
            
            // Dual-Sided Incentive (New Customer Discount on 1st Invoice)
            $table->boolean('customer_discount_enabled')->default(true);
            $table->enum('customer_discount_type', ['percentage', 'fixed_amount'])->default('percentage');
            $table->decimal('customer_discount_value', 10, 2)->default(10.00);
            
            // Package Commission Rules per subscription plan
            $table->json('package_commission_rules')->nullable();
            
            // Commission Grace Period (in days) before PENDING -> AVAILABLE
            $table->unsignedSmallInteger('commission_grace_period_days')->default(14);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // 2. Volume-Based Performance Tiers
        Schema::create('referral_performance_tiers', function (Blueprint $table) {
            $table->id();
            $table->string('name'); // e.g. Bronze, Silver, Gold, Platinum
            $table->unsignedInteger('min_monthly_sales')->default(0);
            $table->decimal('bonus_commission_pct', 5, 2)->default(0.00);
            $table->string('badge_color')->default('#10B981');
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        // 3. Affiliates
        Schema::create('affiliates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('phone')->nullable();
            
            $table->string('referral_code', 32)->unique();
            $table->string('custom_coupon_code', 32)->nullable()->unique();
            
            $table->foreignId('current_tier_id')->nullable()->constrained('referral_performance_tiers')->nullOnDelete();
            $table->unsignedInteger('rolling_monthly_sales')->default(0);
            
            // Payout details
            $table->string('payout_bank_name')->nullable();
            $table->string('payout_account_number')->nullable();
            $table->string('payout_account_name')->nullable();
            
            // Atomic Balances Cache
            $table->decimal('lifetime_earned', 12, 2)->default(0.00);
            $table->decimal('pending_balance', 12, 2)->default(0.00);
            $table->decimal('available_balance', 12, 2)->default(0.00);
            $table->decimal('paid_balance', 12, 2)->default(0.00);
            
            $table->enum('status', ['active', 'suspended', 'pending_approval'])->default('active');
            $table->timestamps();
        });

        // 4. Referral Attributions (1-to-1 Customer to Affiliate link)
        Schema::create('referral_attributions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('affiliate_id')->constrained('affiliates')->cascadeOnDelete();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            
            $table->string('applied_referral_code', 32);
            $table->enum('discount_type', ['percentage', 'fixed_amount'])->default('percentage');
            $table->decimal('discount_value', 10, 2)->default(0.00);
            $table->decimal('first_invoice_discount_amount', 10, 2)->default(0.00);
            
            $table->string('initial_plan_key')->nullable();
            $table->unsignedSmallInteger('payout_duration_limit_months')->default(12);
            $table->unsignedSmallInteger('invoices_commissioned_count')->default(0);
            
            $table->timestamp('attributed_at');
            $table->timestamp('expires_at')->nullable();
            $table->enum('status', ['active', 'expired', 'churned', 'completed'])->default('active');
            $table->timestamps();

            $table->unique(['tenant_id']);
        });

        // 5. Payout Batches
        Schema::create('payout_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('affiliate_id')->constrained('affiliates')->cascadeOnDelete();
            $table->string('batch_reference', 64)->unique();
            $table->decimal('amount', 10, 2);
            $table->enum('payout_type', ['manual_request', 'automated_batch'])->default('manual_request');
            $table->string('bank_name');
            $table->string('account_number');
            $table->string('account_name');
            
            $table->enum('status', ['REQUESTED', 'PROCESSING', 'PAID', 'REJECTED'])->default('REQUESTED');
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('processed_at')->nullable();
            $table->string('transaction_receipt_ref')->nullable();
            $table->text('admin_notes')->nullable();
            $table->timestamps();
        });

        // 6. Commissions Ledger
        Schema::create('commissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('affiliate_id')->constrained('affiliates')->cascadeOnDelete();
            $table->foreignId('referral_attribution_id')->constrained('referral_attributions')->cascadeOnDelete();
            $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            
            // Dynamic calculation details
            $table->string('plan_key');
            $table->decimal('invoice_amount', 10, 2);
            $table->decimal('base_commission_pct', 5, 2);
            $table->decimal('tier_bonus_pct', 5, 2)->default(0.00);
            $table->decimal('effective_commission_pct', 5, 2);
            $table->decimal('commission_amount', 10, 2);
            
            $table->unsignedSmallInteger('month_index');
            $table->unsignedSmallInteger('max_duration_months');
            
            $table->enum('status', ['PENDING', 'AVAILABLE', 'PAID', 'VOIDED'])->default('PENDING');
            $table->timestamp('available_at');
            $table->timestamp('paid_at')->nullable();
            $table->foreignId('payout_batch_id')->nullable()->constrained('payout_batches')->nullOnDelete();
            
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commissions');
        Schema::dropIfExists('payout_batches');
        Schema::dropIfExists('referral_attributions');
        Schema::dropIfExists('affiliates');
        Schema::dropIfExists('referral_performance_tiers');
        Schema::dropIfExists('referral_system_configs');
    }
};
