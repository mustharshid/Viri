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
        Schema::create('sync_execution_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('bank_account_id');
            $table->unsignedBigInteger('terminal_id');
            $table->unsignedBigInteger('request_id')->nullable();
            $table->timestamp('requested_at');
            $table->timestamp('holder_received_at')->nullable();
            $table->timestamp('bank_fetch_started_at')->nullable();
            $table->timestamp('bank_fetch_completed_at')->nullable();
            $table->timestamp('result_received_at')->nullable();
            $table->unsignedInteger('total_duration_ms')->nullable();
            $table->enum('status', ['success', 'failed', 'expired', 'cache_hit']);
            $table->string('failure_reason')->nullable();
            $table->timestamps();

            $table->index(['bank_account_id', 'created_at']);
            $table->index('status');

            $table->foreign('bank_account_id')->references('id')->on('bank_accounts')->cascadeOnDelete();
            $table->foreign('terminal_id')->references('id')->on('terminals')->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sync_execution_logs');
    }
};
