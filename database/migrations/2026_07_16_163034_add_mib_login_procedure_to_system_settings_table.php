<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        \Illuminate\Support\Facades\DB::table('system_settings')->insertOrIgnore([
            [
                'key' => 'mib_login_procedure',
                'value' => 'web_scraping',
                'type' => 'string',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        ]);
        \Illuminate\Support\Facades\Cache::forget('viri_system_settings');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        \Illuminate\Support\Facades\DB::table('system_settings')->where('key', 'mib_login_procedure')->delete();
        \Illuminate\Support\Facades\Cache::forget('viri_system_settings');
    }
};
