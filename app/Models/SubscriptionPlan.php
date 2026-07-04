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
        'max_bank_accounts',
        'lock_timeout',
        'features'
    ];

    protected $casts = [
        'price' => 'float',
        'max_terminals' => 'integer',
        'max_bank_accounts' => 'integer',
        'lock_timeout' => 'integer',
        'features' => 'array'
    ];
}
