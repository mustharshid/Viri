<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Re-key credential group uniqueness from (terminal_id, username) to (tenant_id, username).
     *
     * This ensures that the same credentials used across multiple terminals always resolve
     * to a single group/token rather than creating per-terminal duplicates.
     *
     * terminal_id is kept on both tables as a tracked value (last terminal to register/refresh)
     * but is no longer part of the unique constraint.
     *
     * Steps:
     *  1. De-duplicate mib_credential_groups by (tenant_id, mib_username)
     *  2. Swap the unique index on mib_credential_groups
     *  3. De-duplicate bml_credential_groups by (tenant_id, bml_username, profile_type)
     *  4. Swap the unique index on bml_credential_groups
     */
    public function up(): void
    {
        // -----------------------------------------------------------------------
        // 1. De-duplicate mib_credential_groups
        // -----------------------------------------------------------------------
        // Find any (tenant_id, mib_username) pair that has more than one row.
        // For each such pair, keep the most recently updated row (the freshest keys).
        // Re-point mib_credential_profiles that belong to the losing groups onto
        // the winning group, then delete the losers.
        // -----------------------------------------------------------------------

        $mibDuplicatePairs = DB::table('mib_credential_groups')
            ->select('tenant_id', 'mib_username')
            ->groupBy('tenant_id', 'mib_username')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($mibDuplicatePairs as $pair) {
            // All groups for this pair, newest first
            $groups = DB::table('mib_credential_groups')
                ->where('tenant_id', $pair->tenant_id)
                ->where('mib_username', $pair->mib_username)
                ->orderByDesc('updated_at')
                ->get();

            $winner = $groups->first();
            $loserIds = $groups->skip(1)->pluck('id')->all();

            if (empty($loserIds)) {
                continue;
            }

            // Re-point profiles from losers → winner
            DB::table('mib_credential_profiles')
                ->whereIn('credential_group_id', $loserIds)
                ->update(['credential_group_id' => $winner->id]);

            // Delete loser groups
            DB::table('mib_credential_groups')
                ->whereIn('id', $loserIds)
                ->delete();
        }

        // MySQL treats the unique index (terminal_id, mib_username) as the backing index for the
        // terminal_id FK, so we must drop the FK before we can drop the index.
        // Strategy: drop FK → drop old index → restore FK (the new tenant index provides coverage).
        Schema::table('mib_credential_groups', function (Blueprint $table) {
            // Create the new tenant-scoped index if not already present (idempotent).
            if (!collect(DB::select('SHOW INDEX FROM mib_credential_groups'))->pluck('Key_name')->contains('unique_mib_credential_group_tenant')) {
                $table->unique(['tenant_id', 'mib_username'], 'unique_mib_credential_group_tenant');
            }
        });
        Schema::table('mib_credential_groups', function (Blueprint $table) {
            $table->dropForeign('mib_credential_groups_terminal_id_foreign');
            $table->dropUnique('unique_mib_credential_group'); // was (terminal_id, mib_username)
            // Restore the terminal_id FK (terminal_id column is kept as a tracked value)
            $table->foreign('terminal_id')->references('id')->on('terminals')->onDelete('cascade');
        });

        // -----------------------------------------------------------------------
        // 3. De-duplicate bml_credential_groups
        // -----------------------------------------------------------------------
        // Same approach: keep newest row per (tenant_id, bml_username, profile_type),
        // re-point bank_accounts.bml_credential_group_id references, delete losers.
        // -----------------------------------------------------------------------

        $bmlDuplicatePairs = DB::table('bml_credential_groups')
            ->select('tenant_id', 'bml_username', 'profile_type')
            ->groupBy('tenant_id', 'bml_username', 'profile_type')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($bmlDuplicatePairs as $pair) {
            $groups = DB::table('bml_credential_groups')
                ->where('tenant_id', $pair->tenant_id)
                ->where('bml_username', $pair->bml_username)
                ->where('profile_type', $pair->profile_type)
                ->orderByDesc('updated_at')
                ->get();

            $winner = $groups->first();
            $loserIds = $groups->skip(1)->pluck('id')->all();

            if (empty($loserIds)) {
                continue;
            }

            // Re-point bank accounts from losers → winner
            DB::table('bank_accounts')
                ->whereIn('bml_credential_group_id', $loserIds)
                ->update(['bml_credential_group_id' => $winner->id]);

            // Delete loser groups
            DB::table('bml_credential_groups')
                ->whereIn('id', $loserIds)
                ->delete();
        }

        // Same pattern for BML: drop FK → drop old index → restore FK.
        Schema::table('bml_credential_groups', function (Blueprint $table) {
            if (!collect(DB::select('SHOW INDEX FROM bml_credential_groups'))->pluck('Key_name')->contains('unique_bml_credential_group_tenant')) {
                $table->unique(['tenant_id', 'bml_username', 'profile_type'], 'unique_bml_credential_group_tenant');
            }
        });
        Schema::table('bml_credential_groups', function (Blueprint $table) {
            $table->dropForeign('bml_credential_groups_terminal_id_foreign');
            $table->dropUnique('unique_bml_credential_group'); // was (terminal_id, bml_username, profile_type)
            $table->foreign('terminal_id')->references('id')->on('terminals')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migration.
     *
     * Note: data de-duplication performed in up() is NOT reversed — deleted rows
     * cannot be restored without a database backup. Only the unique index definitions
     * are restored here.
     */
    public function down(): void
    {
        // Restore terminal-scoped index on mib_credential_groups
        Schema::table('mib_credential_groups', function (Blueprint $table) {
            if (!collect(DB::select('SHOW INDEX FROM mib_credential_groups'))->pluck('Key_name')->contains('unique_mib_credential_group')) {
                $table->unique(['terminal_id', 'mib_username'], 'unique_mib_credential_group');
            }
        });
        Schema::table('mib_credential_groups', function (Blueprint $table) {
            $table->dropForeign('mib_credential_groups_terminal_id_foreign');
            $table->dropUnique('unique_mib_credential_group_tenant');
            $table->foreign('terminal_id')->references('id')->on('terminals')->onDelete('cascade');
        });

        // Restore terminal-scoped index on bml_credential_groups
        Schema::table('bml_credential_groups', function (Blueprint $table) {
            if (!collect(DB::select('SHOW INDEX FROM bml_credential_groups'))->pluck('Key_name')->contains('unique_bml_credential_group')) {
                $table->unique(['terminal_id', 'bml_username', 'profile_type'], 'unique_bml_credential_group');
            }
        });
        Schema::table('bml_credential_groups', function (Blueprint $table) {
            $table->dropForeign('bml_credential_groups_terminal_id_foreign');
            $table->dropUnique('unique_bml_credential_group_tenant');
            $table->foreign('terminal_id')->references('id')->on('terminals')->onDelete('cascade');
        });
    }
};
