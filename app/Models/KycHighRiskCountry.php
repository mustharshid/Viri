<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KycHighRiskCountry extends Model
{
    protected $fillable = [
        'country_code',
        'country_name',
        'risk_level',
        'notes',
        'added_by_fiu',
    ];

    protected $casts = [
        'added_by_fiu' => 'boolean',
    ];
}
