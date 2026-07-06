<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Terminal;
use App\Models\LedgerReport;

class LedgerReportController extends Controller
{
    public function store(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string',
            'date' => 'required|string',
            'bank' => 'required|string',
            'account_name' => 'required|string',
            'account_number' => 'nullable|string',
            'encrypted_payload' => 'required|string',
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)->first();

        if (!$terminal || $terminal->status !== 'active') {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $report = LedgerReport::create([
            'tenant_id' => $terminal->tenant_id,
            'terminal_id' => $terminal->id,
            'date' => $request->date,
            'bank' => $request->bank,
            'account_name' => $request->account_name,
            'account_number' => $request->account_number,
            'encrypted_payload' => $request->encrypted_payload,
        ]);

        return response()->json(['status' => 'success', 'report' => $report]);
    }

    public function index(Request $request)
    {
        $request->validate([
            'hardware_id' => 'required|string'
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)->first();

        if (!$terminal || $terminal->status !== 'active') {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $reports = LedgerReport::where('tenant_id', $terminal->tenant_id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['status' => 'success', 'reports' => $reports]);
    }
}
