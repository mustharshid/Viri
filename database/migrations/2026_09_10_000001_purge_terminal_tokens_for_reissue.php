<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Purge orphaned/undelivered terminal Sanctum tokens so the existing
     * verify-terminal bootstrap (mint when count === 0) re-issues a plain-text
     * token on each terminal's next poll. Fixes the persistent 401 on
     * POST /mib/keys/store for terminals paired before the terminal-token
     * feature (their hashed token row is otherwise irreversible).
     *
     * Only tokenable_type = Terminal is affected — User/admin tokens untouched.
     */
    public function up(): void
    {
        DB::table('personal_access_tokens')
            ->where('tokenable_type', \App\Models\Terminal::class)
            ->delete();
    }

    public function down(): void
    {
        // Irreversible data purge — no-op. Tokens are re-issued automatically.
    }
};
