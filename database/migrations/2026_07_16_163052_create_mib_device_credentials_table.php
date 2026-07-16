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
        Schema::create('mib_device_credentials', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('terminal_id');
            $table->unsignedBigInteger('bank_account_id');
            $table->string('mib_username');
            $table->text('key1');
            $table->text('key2');
            $table->string('app_id', 64);
            $table->timestamp('obtained_at')->useCurrent();
            $table->timestamps();

            $table->foreign('terminal_id')->references('id')->on('terminals')->onDelete('cascade');
            $table->foreign('bank_account_id')->references('id')->on('bank_accounts')->onDelete('cascade');
            $table->unique(['terminal_id', 'bank_account_id', 'mib_username'], 'unique_mib_credential_set');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mib_device_credentials');
    }
};
