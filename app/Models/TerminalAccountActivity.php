<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TerminalAccountActivity extends Model
{
    use HasFactory;

    protected $table = 'terminal_account_activity';

    protected $fillable = [
        'terminal_id',
        'bank_account_id',
    ];

    public function terminal()
    {
        return $this->belongsTo(Terminal::class);
    }

    public function bankAccount()
    {
        return $this->belongsTo(BankAccount::class);
    }
}
