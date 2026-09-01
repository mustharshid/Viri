<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exchange_sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('terminal_id')->nullable()->constrained('terminals')->nullOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained('counter_shifts')->nullOnDelete();
            $table->foreignId('kyc_customer_id')->nullable()->constrained('kyc_customers')->nullOnDelete();
            $table->foreignId('kyc_record_id')->nullable()->constrained('kyc_records')->nullOnDelete();

            $table->string('receipt_number', 50)->unique();
            $table->enum('sale_type', ['buy', 'sell'])->default('buy'); // Buy foreign currency vs Sell foreign currency
            $table->string('base_currency', 10); // e.g. USD
            $table->string('quote_currency', 10)->default('MVR'); // e.g. MVR
            $table->decimal('base_amount', 14, 2);
            $table->decimal('exchange_rate', 14, 4);
            $table->decimal('quote_amount', 14, 2);

            // Inflow: What was received from customer
            $table->enum('received_payment_type', ['cash', 'bank'])->default('bank');
            $table->foreignId('received_bank_account_id')->nullable()->constrained('bank_accounts')->nullOnDelete();
            $table->string('received_transaction_id', 191)->nullable();
            $table->string('received_transaction_hash', 191)->nullable();
            $table->decimal('received_amount', 14, 2);
            $table->string('received_currency', 10);

            // Outflow: What was sent/given to customer
            $table->enum('sent_payment_type', ['cash', 'bank'])->default('cash');
            $table->foreignId('sent_bank_account_id')->nullable()->constrained('bank_accounts')->nullOnDelete();
            $table->string('sent_transaction_id', 191)->nullable();
            $table->string('sent_transaction_hash', 191)->nullable();
            $table->decimal('sent_amount', 14, 2);
            $table->string('sent_currency', 10);

            $table->string('customer_name', 191)->nullable();
            $table->string('customer_id_number', 100)->nullable(); // NIC or Passport
            $table->text('notes')->nullable();
            $table->string('created_by_name', 100)->nullable();
            $table->enum('status', ['completed', 'voided'])->default('completed');
            $table->timestamp('voided_at')->nullable();
            $table->string('voided_by_name', 100)->nullable();
            $table->text('void_reason')->nullable();

            $table->timestamps();

            $table->index(['tenant_id', 'created_at']);
            $table->index(['tenant_id', 'received_transaction_id']);
            $table->index(['tenant_id', 'sent_transaction_id']);
            $table->index(['tenant_id', 'received_transaction_hash']);
            $table->index(['tenant_id', 'sent_transaction_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exchange_sales');
    }
};
