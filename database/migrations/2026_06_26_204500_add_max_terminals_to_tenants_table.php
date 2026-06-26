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
            $table->integer('max_terminals')->default(1)->after('verifications_count');
        });

        // Update any existing enterprise accounts to baseline limit of 2 terminals
        DB::table('tenants')->where('subscription_tier', '1999')->update(['max_terminals' => 2]);
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn('max_terminals');
        });
    }
};
