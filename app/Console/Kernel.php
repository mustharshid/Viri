<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        $schedule->job(new \App\Jobs\SyncHealthAggregationJob)
                 ->everyMinute()
                 ->timezone('Asia/Maldives');

        $schedule->command('viri:prune-logs')
                 ->daily()
                 ->timezone('Asia/Maldives');
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
