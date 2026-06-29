<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('session_activity_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('terminal_id')->nullable();
            $table->string('terminal_name')->nullable();
            $table->unsignedBigInteger('bank_account_id')->nullable();
            $table->string('bank_name', 50)->nullable();
            $table->string('account_number_masked', 50)->nullable();
            $table->string('event_type', 100);
            $table->text('event_summary');
            $table->json('event_detail')->nullable();
            $table->string('masked_username')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('session_holder_snapshot')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->foreign('terminal_id')->references('id')->on('terminals')->nullOnDelete();
            $table->foreign('bank_account_id')->references('id')->on('bank_accounts')->nullOnDelete();

            $table->index(['tenant_id', 'created_at']);
            $table->index(['terminal_id', 'event_type']);
            $table->index(['bank_account_id', 'event_type']);
            $table->index('event_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('session_activity_logs');
    }
};
