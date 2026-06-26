<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Terminal;

class TerminalPairingController extends Controller
{
    public function pair(Request $request)
    {
        $request->validate([
            'pairing_code' => 'required|string'
        ]);

        $terminal = Terminal::where('pairing_code', $request->pairing_code)->first();

        if (!$terminal) {
            return response()->json(['error' => 'Invalid pairing code.'], 404);
        }

        if ($terminal->pairing_code_expires_at && now()->greaterThan($terminal->pairing_code_expires_at)) {
            return response()->json(['error' => 'Pairing code has expired. Please generate a new one in the dashboard.'], 400);
        }

        // Successfully paired: clear the code so it cannot be reused
        $terminal->update([
            'pairing_code' => null,
            'pairing_code_expires_at' => null,
        ]);

        return response()->json([
            'message' => 'Terminal paired successfully.',
            'hardware_id' => $terminal->hardware_id,
            'extension_id' => env('VIRI_EXTENSION_ID', 'viri_default_extension_id'),
            'terminal_name' => $terminal->terminal_name
        ]);
    }

    public function uploadLogs(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'logs' => 'required|array'
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)
            ->where('status', 'active')
            ->first();

        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized or inactive'], 403);
        }

        $terminal->update([
            'debug_logs' => json_encode($request->logs)
        ]);

        return response()->json(['message' => 'Logs uploaded successfully.']);
    }
}
