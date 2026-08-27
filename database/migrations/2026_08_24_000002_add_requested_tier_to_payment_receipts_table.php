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
        if (! Schema::hasColumn('payment_receipts', 'requested_tier')) {
            Schema::table('payment_receipts', function (Blueprint $table) {
                $table->string('requested_tier')->nullable()->after('status')
                    ->comment('The subscription tier requested by the company (e.g. starter, 349, pro, 899, 999, enterprise, 1999).');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('payment_receipts', 'requested_tier')) {
            Schema::table('payment_receipts', function (Blueprint $table) {
                $table->dropColumn('requested_tier');
            });
        }
    }
};
