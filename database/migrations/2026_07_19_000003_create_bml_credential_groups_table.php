<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Creates the bml_credential_groups table — one row per (terminal, BML username, profile_type).
     * Stores the OAuth tokens from BML's authorization flow.
     */
    public function up(): void
    {
        Schema::create('bml_credential_groups', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('terminal_id');
            $table->string('bml_username');
            $table->enum('profile_type', ['personal', 'business'])->default('personal');
            $table->text('access_token');
            $table->text('refresh_token');
            $table->string('device_id', 64);
            $table->integer('expires_in')->default(0);
            $table->string('token_type', 20)->default('Bearer');
            $table->string('last_grant', 32)->default('authorization_code');
            $table->timestamp('obtained_at')->useCurrent();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('terminal_id')->references('id')->on('terminals')->onDelete('cascade');
            // One OAuth token per BML username + profile type per terminal
            $table->unique(['terminal_id', 'bml_username', 'profile_type'], 'unique_bml_credential_group');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bml_credential_groups');
    }
};
