<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentReceipt extends Model
{
    protected $fillable = [
        'tenant_id',
        'amount',
        'reference_number',
        'receipt_slip_path',
        'status',
        'remarks'
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }
}
