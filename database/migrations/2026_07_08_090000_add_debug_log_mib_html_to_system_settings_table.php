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
        DB::table('system_settings')->insert([
            [
                'key' => 'debug_log_mib_html',
                'value' => '0',
                'type' => 'boolean',
                'created_at' => now(),
                'updated_at' => now()
            ],
        ]);

        Cache::forget('viri_system_settings');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('system_settings')
            ->where('key', 'debug_log_mib_html')
            ->delete();

        Cache::forget('viri_system_settings');
    }
};
