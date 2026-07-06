<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LedgerReport extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'date',
        'bank',
        'account_name',
        'account_number',
        'encrypted_payload',
    ];

    /**
     * Get the tenant that owns the report.
     */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /**
     * Get the terminal that generated the report.
     */
    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class);
    }
}
