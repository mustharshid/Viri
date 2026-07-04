<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->string('type')->default('string');
            $table->timestamps();
        });

        // Seed default configurations
        DB::table('system_settings')->insert([
            [
                'key' => 'session_status_poll_interval',
                'value' => '6',
                'type' => 'integer',
                'created_at' => now(),
                'updated_at' => now()
            ],
            [
                'key' => 'credential_sync_poll_interval',
                'value' => '10',
                'type' => 'integer',
                'created_at' => now(),
                'updated_at' => now()
            ],
            [
                'key' => 'version_check_interval',
                'value' => '5',
                'type' => 'integer',
                'created_at' => now(),
                'updated_at' => now()
            ],
            [
                'key' => 'active_session_heartbeat_interval',
                'value' => '5',
                'type' => 'integer',
                'created_at' => now(),
                'updated_at' => now()
            ]
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('system_settings');
    }
};
