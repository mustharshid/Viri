<?php

namespace App\Console\Commands;

use App\Models\ReferralSystemConfig;
use App\Services\ReferralCommissionEngine;
use Illuminate\Console\Command;

class ProcessReferralCommissionsCommand extends Command
{
    protected $signature = 'referrals:process {--force-payouts : Force automated payout batch generation regardless of day of month}';
    protected $description = 'Mature pending commissions, evaluate performance tiers, and process automated payout batches.';

    public function handle(ReferralCommissionEngine $engine): int
    {
        $this->info('Starting Referral & Affiliate system processing...');

        // 1. Mature Pending Commissions
        $matured = $engine->maturePendingCommissions();
        $this->info("Matured {$matured} pending commissions to AVAILABLE status.");

        // 2. Evaluate Performance Tiers
        $engine->evaluatePerformanceTiers();
        $this->info('Evaluated and updated affiliate performance tiers.');

        // 3. Check Automated Monthly Payout Batches
        $config = ReferralSystemConfig::getActiveConfig();
        $isPayoutDay = ((int) date('j') === (int) $config->auto_payout_day_of_month) || $this->option('force-payouts');

        if ($config->payout_mode === 'automated_batch' && $isPayoutDay) {
            $payoutResult = $engine->processAutomatedPayoutBatches();
            $this->info("Generated {$payoutResult['generated']} automated payout batches totaling MVR " . number_format($payoutResult['total_amount'], 2));
        } else {
            $this->info("Skipped automated payouts (Payout mode: {$config->payout_mode}, Day: " . date('j') . "/{$config->auto_payout_day_of_month}).");
        }

        $this->info('Referral processing completed successfully.');
        return Command::SUCCESS;
    }
}
