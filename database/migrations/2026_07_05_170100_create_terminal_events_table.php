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
        Schema::create('terminal_events', function (Blueprint $table) {
            $table->id();
            $table->string('hardware_id');
            $table->string('event_type');
            $table->json('payload')->nullable();
            $table->boolean('delivered')->default(false);
            $table->timestamps();

            $table->index(['hardware_id', 'delivered']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('terminal_events');
    }
};
