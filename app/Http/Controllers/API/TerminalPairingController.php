<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Terminal;
use App\Models\AuditLog;

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
            'terminal_name' => $terminal->terminal_name,
            // 'credentials' intentionally omitted — credentials are never transmitted by server (ZK architecture)
        ]);
    }

    public function saveCredentials(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'credentials' => 'nullable|array'
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)
            ->where('status', 'active')
            ->first();

        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized or inactive'], 403);
        }

        $terminal->update([
            'credentials' => $request->credentials
        ]);

        return response()->json(['message' => 'Credentials saved successfully.']);
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

        // Fetch existing log runs
        $existing = json_decode($terminal->debug_logs, true);
        $runs = [];

        if (is_array($existing)) {
            // Check if it's the old format (array of strings) or a list of runs
            if (count($existing) > 0 && is_string($existing[0])) {
                // Convert old flat format to a single run object
                $runs[] = [
                    'timestamp' => $terminal->updated_at ? $terminal->updated_at->toIso8601String() : now()->toIso8601String(),
                    'logs' => $existing
                ];
            } else {
                $runs = $existing;
            }
        }

        // Add the new run at the beginning
        array_unshift($runs, [
            'timestamp' => now()->toIso8601String(),
            'logs' => $request->logs
        ]);

        // Limit history to the last 10 runs
        $runs = array_slice($runs, 0, 10);

        $terminal->update([
            'debug_logs' => json_encode($runs)
        ]);

        return response()->json(['message' => 'Logs uploaded successfully.']);
    }

    public function logStatus(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'event' => 'required|string', // 'online', 'offline', 'settings_changed'
            'metadata' => 'nullable|array'
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)
            ->where('status', 'active')
            ->first();

        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        AuditLog::create([
            'tenant_id' => $terminal->tenant_id,
            'event_type' => $request->event,
            'actor' => $terminal->terminal_name,
            'ip_address' => $request->ip(),
            'metadata' => array_merge($request->metadata ?? [], ['hardware_id' => $request->hardware_id])
        ]);

        return response()->json(['message' => 'Event logged successfully.']);
    }
}
