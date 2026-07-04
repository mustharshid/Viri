<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\CredentialSyncRequest;
use App\Models\Terminal;
use Illuminate\Http\Request;

class CredentialSyncController extends Controller
{
    // =========================================================================
    // COMPANY DASHBOARD METHODS (auth:sanctum)
    // =========================================================================

    /**
     * POST /api/company/credential-sync/initiate
     * Company admin starts a new sync from a source terminal.
     */
    public function initiate(Request $request)
    {
        $request->validate([
            'source_terminal_id' => 'required|integer',
        ]);

        $tenantId = $request->user()->tenant_id;

        $source = Terminal::where('id', $request->source_terminal_id)
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->first();

        if (!$source) {
            return response()->json(['error' => 'Source terminal not found or inactive.'], 404);
        }

        // Expire any existing active sync for this source terminal to avoid orphans
        CredentialSyncRequest::where('source_terminal_id', $source->id)
            ->active()
            ->update(['status' => 'expired']);

        $sync = CredentialSyncRequest::create([
            'tenant_id'           => $tenantId,
            'source_terminal_id'  => $source->id,
            'status'              => 'pending_export',
            'expires_at'          => now()->addMinutes(30),
        ]);

        AuditLog::create([
            'tenant_id'  => $tenantId,
            'event_type' => 'credential_sync_initiated',
            'actor'      => $request->user()->name,
            'ip_address' => $request->ip(),
            'metadata'   => [
                'sync_id'              => $sync->id,
                'source_terminal_name' => $source->terminal_name,
            ],
        ]);

        return response()->json(['sync_id' => $sync->id]);
    }

    /**
     * GET /api/company/credential-sync/{id}/status
     * Poll sync progress from the Company Dashboard wizard.
     */
    public function status(Request $request, $id)
    {
        $tenantId = $request->user()->tenant_id;

        $sync = CredentialSyncRequest::where('id', $id)
            ->where('tenant_id', $tenantId)
            ->first();

        if (!$sync) {
            return response()->json(['error' => 'Sync request not found.'], 404);
        }

        // Auto-expire stale records
        if ($sync->expires_at && $sync->expires_at->isPast() && !in_array($sync->status, ['completed', 'expired'])) {
            $sync->update(['status' => 'expired']);
        }

        return response()->json([
            'status'               => $sync->status,
            'source_terminal_name' => $sync->sourceTerminal?->terminal_name,
            'target_terminal_name' => $sync->targetTerminal?->terminal_name,
            'expires_at'           => $sync->expires_at?->toIso8601String(),
        ]);
    }

    /**
     * POST /api/company/credential-sync/{id}/trigger-import
     * Admin selects a target terminal; moves sync to pending_import.
     */
    public function triggerImport(Request $request, $id)
    {
        $request->validate([
            'target_terminal_id' => 'required|integer',
        ]);

        $tenantId = $request->user()->tenant_id;

        $sync = CredentialSyncRequest::where('id', $id)
            ->where('tenant_id', $tenantId)
            ->where('status', 'ready')
            ->active()
            ->first();

        if (!$sync) {
            return response()->json(['error' => 'Sync request not ready or expired.'], 404);
        }

        $target = Terminal::where('id', $request->target_terminal_id)
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->first();

        if (!$target) {
            return response()->json(['error' => 'Target terminal not found or inactive.'], 404);
        }

        if ($target->id === $sync->source_terminal_id) {
            return response()->json(['error' => 'Source and target terminals must be different.'], 422);
        }

        $sync->update([
            'target_terminal_id' => $target->id,
            'status'             => 'pending_import',
        ]);

        AuditLog::create([
            'tenant_id'  => $tenantId,
            'event_type' => 'credential_sync_import_triggered',
            'actor'      => $request->user()->name,
            'ip_address' => $request->ip(),
            'metadata'   => [
                'sync_id'              => $sync->id,
                'source_terminal_name' => $sync->sourceTerminal?->terminal_name,
                'target_terminal_name' => $target->terminal_name,
            ],
        ]);

        return response()->json(['status' => 'pending_import']);
    }

