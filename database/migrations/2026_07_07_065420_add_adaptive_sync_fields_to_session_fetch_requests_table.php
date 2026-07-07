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
        Schema::table('session_fetch_requests', function (Blueprint $table) {
            $table->timestamp('expires_at')->nullable()->after('status');
            $table->unsignedBigInteger('required_sync_version')->default(0)->after('expires_at');
            $table->timestamp('holder_received_at')->nullable()->after('result_json');
            $table->timestamp('bank_fetch_started_at')->nullable()->after('holder_received_at');
            $table->timestamp('bank_fetch_completed_at')->nullable()->after('bank_fetch_started_at');
            $table->timestamp('result_received_by_requester_at')->nullable()->after('bank_fetch_completed_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('session_fetch_requests', function (Blueprint $table) {
            $table->dropColumn([
                'expires_at',
                'required_sync_version',
                'holder_received_at',
                'bank_fetch_started_at',
                'bank_fetch_completed_at',
                'result_received_by_requester_at'
            ]);
        });
    }
};
