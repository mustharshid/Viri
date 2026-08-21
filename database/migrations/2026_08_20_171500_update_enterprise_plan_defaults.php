<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('subscription_plans')
            ->where('tier_key', '1999')
            ->update([
                'name' => 'Enterprise',
                'max_terminals' => 6,
                'max_bank_accounts' => 10,
            ]);

        DB::table('tenants')
            ->where('subscription_tier', '1999')
            ->where('max_terminals', '<', 6)
            ->update(['max_terminals' => 6]);
    }

    public function down(): void
    {
        DB::table('subscription_plans')
            ->where('tier_key', '1999')
            ->update([
                'name' => '1999 Plan',
                'max_terminals' => 2,
                'max_bank_accounts' => 10,
            ]);
    }
};
