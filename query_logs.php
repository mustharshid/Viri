<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$log = App\Models\SessionActivityLog::whereNotNull('event_detail')->latest()->first();
echo json_encode($log->event_detail, JSON_PRETTY_PRINT);
