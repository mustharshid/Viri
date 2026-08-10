<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('session_activity_logs', function (Blueprint $table) {
            $table->index('created_at', 'session_logs_created_at_idx');
            $table->index(['event_type', 'created_at'], 'session_logs_event_type_created_at_idx');
            $table->index(['terminal_id', 'created_at'], 'session_logs_terminal_created_at_idx');
        });
    }

    public function down(): void
    {
        Schema::table('session_activity_logs', function (Blueprint $table) {
            $table->dropIndex('session_logs_created_at_idx');
            $table->dropIndex('session_logs_event_type_created_at_idx');
            $table->dropIndex('session_logs_terminal_created_at_idx');
        });
    }
};
