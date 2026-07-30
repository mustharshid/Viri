<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('counter_shifts', function (Blueprint $table) {
            $table->dropUnique('counter_shifts_unique_terminal_shift');
        });

        Schema::table('counter_shifts', function (Blueprint $table) {
            $table->date('shift_date')->nullable()->after('shift_number');
        });

        DB::statement('UPDATE counter_shifts SET shift_date = DATE(opened_at)');

        Schema::table('counter_shifts', function (Blueprint $table) {
            $table->date('shift_date')->nullable(false)->change();
            $table->unique(['terminal_id', 'shift_date', 'shift_number'], 'counter_shifts_unique_terminal_date_shift');
        });
    }

    public function down(): void
    {
        Schema::table('counter_shifts', function (Blueprint $table) {
            $table->dropUnique('counter_shifts_unique_terminal_date_shift');
            $table->dropColumn('shift_date');
            $table->unique(['terminal_id', 'shift_number'], 'counter_shifts_unique_terminal_shift');
        });
    }
};
