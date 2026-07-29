<?php

use App\Models\SessionActivityLog;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();

$log = SessionActivityLog::whereNotNull('event_detail')->latest()->first();
echo json_encode($log->event_detail, JSON_PRETTY_PRINT);
