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
        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->timestamp('last_bank_fetch_at')->nullable()->after('session_last_heartbeat_at');
            $table->unsignedBigInteger('sync_version')->default(0)->after('last_bank_fetch_at');
            $table->unsignedBigInteger('sync_requested_version')->default(0)->after('sync_version');
            $table->timestamp('fetch_in_progress_until')->nullable()->after('sync_requested_version');
            $table->timestamp('fetch_started_at')->nullable()->after('fetch_in_progress_until');
            $table->unsignedBigInteger('fetch_started_by_terminal_id')->nullable()->after('fetch_started_at');
            $table->unsignedBigInteger('last_successful_fetch_terminal_id')->nullable()->after('fetch_started_by_terminal_id');

            $table->foreign('fetch_started_by_terminal_id')
                  ->references('id')
                  ->on('terminals')
                  ->nullOnDelete();

            $table->foreign('last_successful_fetch_terminal_id')
                  ->references('id')
                  ->on('terminals')
                  ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->dropForeign(['fetch_started_by_terminal_id']);
            $table->dropForeign(['last_successful_fetch_terminal_id']);

            $table->dropColumn([
                'last_bank_fetch_at',
                'sync_version',
                'sync_requested_version',
                'fetch_in_progress_until',
                'fetch_started_at',
                'fetch_started_by_terminal_id',
                'last_successful_fetch_terminal_id'
            ]);
        });
    }
};
