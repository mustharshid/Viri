<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('subscription_plans', 'max_transaction_checks')) {
            Schema::table('subscription_plans', function (Blueprint $table) {
                $table->integer('max_transaction_checks')->default(0)->after('max_bank_accounts')
                    ->comment('Max allowed transaction checks (View History, Verify Transfer, Sync History) per month. 0 = Unlimited.');
            });
        }

        // Set baseline defaults for existing subscription tier plans
        DB::table('subscription_plans')->where('tier_key', 'free')->update(['max_transaction_checks' => 20]);
        DB::table('subscription_plans')->where('tier_key', '499')->update(['max_transaction_checks' => 300]);
        DB::table('subscription_plans')->where('tier_key', '999')->update(['max_transaction_checks' => 0]);
        DB::table('subscription_plans')->where('tier_key', '1999')->update(['max_transaction_checks' => 0]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('subscription_plans', 'max_transaction_checks')) {
            Schema::table('subscription_plans', function (Blueprint $table) {
                $table->dropColumn('max_transaction_checks');
            });
        }
    }
};
