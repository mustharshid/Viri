<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('claimed_sales', function (Blueprint $table) {
            $table->unique(['tenant_id', 'transaction_id', 'status'], 'claimed_sales_unique_active');
            $table->timestamp('unclaimed_at')->nullable()->after('claimed_at');
            $table->index(['tenant_id', 'status', 'claimed_at'], 'claimed_sales_tenant_status_date');
        });
    }

    public function down(): void
    {
        Schema::table('claimed_sales', function (Blueprint $table) {
            $table->dropUnique('claimed_sales_unique_active');
            $table->dropColumn('unclaimed_at');
            $table->dropIndex('claimed_sales_tenant_status_date');
        });
    }
};
