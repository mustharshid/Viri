<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('claimed_sales', function (Blueprint $table) {
            $table->string('account_number')->nullable()->after('bank_account_id');
            $table->string('blaz_number')->nullable()->after('transaction_id');
            $table->string('reference_number')->nullable()->after('blaz_number');
        });
    }

    public function down(): void
    {
        Schema::table('claimed_sales', function (Blueprint $table) {
            $table->dropColumn(['account_number', 'blaz_number', 'reference_number']);
        });
    }
};
