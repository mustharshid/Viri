<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionPlan extends Model
{
    protected $fillable = [
        'tier_key',
        'name',
        'price',
        'max_terminals',
        'lock_timeout',
        'features'
    ];

    protected $casts = [
        'price' => 'float',
        'max_terminals' => 'integer',
        'lock_timeout' => 'integer',
        'features' => 'array'
    ];
}
