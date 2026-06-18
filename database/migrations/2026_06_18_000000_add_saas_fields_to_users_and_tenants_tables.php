<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
            $table->string('role')->default('company_admin')->after('tenant_id'); // superadmin, company_admin
            $table->string('status')->default('pending')->after('role'); // pending, approved, suspended
            
            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
        });

        Schema::table('tenants', function (Blueprint $table) {
            $table->string('subscription_tier')->default('free')->after('status'); // free, 499, 999, 1999
            $table->integer('verifications_count')->default(0)->after('subscription_tier');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['tenant_id']);
            $table->dropColumn(['tenant_id', 'role', 'status']);
        });

        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['subscription_tier', 'verifications_count']);
        });
    }
};
