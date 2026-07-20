<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use App\Models\AuditLog;
use App\Models\SessionActivityLog;
use App\Models\SyncExecutionLog;

class PruneLogsCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'viri:prune-logs {--days-activity=30} {--days-audit=60}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Prune old audit logs, session activity logs, and sync execution logs';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $daysActivity = (int) $this->option('days-activity');
        $daysAudit = (int) $this->option('days-audit');

        $this->info("Pruning logs older than {$daysActivity} days for activity/sync, and {$daysAudit} days for audit logs...");

        $activityCutoff = now()->subDays($daysActivity);
        $auditCutoff = now()->subDays($daysAudit);

        // 1. Prune SessionActivityLog
        $deletedActivity = SessionActivityLog::where('created_at', '<', $activityCutoff)->delete();
        $this->line("- Deleted {$deletedActivity} session activity logs.");

        // 2. Prune SyncExecutionLog
        $deletedSync = SyncExecutionLog::where('created_at', '<', $activityCutoff)->delete();
        $this->line("- Deleted {$deletedSync} sync execution logs.");

        // 3. Prune AuditLog
        $deletedAudit = AuditLog::where('created_at', '<', $auditCutoff)->delete();
        $this->line("- Deleted {$deletedAudit} audit logs.");

        $this->info("Log pruning completed successfully!");
    }
}
