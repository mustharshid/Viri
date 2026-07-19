<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Creates the mib_credential_groups table — one row per (terminal, MIB username).
     * Stores the sfunc=i device registration keys (key1, key2, app_id).
     */
    public function up(): void
    {
        Schema::create('mib_credential_groups', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('terminal_id');
            $table->string('mib_username');
            $table->text('key1');
            $table->text('key2');
            $table->string('app_id', 64);
            $table->timestamp('obtained_at')->useCurrent();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('terminal_id')->references('id')->on('terminals')->onDelete('cascade');
            // One device registration per MIB username per terminal
            $table->unique(['terminal_id', 'mib_username'], 'unique_mib_credential_group');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mib_credential_groups');
    }
};
