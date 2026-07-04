<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('credential_sync_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('source_terminal_id');
            $table->unsignedBigInteger('target_terminal_id')->nullable();

            $table->enum('status', [
                'pending_export',  // Source terminal notified, awaiting upload
                'ready',           // Package uploaded, awaiting target selection
                'pending_import',  // Target notified, awaiting confirmation
                'completed',       // Import confirmed — all sensitive fields wiped
                'expired',         // TTL elapsed or manually cancelled
            ])->default('pending_export');

            // Sensitive fields — all wiped to NULL immediately on confirmImport
            $table->text('passphrase')->nullable();
            $table->text('encrypted_blob')->nullable();
            $table->text('wrapped_dek')->nullable();
            $table->string('kdf_salt', 64)->nullable();
            $table->string('gcm_iv', 32)->nullable();

            $table->timestamp('expires_at');
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->foreign('source_terminal_id')->references('id')->on('terminals')->cascadeOnDelete();
            $table->foreign('target_terminal_id')->references('id')->on('terminals')->nullOnDelete();

            $table->index(['source_terminal_id', 'status']);
            $table->index(['target_terminal_id', 'status']);
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credential_sync_requests');
    }
};
