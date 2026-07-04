<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->integer('max_bank_accounts')->default(1)->after('max_terminals');
        });

        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->integer('max_bank_accounts')->default(1)->after('max_terminals');
        });

        // Set default limits for existing plans
        DB::table('subscription_plans')->where('tier_key', 'free')->update(['max_bank_accounts' => 1]);
        DB::table('subscription_plans')->where('tier_key', '499')->update(['max_bank_accounts' => 2]);
        DB::table('subscription_plans')->where('tier_key', '999')->update(['max_bank_accounts' => 5]);
        DB::table('subscription_plans')->where('tier_key', '1999')->update(['max_bank_accounts' => 10]);

        // Sync tenant limits with plan defaults
        DB::table('tenants')->where('subscription_tier', 'free')->update(['max_bank_accounts' => 1]);
        DB::table('tenants')->where('subscription_tier', '499')->update(['max_bank_accounts' => 2]);
        DB::table('tenants')->where('subscription_tier', '999')->update(['max_bank_accounts' => 5]);
        DB::table('tenants')->where('subscription_tier', '1999')->update(['max_bank_accounts' => 10]);
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn('max_bank_accounts');
        });

        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn('max_bank_accounts');
        });
    }
};
