<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('counter_shifts', function (Blueprint $table) {
            $table->unique(['terminal_id', 'shift_number'], 'counter_shifts_unique_terminal_shift');
        });
    }

    public function down(): void
    {
        Schema::table('counter_shifts', function (Blueprint $table) {
            $table->dropUnique('counter_shifts_unique_terminal_shift');
        });
    }
};
