<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('terminals', 'settings_pin')) {
            Schema::table('terminals', function (Blueprint $table) {
                $table->string('settings_pin', 10)->nullable()->after('pairing_code_expires_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('terminals', 'settings_pin')) {
            Schema::table('terminals', function (Blueprint $table) {
                $table->dropColumn('settings_pin');
            });
        }
    }
};
