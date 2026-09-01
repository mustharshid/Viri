<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Add kyc_enabled = false to all subscription plans
        $plans = DB::table('subscription_plans')->get();
        foreach ($plans as $plan) {
            $features = json_decode($plan->features ?? '{}', true) ?: [];
            // Enable kyc on Pro (tier_key starting with 'pro') and Enterprise plans
            $tier = strtolower($plan->tier_key ?? '');
            $features['kyc_enabled'] = ($tier === 'pro' || $tier === 'enterprise');
            DB::table('subscription_plans')
                ->where('id', $plan->id)
                ->update(['features' => json_encode($features)]);
        }

        // Add kyc_enabled = false to all existing tenants (must be explicitly enabled per tenant by superadmin)
        $tenants = DB::table('tenants')->get();
        foreach ($tenants as $tenant) {
            $features = json_decode($tenant->features ?? '{}', true) ?: [];
            if (!array_key_exists('kyc_enabled', $features)) {
                $features['kyc_enabled'] = false;
                DB::table('tenants')
                    ->where('id', $tenant->id)
                    ->update(['features' => json_encode($features)]);
            }
        }
    }

    public function down(): void
    {
        // Remove kyc_enabled from all subscription plans
        $plans = DB::table('subscription_plans')->get();
        foreach ($plans as $plan) {
            $features = json_decode($plan->features ?? '{}', true) ?: [];
            unset($features['kyc_enabled']);
            DB::table('subscription_plans')
                ->where('id', $plan->id)
                ->update(['features' => json_encode($features)]);
        }

        // Remove kyc_enabled from all tenants
        $tenants = DB::table('tenants')->get();
        foreach ($tenants as $tenant) {
            $features = json_decode($tenant->features ?? '{}', true) ?: [];
            unset($features['kyc_enabled']);
            DB::table('tenants')
                ->where('id', $tenant->id)
                ->update(['features' => json_encode($features)]);
        }
    }
};
