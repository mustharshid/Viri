<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('referral_system_configs', function (Blueprint $table) {
            if (!Schema::hasColumn('referral_system_configs', 'program_headline')) {
                $table->string('program_headline')->default('Earn 15% to 25% recurring monthly commissions.')->after('payout_mode');
            }
        });
    }

    public function down(): void
    {
        Schema::table('referral_system_configs', function (Blueprint $table) {
            if (Schema::hasColumn('referral_system_configs', 'program_headline')) {
                $table->dropColumn('program_headline');
            }
        });
    }
};
