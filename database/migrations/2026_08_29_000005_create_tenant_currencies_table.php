<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_currencies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('code', 10); // e.g. USD, MVR, EUR, GBP
            $table->string('name', 50); // e.g. US Dollar, Maldivian Rufiyaa
            $table->string('symbol', 10)->default('$'); // e.g. $, Rf, €
            $table->decimal('buy_rate', 14, 4)->nullable(); // Reference buy rate
            $table->decimal('sell_rate', 14, 4)->nullable(); // Reference sell rate
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
        });

        // Seed default USD and MVR currencies for existing tenants
        $tenants = DB::table('tenants')->pluck('id');
        foreach ($tenants as $tenantId) {
            DB::table('tenant_currencies')->insert([
                [
                    'tenant_id' => $tenantId,
                    'code' => 'USD',
                    'name' => 'US Dollar',
                    'symbol' => '$',
                    'buy_rate' => 15.42,
                    'sell_rate' => 17.50,
                    'is_active' => true,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'tenant_id' => $tenantId,
                    'code' => 'MVR',
                    'name' => 'Maldivian Rufiyaa',
                    'symbol' => 'Rf',
                    'buy_rate' => 1.00,
                    'sell_rate' => 1.00,
                    'is_active' => true,
                    'is_default' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_currencies');
    }
};
