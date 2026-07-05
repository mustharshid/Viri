<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TerminalEvent extends Model
{
    protected $fillable = [
        'hardware_id',
        'event_type',
        'payload',
        'delivered',
    ];

    protected $casts = [
        'payload'   => 'array',
        'delivered' => 'boolean',
    ];
}
