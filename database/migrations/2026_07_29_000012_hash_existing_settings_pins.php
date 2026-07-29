<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

return new class extends Migration
{
    public function up(): void
    {
        $records = DB::table('terminals')
            ->whereNotNull('settings_pin')
            ->where('settings_pin', 'not like', '$2y$%')
            ->get(['id', 'settings_pin']);

        foreach ($records as $record) {
            DB::table('terminals')
                ->where('id', $record->id)
                ->update(['settings_pin' => Hash::make($record->settings_pin)]);
        }
    }

    public function down(): void
    {
        // Cannot un-hash — this migration is irreversible for security reasons
    }
};
