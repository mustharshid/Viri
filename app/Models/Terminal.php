<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Terminal extends Model
{
    protected $fillable = [
        'tenant_id',
        'terminal_name',
        'hardware_id',
        'status',
        'pairing_code',
        'pairing_code_expires_at'
    ];

    protected $casts = [
        'pairing_code_expires_at' => 'datetime'
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
