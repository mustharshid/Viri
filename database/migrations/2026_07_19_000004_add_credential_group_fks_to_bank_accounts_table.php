<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Adds FK columns to bank_accounts to link each account to its credential group/profile.
     * - MIB accounts link through mib_credential_profile_id (profile → group)
     * - BML accounts link directly through bml_credential_group_id
     */
    public function up(): void
    {
        Schema::table('bank_accounts', function (Blueprint $table) {
            // MIB: links to a specific profile row (which implies the credential group)
            $table->unsignedBigInteger('mib_credential_profile_id')->nullable()->after('mib_profile_type');
            $table->foreign('mib_credential_profile_id')
                  ->references('id')->on('mib_credential_profiles')->onDelete('set null');

            // BML: links directly to the credential group (no profile sub-table needed)
            $table->unsignedBigInteger('bml_credential_group_id')->nullable()->after('bml_auth_state');
            $table->foreign('bml_credential_group_id')
                  ->references('id')->on('bml_credential_groups')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->dropForeign(['mib_credential_profile_id']);
            $table->dropColumn('mib_credential_profile_id');

            $table->dropForeign(['bml_credential_group_id']);
            $table->dropColumn('bml_credential_group_id');
        });
    }
};
