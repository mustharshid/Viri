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
        Schema::create('bank_account_caches', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('bank_account_id')->unique();
            $table->string('balance')->nullable();
            $table->json('transactions')->nullable();
            $table->timestamp('cached_at')->nullable();
            $table->unsignedBigInteger('cached_by_terminal_id')->nullable();
            $table->unsignedBigInteger('cache_version')->default(0);
            $table->timestamps();

            $table->foreign('bank_account_id')
                ->references('id')
                ->on('bank_accounts')
                ->onDelete('cascade');

            $table->foreign('cached_by_terminal_id')
                ->references('id')
                ->on('terminals')
                ->onDelete('set null');

            $table->index(['tenant_id', 'bank_account_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bank_account_caches');
    }
};
