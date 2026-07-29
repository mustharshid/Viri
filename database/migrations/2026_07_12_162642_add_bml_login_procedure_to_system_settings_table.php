<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::table('system_settings')->insertOrIgnore([
            [
                'key' => 'bml_login_procedure',
                'value' => 'legacy',
                'type' => 'string',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
        Cache::forget('viri_system_settings');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('system_settings')->where('key', 'bml_login_procedure')->delete();
        Cache::forget('viri_system_settings');
    }
};
