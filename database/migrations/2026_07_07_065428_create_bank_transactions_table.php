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
        Schema::create('bank_transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('bank_account_id');
            $table->char('transaction_hash', 64);
            $table->string('amount');
            $table->date('transaction_date');
            $table->text('description')->nullable();
            $table->string('reference')->nullable();
            $table->timestamps();

            $table->unique(['bank_account_id', 'transaction_hash']);
            $table->index(['bank_account_id', 'transaction_date']);
            $table->foreign('bank_account_id')->references('id')->on('bank_accounts')->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bank_transactions');
    }
};
