<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add admin-entered login usernames to bank accounts so the company admin
     * can (a) see which MIB/BML login an account belongs to (displayed masked
     * in the dashboard) and (b) link a sibling account to an existing
     * credential group at config time — avoiding a fresh C41/C42 registration
     * that surfaces the flaky "MIB transient: HTTP 500".
     *
     * Additive only — existing rows keep NULL and existing behavior is
     * unaffected (no backfill, no re-link).
     */
    public function up(): void
    {
        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->string('mib_username', 255)->nullable()->after('bml_auth_state');
            $table->string('bml_username', 255)->nullable()->after('mib_username');
            $table->index(['tenant_id', 'login_credentials_hash'], 'idx_bank_accounts_tenant_cred_hash');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->dropIndex('idx_bank_accounts_tenant_cred_hash');
            $table->dropColumn('mib_username');
            $table->dropColumn('bml_username');
        });
    }
};
