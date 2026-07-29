<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ledger_reports', function (Blueprint $table) {
            $table->string('report_type')->default('ledger_snapshot')->after('terminal_id');
        });
    }

    public function down(): void
    {
        Schema::table('ledger_reports', function (Blueprint $table) {
            $table->dropColumn('report_type');
        });
    }
};
