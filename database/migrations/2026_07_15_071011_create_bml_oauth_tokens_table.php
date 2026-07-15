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
        Schema::create('bml_oauth_tokens', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('terminal_id');
            $table->unsignedBigInteger('bank_account_id');
            $table->string('bml_username');
            $table->enum('profile_type', ['personal', 'business']);
            $table->text('access_token');
            $table->text('refresh_token');
            $table->string('token_type', 20)->default('Bearer');
            $table->integer('expires_in')->default(0);
            $table->string('device_id', 64);
            $table->string('last_grant', 32)->default('authorization_code');
            $table->timestamp('obtained_at')->useCurrent();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->foreign('terminal_id')->references('id')->on('terminals')->onDelete('cascade');
            $table->foreign('bank_account_id')->references('id')->on('bank_accounts')->onDelete('cascade');
            $table->unique(['terminal_id', 'bml_username', 'profile_type'], 'unique_credential_set');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bml_oauth_tokens');
    }
};
