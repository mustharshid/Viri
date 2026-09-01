<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExchangeSale extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'terminal_id',
        'shift_id',
        'kyc_customer_id',
        'kyc_record_id',
        'receipt_number',
        'sale_type',
        'base_currency',
        'quote_currency',
        'base_amount',
        'exchange_rate',
        'quote_amount',
        'received_payment_type',
        'received_bank_account_id',
        'received_transaction_id',
        'received_transaction_hash',
        'received_amount',
        'received_currency',
        'sent_payment_type',
        'sent_bank_account_id',
        'sent_transaction_id',
        'sent_transaction_hash',
        'sent_amount',
        'sent_currency',
        'customer_name',
        'customer_id_number',
        'notes',
        'created_by_name',
        'status',
        'voided_at',
        'voided_by_name',
        'void_reason',
    ];

    protected $casts = [
        'base_amount' => 'float',
        'exchange_rate' => 'float',
        'quote_amount' => 'float',
        'received_amount' => 'float',
        'sent_amount' => 'float',
        'voided_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function terminal(): BelongsTo
    {
        return $this->belongsTo(Terminal::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(CounterShift::class, 'shift_id');
    }

    public function kycCustomer(): BelongsTo
    {
        return $this->belongsTo(KycCustomer::class, 'kyc_customer_id');
    }

    public function kycRecord(): BelongsTo
    {
        return $this->belongsTo(KycRecord::class, 'kyc_record_id');
    }

    public function receivedBankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class, 'received_bank_account_id');
    }

    public function sentBankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class, 'sent_bank_account_id');
    }
}
