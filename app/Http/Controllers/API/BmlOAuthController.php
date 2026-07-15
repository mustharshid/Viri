<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

use App\Models\BmlOAuthToken;
use Carbon\Carbon;

class BmlOAuthController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'terminal_id' => 'required|integer',
            'bank_account_id' => 'required|integer',
            'bml_username' => 'required|string',
            'profile_type' => 'required|in:personal,business',
            'access_token' => 'required|string',
            'refresh_token' => 'required|string',
            'device_id' => 'required|string',
            'expires_in' => 'required|integer',
        ]);

        $expiresAt = Carbon::now()->addSeconds($validated['expires_in']);

        BmlOAuthToken::updateOrCreate(
            [
                'terminal_id' => $validated['terminal_id'],
                'bml_username' => $validated['bml_username'],
                'profile_type' => $validated['profile_type'],
            ],
            [
                'bank_account_id' => $validated['bank_account_id'],
                'access_token' => $validated['access_token'],
                'refresh_token' => $validated['refresh_token'],
                'device_id' => $validated['device_id'],
                'expires_in' => $validated['expires_in'],
                'expires_at' => $expiresAt,
                'obtained_at' => Carbon::now(),
            ]
        );

        return response()->json(['success' => true]);
    }

    public function getTokens(Request $request)
    {
        $request->validate([
            'terminal_id' => 'required|integer',
        ]);

        $query = BmlOAuthToken::where('terminal_id', $request->terminal_id);
        
        if ($request->has('bml_username') && $request->has('profile_type')) {
            $query->where('bml_username', $request->bml_username)
                  ->where('profile_type', $request->profile_type);
        } else if ($request->has('bank_account_id')) {
            $query->where('bank_account_id', $request->bank_account_id);
        } else {
            return response()->json(['error' => 'Missing identifiers'], 400);
        }

        $token = $query->first();

        if (!$token) {
            return response()->json(['error' => 'Not found'], 404);
        }

        return response()->json([
            'access_token' => $token->access_token,
            'refresh_token' => $token->refresh_token,
            'device_id' => $token->device_id,
            'expires_in' => $token->expires_in,
            'expires_at' => $token->expires_at ? $token->expires_at->toIso8601String() : null,
        ]);
    }

    public function updateTokens(Request $request)
    {
        $validated = $request->validate([
            'terminal_id' => 'required|integer',
            'bank_account_id' => 'required|integer',
            'access_token' => 'required|string',
            'refresh_token' => 'required|string',
            'expires_in' => 'sometimes|integer',
        ]);

        $token = BmlOAuthToken::where('terminal_id', $validated['terminal_id'])
            ->where('bank_account_id', $validated['bank_account_id'])
            ->first();

        if (!$token) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $token->access_token = $validated['access_token'];
        $token->refresh_token = $validated['refresh_token'];
        if (isset($validated['expires_in'])) {
            $token->expires_in = $validated['expires_in'];
            $token->expires_at = Carbon::now()->addSeconds($validated['expires_in']);
            $token->obtained_at = Carbon::now();
        }
        $token->save();

        return response()->json(['success' => true]);
    }
}
