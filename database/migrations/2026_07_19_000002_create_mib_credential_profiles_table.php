<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Creates the mib_credential_profiles table — one row per operating profile
     * (from A40/A41 operatingProfiles) under a credential group.
     * Structure: mib_credential_groups → mib_credential_profiles → bank_accounts
     */
    public function up(): void
    {
        Schema::create('mib_credential_profiles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('credential_group_id');
            $table->string('profile_id');                        // customerProfileId — used in P47 payload
            $table->string('profile_type', 4)->default('0');     // '0' = Individual, '1' = Sole Proprietor
            $table->string('profile_name')->nullable();          // display name from operatingProfiles
            $table->timestamps();

            $table->foreign('credential_group_id')
                  ->references('id')->on('mib_credential_groups')->onDelete('cascade');
            $table->unique(['credential_group_id', 'profile_id'], 'unique_mib_profile');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mib_credential_profiles');
    }
};
