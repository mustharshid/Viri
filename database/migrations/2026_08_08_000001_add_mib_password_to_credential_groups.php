<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add a server-side encrypted MIB password so a terminal that loses its
     * local state can re-authenticate (A41/A40 WebView auth) without the
     * cashier re-entering credentials, and so new terminals can register the
     * same (tenant, mib_username) identity without prompting for a password.
     *
     * Additive only — existing rows keep NULL and existing behavior is unaffected.
     */
    public function up(): void
    {
        Schema::table('mib_credential_groups', function (Blueprint $table) {
            $table->text('mib_password')->nullable()->after('mib_username');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('mib_credential_groups', function (Blueprint $table) {
            $table->dropColumn('mib_password');
        });
    }
};