    /**
     * DELETE /api/company/credential-sync/{id}
     * Cancel an active sync and wipe any stored data.
     */
    public function cancel(Request $request, $id)
    {
        $tenantId = $request->user()->tenant_id;

        $sync = CredentialSyncRequest::where('id', $id)
            ->where('tenant_id', $tenantId)
            ->first();

        if (!$sync) {
            return response()->json(['error' => 'Not found.'], 404);
        }

        $sync->update([
            'status'         => 'expired',
            'passphrase'     => null,
            'encrypted_blob' => null,
            'wrapped_dek'    => null,
            'kdf_salt'       => null,
            'gcm_iv'         => null,
        ]);

        return response()->json(['status' => 'cancelled']);
    }

    // =========================================================================
    // TERMINAL METHODS (hardware_id auth — no Sanctum)
    // =========================================================================

    /**
     * GET /api/terminal/credential-sync/pending?hardware_id=X
     * Terminal polls for its pending sync task (export or import).
     */
    public function pendingForTerminal(Request $request)
    {
        $request->validate(['hardware_id' => 'required|string']);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)
            ->where('status', 'active')
            ->first();

        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        // Check if this terminal is a pending source (export)
        $exportSync = CredentialSyncRequest::where('source_terminal_id', $terminal->id)
            ->where('status', 'pending_export')
            ->active()
            ->first();

        if ($exportSync) {
            return response()->json([
                'sync_id' => $exportSync->id,
                'action'  => 'export',
            ]);
        }

        // Check if this terminal is a pending target (import)
        $importSync = CredentialSyncRequest::where('target_terminal_id', $terminal->id)
            ->where('status', 'pending_import')
            ->active()
            ->first();

        if ($importSync) {
            return response()->json([
                'sync_id' => $importSync->id,
                'action'  => 'import',
                'payload' => [
                    'passphrase'     => $importSync->passphrase,
                    'encrypted_blob' => $importSync->encrypted_blob,
                    'wrapped_dek'    => $importSync->wrapped_dek,
                    'kdf_salt'       => $importSync->kdf_salt,
                    'gcm_iv'         => $importSync->gcm_iv,
                ],
            ]);
        }

        return response()->json(['sync_id' => null]);
    }

    /**
     * POST /api/terminal/credential-sync/{id}/upload
     * Source terminal uploads the encrypted credential package.
     */
    public function upload(Request $request, $id)
    {
        $request->validate([
            'hardware_id'    => 'required|string',
            'passphrase'     => 'required|string',
            'encrypted_blob' => 'required|string',
            'wrapped_dek'    => 'required|string',
            'kdf_salt'       => 'required|string',
            'gcm_iv'         => 'required|string',
        ]);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)
            ->where('status', 'active')
            ->first();

        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $sync = CredentialSyncRequest::where('id', $id)
            ->where('source_terminal_id', $terminal->id)
            ->where('status', 'pending_export')
            ->active()
            ->first();

        if (!$sync) {
            return response()->json(['error' => 'Sync request not found or already processed.'], 404);
        }

        $sync->update([
            'status'         => 'ready',
            'passphrase'     => $request->passphrase,
            'encrypted_blob' => $request->encrypted_blob,
            'wrapped_dek'    => $request->wrapped_dek,
            'kdf_salt'       => $request->kdf_salt,
            'gcm_iv'         => $request->gcm_iv,
        ]);

        return response()->json(['status' => 'ready']);
    }

    /**
     * POST /api/terminal/credential-sync/{id}/confirm-import
     * Target terminal confirms successful decryption.
     * Immediately wipes all sensitive fields from the DB.
     */
    public function confirmImport(Request $request, $id)
    {
        $request->validate(['hardware_id' => 'required|string']);

        $terminal = Terminal::where('hardware_id', $request->hardware_id)
            ->where('status', 'active')
            ->first();

        if (!$terminal) {
            return response()->json(['error' => 'Terminal unauthorized'], 403);
        }

        $sync = CredentialSyncRequest::where('id', $id)
            ->where('target_terminal_id', $terminal->id)
            ->where('status', 'pending_import')
            ->first();

        if (!$sync) {
            return response()->json(['error' => 'Sync request not found.'], 404);
        }

        // Wipe all sensitive fields and mark completed
        $sync->wipeAndComplete();

        AuditLog::create([
            'tenant_id'  => $sync->tenant_id,
            'event_type' => 'credential_sync_completed',
            'actor'      => $terminal->terminal_name,
            'ip_address' => $request->ip(),
            'metadata'   => [
                'sync_id'             => $sync->id,
                'target_terminal_id'  => $terminal->id,
                'target_terminal_name'=> $terminal->terminal_name,
            ],
        ]);

        return response()->json(['status' => 'completed']);
    }
}
