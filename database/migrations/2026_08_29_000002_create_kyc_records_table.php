<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kyc_records', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->unsignedBigInteger('terminal_id')->nullable();
            $table->foreign('terminal_id')->references('id')->on('terminals')->onDelete('set null');
            $table->unsignedBigInteger('cashier_user_id');
            $table->foreign('cashier_user_id')->references('id')->on('users')->onDelete('restrict');
            $table->unsignedBigInteger('kyc_customer_id');
            $table->foreign('kyc_customer_id')->references('id')->on('kyc_customers')->onDelete('restrict');

            // Transaction context
            $table->enum('transaction_type', ['money_changing', 'money_transfer']);
            $table->decimal('transaction_amount', 15, 2);
            $table->string('transaction_currency', 10)->default('MVR');
            $table->string('transaction_reference')->nullable();
            $table->text('transaction_purpose')->nullable();
            $table->enum('cdd_type', ['simplified', 'standard', 'enhanced'])->default('standard');

            // Representative acting on behalf of customer (§7(b))
            $table->string('rep_name')->nullable();
            $table->enum('rep_id_type', ['nic', 'passport'])->nullable();
            $table->string('rep_id_number')->nullable();
            $table->string('rep_authority_reference')->nullable();
            $table->boolean('is_not_physically_present')->default(false);

            // Wire Transfer specifics (money_transfer only, §7(d))
            $table->enum('transfer_direction', ['domestic', 'outbound', 'inbound'])->nullable();
            $table->string('originator_name')->nullable();
            $table->string('originator_id_number')->nullable();
            $table->string('originator_address')->nullable();
            $table->string('beneficiary_name')->nullable();
            $table->string('beneficiary_institution')->nullable();

            // Enhanced Due Diligence (§12)
            $table->enum('edd_status', ['not_required', 'pending_approval', 'approved'])->default('not_required');
            $table->text('edd_source_of_wealth')->nullable();
            $table->text('edd_source_of_funds')->nullable();
            $table->unsignedBigInteger('edd_approved_by')->nullable();
            $table->foreign('edd_approved_by')->references('id')->on('users')->onDelete('set null');
            $table->timestamp('edd_approved_at')->nullable();

            // Suspicious Transaction Report (§17)
            $table->boolean('is_suspicious')->default(false);
            $table->timestamp('str_flagged_at')->nullable();
            $table->unsignedBigInteger('str_flagged_by')->nullable();
            $table->foreign('str_flagged_by')->references('id')->on('users')->onDelete('set null');
            $table->text('str_notes')->nullable();
            $table->string('str_pdf_path')->nullable(); // local path on laptop
            $table->timestamp('str_submitted_at')->nullable();

            // Cash Transaction Report ≥ MVR 200,000 (§18-19)
            $table->boolean('requires_ctr')->default(false);
            $table->timestamp('ctr_submitted_at')->nullable();

            // Retention: auto-set by model boot to created_at + 5 years (§15)
            $table->timestamp('expires_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            // Performance indexes
            $table->index(['tenant_id', 'created_at']);
            $table->index(['tenant_id', 'is_suspicious']);
            $table->index(['tenant_id', 'edd_status']);
            $table->index(['tenant_id', 'requires_ctr']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kyc_records');
    }
};
