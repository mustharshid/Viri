<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('session_fetch_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('bank_account_id');
            $table->unsignedBigInteger('requesting_terminal_id');
            $table->enum('request_type', ['search', 'ledger', 'history']);
            $table->decimal('target_amount', 15, 2)->nullable();
            $table->enum('status', ['pending', 'fulfilled', 'failed', 'needs_retry', 'expired'])
                  ->default('pending');
            $table->json('result_json')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->foreign('bank_account_id')->references('id')->on('bank_accounts')->cascadeOnDelete();
            $table->foreign('requesting_terminal_id')->references('id')->on('terminals')->cascadeOnDelete();

            $table->index(['bank_account_id', 'status']);
            $table->index(['requesting_terminal_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('session_fetch_requests');
    }
};
