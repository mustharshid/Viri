<?php

namespace App\Events;

use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SyncCompleted
{
    use Dispatchable, InteractsWithQueue, SerializesModels;

    public function __construct(
        public readonly int $requestId,
        public readonly int $bankAccountId,
        public readonly int $terminalId,
        public readonly int $durationMs,
        public readonly string $status,
        public readonly ?string $failureReason,
        public readonly array $timestamps,
    ) {}
}
