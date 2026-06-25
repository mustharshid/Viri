<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Terminal;
use App\Models\BankAccount;
use App\Models\BankAccountLock;
use Illuminate\Support\Facades\DB;

class BankAccountLockController extends Controller
{
    private function validateTerminalAndAccount(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'bank_account_id' => 'required|integer',
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)
            ->where('status', 'active')
            ->first();

        if (!$terminal) {
            return ['error' => 'Terminal unauthorized or inactive', 'status' => 403];
        }

        $bankAccount = BankAccount::where('id', $request->bank_account_id)
            ->where('tenant_id', $terminal->tenant_id)
            ->first();

        if (!$bankAccount) {
            return ['error' => 'Bank account not found or unauthorized', 'status' => 404];
        }

        return ['terminal' => $terminal, 'bank_account' => $bankAccount];
    }

    public function lockAccount(Request $request)
    {
        $validation = $this->validateTerminalAndAccount($request);
        if (isset($validation['error'])) {
            return response()->json(['error' => $validation['error']], $validation['status']);
        }

        $bankAccountId = $request->bank_account_id;
        $hardwareId = $request->hardware_id;

        $result = DB::transaction(function () use ($bankAccountId, $hardwareId) {
            $existingLock = BankAccountLock::where('bank_account_id', $bankAccountId)
                ->lockForUpdate()
                ->first();

            $now = now();

            if ($existingLock && $existingLock->expires_at->gt($now)) {
                if ($existingLock->hardware_id === $hardwareId) {
                    // Extend the lock
                    $existingLock->expires_at = $now->addSeconds(20);
                    $existingLock->save();
                    return [
                        'status' => 'acquired',
                        'message' => 'Lock extended successfully'
                    ];
                }

                // Locked by someone else
                return [
                    'status' => 'busy',
                    'message' => 'Bank account is currently in use by another terminal',
                    'held_by' => $existingLock->hardware_id,
                    'expires_in' => $existingLock->expires_at->diffInSeconds($now)
                ];
            }

            // Lock does not exist or is expired - acquire it
            BankAccountLock::updateOrCreate(
                ['bank_account_id' => $bankAccountId],
                [
                    'hardware_id' => $hardwareId,
                    'expires_at' => $now->addSeconds(20)
                ]
            );

            return [
                'status' => 'acquired',
                'message' => 'Lock acquired successfully'
            ];
        });

        if ($result['status'] === 'busy') {
            return response()->json($result, 409);
        }

        return response()->json($result);
    }

    public function heartbeat(Request $request)
    {
        $validation = $this->validateTerminalAndAccount($request);
        if (isset($validation['error'])) {
            return response()->json(['error' => $validation['error']], $validation['status']);
        }

        $bankAccountId = $request->bank_account_id;
        $hardwareId = $request->hardware_id;

        $extended = DB::transaction(function () use ($bankAccountId, $hardwareId) {
            $existingLock = BankAccountLock::where('bank_account_id', $bankAccountId)
                ->lockForUpdate()
                ->first();

            if ($existingLock && $existingLock->hardware_id === $hardwareId) {
                $existingLock->expires_at = now()->addSeconds(20);
                $existingLock->save();
                return true;
            }

            return false;
        });

        if (!$extended) {
            return response()->json(['error' => 'Lock not found or held by another terminal'], 403);
        }

        return response()->json(['status' => 'extended', 'message' => 'Lock heartbeat extended']);
    }

    public function unlockAccount(Request $request)
    {
        $validation = $this->validateTerminalAndAccount($request);
        if (isset($validation['error'])) {
            return response()->json(['error' => $validation['error']], $validation['status']);
        }

        BankAccountLock::where('bank_account_id', $request->bank_account_id)
            ->where('hardware_id', $request->hardware_id)
            ->delete();

        return response()->json(['status' => 'released', 'message' => 'Lock released successfully']);
    }
}
