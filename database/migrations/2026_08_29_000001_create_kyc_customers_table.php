<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kyc_customers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');

            // Primary Identifiers (at least one required)
            $table->string('nic_number')->nullable()->index();
            $table->string('passport_number')->nullable()->index();

            // Personal Information
            $table->enum('customer_type', ['individual', 'legal_entity', 'partnership', 'government'])->default('individual');
            $table->string('full_name');
            $table->string('aliases')->nullable();
            $table->string('nationality');
            $table->date('dob')->nullable();
            $table->text('address');
            $table->string('contact_number');
            $table->string('email')->nullable();

            // Entity-specific fields
            $table->string('company_registration_number')->nullable();
            $table->string('beneficial_owner_name')->nullable();
            $table->enum('beneficial_owner_id_type', ['nic', 'passport'])->nullable();
            $table->string('beneficial_owner_id_number')->nullable();
            $table->string('beneficial_owner_nationality')->nullable();
            $table->json('directors_json')->nullable(); // [{name, nic, nationality}]

            // Risk Profile
            $table->boolean('is_pep')->default(false);
            $table->boolean('is_high_risk_country')->default(false);
            $table->enum('risk_level', ['low', 'standard', 'high'])->default('standard');

            // Document Scan (stored locally on cashier laptop; path recorded here)
            $table->string('id_document_local_path')->nullable();
            $table->timestamp('id_document_captured_at')->nullable();

            // Audit
            $table->unsignedBigInteger('created_by');
            $table->foreign('created_by')->references('id')->on('users')->onDelete('restrict');
            $table->unsignedBigInteger('last_updated_by')->nullable();
            $table->foreign('last_updated_by')->references('id')->on('users')->onDelete('set null');

            $table->timestamps();
            $table->softDeletes();

            // Composite index for fast tenant-scoped lookups
            $table->index(['tenant_id', 'nic_number']);
            $table->index(['tenant_id', 'passport_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kyc_customers');
    }
};
