<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::table('system_settings')
            ->where('key', 'session_status_poll_interval')
            ->update(['value' => '12', 'updated_at' => now()]);

        DB::table('system_settings')
            ->where('key', 'credential_sync_poll_interval')
            ->update(['value' => '60', 'updated_at' => now()]);

        DB::table('system_settings')
            ->where('key', 'version_check_interval')
            ->update(['value' => '120', 'updated_at' => now()]);

        Cache::forget('viri_system_settings');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('system_settings')
            ->where('key', 'session_status_poll_interval')
            ->update(['value' => '6', 'updated_at' => now()]);

        DB::table('system_settings')
            ->where('key', 'credential_sync_poll_interval')
            ->update(['value' => '10', 'updated_at' => now()]);

        DB::table('system_settings')
            ->where('key', 'version_check_interval')
            ->update(['value' => '5', 'updated_at' => now()]);

        Cache::forget('viri_system_settings');
    }
};
