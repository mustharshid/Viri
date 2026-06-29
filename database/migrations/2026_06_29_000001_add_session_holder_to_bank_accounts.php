<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->unsignedBigInteger('session_holder_terminal_id')->nullable()->after('login_credentials_hash');
            $table->timestamp('session_claimed_at')->nullable()->after('session_holder_terminal_id');
            $table->timestamp('session_last_heartbeat_at')->nullable()->after('session_claimed_at');

            $table->foreign('session_holder_terminal_id')
                  ->references('id')
                  ->on('terminals')
                  ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->dropForeign(['session_holder_terminal_id']);
            $table->dropColumn([
                'session_holder_terminal_id',
                'session_claimed_at',
                'session_last_heartbeat_at',
            ]);
        });
    }
};
