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
        Schema::create('terminal_account_activity', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('terminal_id');
            $table->unsignedBigInteger('bank_account_id');
            $table->timestamps();

            $table->unique(['terminal_id', 'bank_account_id']);
            $table->index(['bank_account_id', 'updated_at']);
            $table->index(['terminal_id', 'updated_at']);
            $table->index('updated_at');

            $table->foreign('terminal_id')->references('id')->on('terminals')->cascadeOnDelete();
            $table->foreign('bank_account_id')->references('id')->on('bank_accounts')->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('terminal_account_activity');
    }
};
