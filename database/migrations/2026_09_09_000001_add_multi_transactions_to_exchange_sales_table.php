<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exchange_sales', function (Blueprint $table) {
            // Drop composite indexes first so column types can be widened without key length constraints
            $table->dropIndex(['tenant_id', 'received_transaction_id']);
            $table->dropIndex(['tenant_id', 'sent_transaction_id']);
            $table->dropIndex(['tenant_id', 'received_transaction_hash']);
            $table->dropIndex(['tenant_id', 'sent_transaction_hash']);
        });

        Schema::table('exchange_sales', function (Blueprint $table) {
            // Widen columns to text to accommodate multiple joined IDs/hashes without length overflow
            $table->text('received_transaction_id')->nullable()->change();
            $table->text('received_transaction_hash')->nullable()->change();
            $table->text('sent_transaction_id')->nullable()->change();
            $table->text('sent_transaction_hash')->nullable()->change();

            // Add JSON columns for structured multi-transaction objects
            $table->json('received_transactions')->nullable()->after('received_transaction_hash');
            $table->json('sent_transactions')->nullable()->after('sent_transaction_hash');
        });
    }

    public function down(): void
    {
        Schema::table('exchange_sales', function (Blueprint $table) {
            $table->dropColumn(['received_transactions', 'sent_transactions']);
            $table->string('received_transaction_id', 191)->nullable()->change();
            $table->string('received_transaction_hash', 191)->nullable()->change();
            $table->string('sent_transaction_id', 191)->nullable()->change();
            $table->string('sent_transaction_hash', 191)->nullable()->change();

            $table->index(['tenant_id', 'received_transaction_id']);
            $table->index(['tenant_id', 'sent_transaction_id']);
            $table->index(['tenant_id', 'received_transaction_hash']);
            $table->index(['tenant_id', 'sent_transaction_hash']);
        });
    }
};
