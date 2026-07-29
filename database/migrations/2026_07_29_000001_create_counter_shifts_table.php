<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('counter_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->onDelete('cascade');
            $table->foreignId('terminal_id')->constrained('terminals')->onDelete('cascade');
            $table->integer('shift_number')->default(1);
            $table->timestamp('opened_at')->useCurrent();
            $table->timestamp('closed_at')->nullable();
            $table->string('opened_by')->nullable();
            $table->string('closed_by')->nullable();
            $table->decimal('total_claimed_amount_mvr', 15, 2)->default(0.00);
            $table->decimal('total_claimed_amount_usd', 15, 2)->default(0.00);
            $table->integer('total_claimed_count')->default(0);
            $table->text('notes')->nullable();
            $table->string('status')->default('open');
            $table->timestamps();

            $table->index(['terminal_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('counter_shifts');
    }
};
