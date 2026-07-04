<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add features JSON column to tenants table
        Schema::table('tenants', function (Blueprint $table) {
            $table->json('features')->nullable()->after('subscription_tier');
        });

        // 2. Create subscription_plans table
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id();
            $table->string('tier_key')->unique(); // free, 499, 999, 1999
            $table->string('name');
            $table->decimal('price', 8, 2)->default(0.00);
            $table->integer('max_terminals')->default(1);
            $table->integer('lock_timeout')->default(20);
            $table->json('features')->nullable();
            $table->timestamps();
        });

        // 3. Populate default subscription tiers
        DB::table('subscription_plans')->insert([
            [
                'tier_key' => 'free',
                'name' => 'Free Plan',
                'price' => 0.00,
                'max_terminals' => 1,
                'lock_timeout' => 20,
                'features' => json_encode([
                    'verification_enabled' => true,
                    'ledger_enabled' => false,
                    'ledger_show_balance' => false,
                    'ledger_show_debit' => false,
                    'reports_enabled' => false
                ]),
                'created_at' => now(),
                'updated_at' => now()
            ],
            [
                'tier_key' => '499',
                'name' => '499 Plan',
                'price' => 499.00,
                'max_terminals' => 1,
                'lock_timeout' => 20,
                'features' => json_encode([
                    'verification_enabled' => true,
                    'ledger_enabled' => false,
                    'ledger_show_balance' => false,
                    'ledger_show_debit' => false,
                    'reports_enabled' => false
                ]),
                'created_at' => now(),
                'updated_at' => now()
            ],
            [
                'tier_key' => '999',
                'name' => '999 Plan',
                'price' => 999.00,
                'max_terminals' => 1,
                'lock_timeout' => 20,
                'features' => json_encode([
                    'verification_enabled' => true,
                    'ledger_enabled' => true,
                    'ledger_show_balance' => true,
                    'ledger_show_debit' => true,
                    'reports_enabled' => false
                ]),
                'created_at' => now(),
                'updated_at' => now()
            ],
            [
                'tier_key' => '1999',
                'name' => '1999 Plan',
                'price' => 1999.00,
                'max_terminals' => 2,
                'lock_timeout' => 20,
                'features' => json_encode([
                    'verification_enabled' => true,
                    'ledger_enabled' => true,
                    'ledger_show_balance' => true,
                    'ledger_show_debit' => true,
                    'reports_enabled' => true
                ]),
                'created_at' => now(),
                'updated_at' => now()
            ]
        ]);

        // 4. Update existing tenants to populate default features
        $tenants = DB::table('tenants')->get();
        foreach ($tenants as $tenant) {
            $plan = DB::table('subscription_plans')->where('tier_key', $tenant->subscription_tier)->first();
            if ($plan) {
                DB::table('tenants')->where('id', $tenant->id)->update([
                    'features' => $plan->features,
                    'max_terminals' => $tenant->max_terminals ?? $plan->max_terminals,
                    'lock_timeout' => $tenant->lock_timeout ?? $plan->lock_timeout
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_plans');
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn('features');
        });
    }
};
