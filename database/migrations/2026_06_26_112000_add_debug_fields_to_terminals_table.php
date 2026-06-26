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
        Schema::table('terminals', function (Blueprint $table) {
            $table->longText('debug_logs')->nullable();
            $table->timestamp('allow_debug_until')->nullable();
            $table->string('debug_one_time_code')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('terminals', function (Blueprint $table) {
            $table->dropColumn(['debug_logs', 'allow_debug_until', 'debug_one_time_code']);
        });
    }
};
