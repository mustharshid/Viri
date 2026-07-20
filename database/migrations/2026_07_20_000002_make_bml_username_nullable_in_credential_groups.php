<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Make bml_credential_groups.bml_username nullable.
     *
     * When the cashier hasn't yet typed credentials for a newly added account,
     * the extension sends bml_username='' (empty string). Under the tenant-scoped
     * unique key (tenant_id, bml_username, profile_type), empty strings are treated
     * as equal — causing all no-username accounts with the same profile_type to
     * incorrectly share one group row and potentially clobber each other's tokens.
     *
     * Switching the sentinel from '' to NULL fixes this: MySQL unique indexes treat
     * each NULL as distinct, so standalone (username-unknown) groups never collide.
     *
     * Existing empty-string rows are converted to NULL as part of this migration.
     */
    public function up(): void
    {
        // Make the column nullable first, then convert existing '' rows to NULL.
        // (Cannot write NULL to a NOT NULL column before altering it.)
        Schema::table('bml_credential_groups', function (Blueprint $table) {
            $table->string('bml_username')->nullable()->change();
        });

        // Convert existing '' sentinel rows to NULL.
        DB::table('bml_credential_groups')
            ->where('bml_username', '')
            ->update(['bml_username' => null]);
    }

    /**
     * Reverse the migration.
     * Converts NULL rows back to '' and restores the NOT NULL constraint.
     */
    public function down(): void
    {
        DB::table('bml_credential_groups')
            ->whereNull('bml_username')
            ->update(['bml_username' => '']);

        Schema::table('bml_credential_groups', function (Blueprint $table) {
            $table->string('bml_username')->nullable(false)->change();
        });
    }
};
