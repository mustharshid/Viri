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
        Schema::table('terminals', function (Blueprint $table) {
            $table->string('pairing_code')->nullable()->index()->after('hardware_id');
            $table->timestamp('pairing_code_expires_at')->nullable()->after('pairing_code');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('terminals', function (Blueprint $table) {
            $table->dropColumn(['pairing_code', 'pairing_code_expires_at']);
        });
    }
};
