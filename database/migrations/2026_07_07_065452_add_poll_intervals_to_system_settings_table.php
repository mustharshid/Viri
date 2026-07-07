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
                'key' => 'poll_interval_holder',
                'value' => '1',
                'type' => 'integer',
                'created_at' => now(),
                'updated_at' => now()
            ],
            [
                'key' => 'poll_interval_requesting',
                'value' => '1',
                'type' => 'integer',
                'created_at' => now(),
                'updated_at' => now()
            ],
            [
                'key' => 'poll_interval_idle',
                'value' => '15',
                'type' => 'integer',
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
            ->whereIn('key', ['poll_interval_holder', 'poll_interval_requesting', 'poll_interval_idle'])
            ->delete();

        Cache::forget('viri_system_settings');
    }
};
