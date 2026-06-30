<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    use Prunable;

    const UPDATED_AT = null; // Append-only, so no updated_at

    protected $fillable = [
        'tenant_id',
        'event_type',
        'actor',
        'ip_address',
        'metadata'
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function prunable(): Builder
    {
        return static::where('created_at', '<=', now()->subDays(30));
    }
}
