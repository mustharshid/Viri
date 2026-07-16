<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

use App\Models\MibDeviceCredential;
use Carbon\Carbon;

class MibKeysController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'hardware_id' => 'required|string',
            'bank_account_id' => 'required|integer',
            'mib_username' => 'required|string',
            'key1' => 'required|string',
            'key2' => 'required|string',
            'app_id' => 'required|string|max:64',
        ]);

        $terminal = \App\Models\Terminal::where('hardware_id', $validated['hardware_id'])->first();
        if (!$terminal) return response()->json(['error' => 'Unauthorized terminal'], 403);

        MibDeviceCredential::updateOrCreate(
            [
                'terminal_id' => $terminal->id,
                'bank_account_id' => $validated['bank_account_id'],
                'mib_username' => $validated['mib_username'],
            ],
            [
                'key1' => $validated['key1'],
                'key2' => $validated['key2'],
                'app_id' => $validated['app_id'],
                'obtained_at' => Carbon::now(),
            ]
        );

        return response()->json(['success' => true]);
    }

    public function getKeys(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
        ]);

        $terminal = \App\Models\Terminal::where('hardware_id', $request->hardware_id)->first();
        if (!$terminal) return response()->json(['error' => 'Unauthorized terminal'], 403);

        $query = MibDeviceCredential::where('terminal_id', $terminal->id);
        
        if ($request->has('mib_username')) {
            $query->where('mib_username', $request->mib_username);
        } else if ($request->has('bank_account_id')) {
            $query->where('bank_account_id', $request->bank_account_id);
        } else {
            return response()->json(['error' => 'Missing identifiers'], 400);
        }

        $credential = $query->first();

        if (!$credential) {
            return response()->json(['error' => 'Not found'], 404);
        }

        return response()->json([
            'key1' => $credential->key1,
            'key2' => $credential->key2,
            'appId' => $credential->app_id,
            'obtained_at' => $credential->obtained_at ? $credential->obtained_at->toIso8601String() : null,
        ]);
    }
}
