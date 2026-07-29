<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('claimed_sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->onDelete('cascade');
            $table->foreignId('terminal_id')->constrained('terminals')->onDelete('cascade');
            $table->foreignId('shift_id')->nullable()->constrained('counter_shifts')->onDelete('set null');
            $table->foreignId('bank_account_id')->nullable()->constrained('bank_accounts')->onDelete('set null');
            $table->string('bank_type')->default('BML');
            $table->string('transaction_id');
            $table->timestamp('transaction_date')->nullable();
            $table->decimal('amount', 15, 2)->default(0.00);
            $table->string('currency', 10)->default('MVR');
            $table->string('payer_name')->nullable();
            $table->text('description')->nullable();
            $table->string('sale_reference')->nullable();
            $table->text('notes')->nullable();
            $table->string('claimed_by_name')->nullable();
            $table->timestamp('claimed_at')->useCurrent();
            $table->string('status')->default('claimed');
            $table->timestamps();

            $table->index(['tenant_id', 'transaction_id']);
            $table->index(['terminal_id', 'claimed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('claimed_sales');
    }
};
