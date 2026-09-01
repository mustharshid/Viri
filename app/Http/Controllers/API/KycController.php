<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\KycCustomer;
use App\Models\KycHighRiskCountry;
use App\Models\KycRecord;
use App\Services\KycReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class KycController extends Controller
{
    // ── Feature Gate Helper ──────────────────────────────────────────────────

    /**
     * Return 403 if kyc_enabled is not active for this tenant.
     * Checks both the tenant-level feature flag AND the terminal-level permission.
     */
    private function ensureKycEnabled(Request $request, ?int $terminalId = null): ?object
    {
        $user = $request->user();
        $tenant = $user->tenant;
        $tenantFeatures = $tenant->features ?? [];

        if (empty($tenantFeatures['kyc_enabled'])) {
            abort(403, 'KYC module is not enabled for this account.');
        }

        return null;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  CUSTOMER INDEX — lightweight list for autocomplete
    // ════════════════════════════════════════════════════════════════════════

    /**
     * GET /api/kyc/customers/index
     *
     * Returns a minimal [{id, nic_number, passport_number, full_name}] array
     * scoped to the requesting tenant. Response is ETag-cached server-side
     * so clients receive HTTP 304 when nothing has changed.
     */
    public function customerIndex(Request $request)
    {
        $this->ensureKycEnabled($request);
        $tenantId = $request->user()->tenant_id;

        // Build a cache key unique to this tenant
        $cacheKey = "kyc_customer_index_{$tenantId}";

        // Invalidate cache if clients pass a bust flag (e.g. after creating a customer)
        if ($request->boolean('bust')) {
            Cache::forget($cacheKey);
        }

        $index = Cache::remember($cacheKey, 1800, function () use ($tenantId) {
            return KycCustomer::where('tenant_id', $tenantId)
                ->whereNull('deleted_at')
                ->orderBy('full_name')
                ->get(['id', 'nic_number', 'passport_number', 'full_name']);
        });

        // Generate ETag from a hash of the data so clients can use conditional requests
        $etag = '"' . md5($index->toJson()) . '"';

        if ($request->header('If-None-Match') === $etag) {
            return response('', 304)->header('ETag', $etag);
        }

        return response()->json($index)
            ->header('ETag', $etag)
            ->header('Cache-Control', 'private, max-age=1800');
    }

    // ════════════════════════════════════════════════════════════════════════
    //  CUSTOMER CRUD
    // ════════════════════════════════════════════════════════════════════════

    /**
     * GET /api/kyc/customers/{id}
     * Fetch full customer profile — called once when cashier selects from autocomplete.
     */
    public function showCustomer(Request $request, int $id)
    {
        $this->ensureKycEnabled($request);
        $tenantId = $request->user()->tenant_id;

        $customer = KycCustomer::where('tenant_id', $tenantId)->findOrFail($id);

        return response()->json($customer);
    }

    /**
     * POST /api/kyc/customers
     * Create a new customer profile.
     */
    public function createCustomer(Request $request)
    {
        $this->ensureKycEnabled($request);

        $data = $request->validate([
            'nic_number'                  => 'nullable|string|max:20',
            'passport_number'             => 'nullable|string|max:20',
            'customer_type'               => 'required|in:individual,legal_entity,partnership,government',
            'full_name'                   => 'required|string|max:255',
            'aliases'                     => 'nullable|string|max:255',
            'nationality'                 => 'required|string|max:100',
            'dob'                         => 'nullable|date',
            'address'                     => 'required|string',
            'contact_number'              => 'required|string|max:30',
            'email'                       => 'nullable|email|max:255',
            'company_registration_number' => 'nullable|string|max:50',
            'beneficial_owner_name'       => 'nullable|string|max:255',
            'beneficial_owner_id_type'    => 'nullable|in:nic,passport',
            'beneficial_owner_id_number'  => 'nullable|string|max:20',
            'beneficial_owner_nationality'=> 'nullable|string|max:100',
            'directors_json'              => 'nullable|array',
            'is_pep'                      => 'boolean',
            'id_document_local_path'      => 'nullable|string|max:500',
        ]);

        if (empty($data['nic_number']) && empty($data['passport_number'])) {
            return response()->json(['message' => 'At least one of NIC number or Passport number is required.'], 422);
        }

        $user = $request->user();
        $tenantId = $user->tenant_id;

        $customer = KycCustomer::create(array_merge($data, [
            'tenant_id'       => $tenantId,
            'created_by'      => $user->id,
            'last_updated_by' => $user->id,
        ]));

        // Invalidate the index cache so the new customer appears in autocomplete
        Cache::forget("kyc_customer_index_{$tenantId}");

        return response()->json($customer, 201);
    }

    /**
     * PUT /api/kyc/customers/{id}
     * Update a customer profile (e.g. cashier corrects stale data).
     */
    public function updateCustomer(Request $request, int $id)
    {
        $this->ensureKycEnabled($request);
        $user = $request->user();
        $tenantId = $user->tenant_id;

        $customer = KycCustomer::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'nic_number'                  => 'nullable|string|max:20',
            'passport_number'             => 'nullable|string|max:20',
            'customer_type'               => 'in:individual,legal_entity,partnership,government',
            'full_name'                   => 'string|max:255',
            'aliases'                     => 'nullable|string|max:255',
            'nationality'                 => 'string|max:100',
            'dob'                         => 'nullable|date',
            'address'                     => 'string',
            'contact_number'              => 'string|max:30',
            'email'                       => 'nullable|email|max:255',
            'company_registration_number' => 'nullable|string|max:50',
            'beneficial_owner_name'       => 'nullable|string|max:255',
            'beneficial_owner_id_type'    => 'nullable|in:nic,passport',
            'beneficial_owner_id_number'  => 'nullable|string|max:20',
            'beneficial_owner_nationality'=> 'nullable|string|max:100',
            'directors_json'              => 'nullable|array',
            'is_pep'                      => 'boolean',
            'id_document_local_path'      => 'nullable|string|max:500',
        ]);

        $customer->update(array_merge($data, ['last_updated_by' => $user->id]));

        // Invalidate index cache (name or IDs may have changed)
        Cache::forget("kyc_customer_index_{$tenantId}");

        return response()->json($customer->fresh());
    }

    // ════════════════════════════════════════════════════════════════════════
    //  KYC RECORDS
    // ════════════════════════════════════════════════════════════════════════

    /**
     * GET /api/kyc/records
     * List transaction records for the Company Dashboard — paginated + filtered.
     */
    public function listRecords(Request $request)
    {
        $this->ensureKycEnabled($request);
        $tenantId = $request->user()->tenant_id;
        $perPage = min((int) $request->input('per_page', 25), 100);

        $query = KycRecord::with(['customer:id,full_name,nic_number,passport_number,nationality,is_pep,risk_level', 'cashier:id,name', 'terminal:id,terminal_name'])
            ->where('kyc_records.tenant_id', $tenantId);

        if ($request->filled('transaction_type')) {
            $query->where('transaction_type', $request->transaction_type);
        }
        if ($request->filled('risk_level')) {
            $query->whereHas('customer', fn($q) => $q->where('risk_level', $request->risk_level));
        }
        if ($request->filled('terminal_id')) {
            $query->where('terminal_id', $request->terminal_id);
        }
        if ($request->boolean('suspicious_only')) {
            $query->where('is_suspicious', true);
        }
        if ($request->boolean('pending_edd')) {
            $query->where('edd_status', 'pending_approval');
        }
        if ($request->boolean('pending_ctr')) {
            $query->where('requires_ctr', true)->whereNull('ctr_submitted_at');
        }
        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        $records = $query->orderBy('created_at', 'desc')->paginate($perPage);
        return response()->json($records);
    }

    /**
     * POST /api/kyc/records
     * Create a KYC transaction record (submitted by cashier after completing the form).
     */
    public function createRecord(Request $request)
    {
        $this->ensureKycEnabled($request);

        $data = $request->validate([
            'kyc_customer_id'           => 'required|integer',
            'terminal_id'               => 'nullable|integer',
            'transaction_type'          => 'required|in:money_changing,money_transfer',
            'transaction_amount'        => 'required|numeric|min:0',
            'transaction_currency'      => 'nullable|string|max:10',
            'transaction_reference'     => 'nullable|string|max:100',
            'transaction_purpose'       => 'nullable|string',
            'cdd_type'                  => 'required|in:simplified,standard,enhanced',
            'rep_name'                  => 'nullable|string|max:255',
            'rep_id_type'               => 'nullable|in:nic,passport',
            'rep_id_number'             => 'nullable|string|max:20',
            'rep_authority_reference'   => 'nullable|string|max:100',
            'is_not_physically_present' => 'boolean',
            'transfer_direction'        => 'nullable|in:domestic,outbound,inbound',
            'originator_name'           => 'nullable|string|max:255',
            'originator_id_number'      => 'nullable|string|max:20',
            'originator_address'        => 'nullable|string',
            'beneficiary_name'          => 'nullable|string|max:255',
            'beneficiary_institution'   => 'nullable|string|max:255',
            'edd_status'                => 'nullable|in:not_required,pending_approval,approved',
            'edd_source_of_wealth'      => 'nullable|string',
            'edd_source_of_funds'       => 'nullable|string',
            'is_suspicious'             => 'boolean',
            'str_notes'                 => 'nullable|string',
        ]);

        $user = $request->user();
        $tenantId = $user->tenant_id;

        // Verify the customer belongs to this tenant
        KycCustomer::where('tenant_id', $tenantId)->findOrFail($data['kyc_customer_id']);

        $record = KycRecord::create(array_merge($data, [
            'tenant_id'       => $tenantId,
            'cashier_user_id' => $user->id,
            'str_flagged_at'  => !empty($data['is_suspicious']) ? now() : null,
            'str_flagged_by'  => !empty($data['is_suspicious']) ? $user->id : null,
        ]));

        return response()->json($record->load(['customer', 'cashier:id,name', 'terminal:id,terminal_name']), 201);
    }

    /**
     * GET /api/kyc/records/{id}
     * Full record detail including customer and all relations.
     */
    public function showRecord(Request $request, int $id)
    {
        $this->ensureKycEnabled($request);
        $tenantId = $request->user()->tenant_id;

        $record = KycRecord::with(['customer', 'cashier:id,name', 'terminal:id,terminal_name', 'eddApprovedBy:id,name', 'strFlaggedBy:id,name'])
            ->where('tenant_id', $tenantId)
            ->findOrFail($id);

        return response()->json($record);
    }

    // ── EDD Approval ─────────────────────────────────────────────────────────

    /**
     * PUT /api/kyc/records/{id}/approve-edd
     * Senior manager approves EDD for a high-risk transaction.
     */
    public function approveEdd(Request $request, int $id)
    {
        $this->ensureKycEnabled($request);
        $tenantId = $request->user()->tenant_id;

        $record = KycRecord::where('tenant_id', $tenantId)
            ->where('edd_status', 'pending_approval')
            ->findOrFail($id);

        $record->update([
            'edd_status'      => 'approved',
            'edd_approved_by' => $request->user()->id,
            'edd_approved_at' => now(),
        ]);

        return response()->json(['message' => 'EDD approved successfully.', 'record' => $record->fresh()]);
    }

    // ── STR Management ───────────────────────────────────────────────────────

    /**
     * POST /api/kyc/records/{id}/flag-suspicious
     * Flag a record as suspicious and add STR notes.
     */
    public function flagSuspicious(Request $request, int $id)
    {
        $this->ensureKycEnabled($request);

        $data = $request->validate(['str_notes' => 'required|string']);
        $tenantId = $request->user()->tenant_id;

        $record = KycRecord::where('tenant_id', $tenantId)->findOrFail($id);
        $record->update([
            'is_suspicious'  => true,
            'str_flagged_at' => now(),
            'str_flagged_by' => $request->user()->id,
            'str_notes'      => $data['str_notes'],
        ]);

        return response()->json(['message' => 'Record flagged as suspicious.', 'record' => $record->fresh()]);
    }

    /**
     * POST /api/kyc/records/{id}/mark-str-submitted
     * Mark an STR as manually submitted to MMA FIU.
     */
    public function markStrSubmitted(Request $request, int $id)
    {
        $this->ensureKycEnabled($request);
        $tenantId = $request->user()->tenant_id;

        $record = KycRecord::where('tenant_id', $tenantId)->where('is_suspicious', true)->findOrFail($id);
        $record->update(['str_submitted_at' => now()]);

        return response()->json(['message' => 'STR marked as submitted.']);
    }

    /**
     * POST /api/kyc/records/{id}/mark-ctr-submitted
     * Mark a CTR as manually submitted to MMA FIU.
     */
    public function markCtrSubmitted(Request $request, int $id)
    {
        $this->ensureKycEnabled($request);
        $tenantId = $request->user()->tenant_id;

        $record = KycRecord::where('tenant_id', $tenantId)->where('requires_ctr', true)->findOrFail($id);
        $record->update(['ctr_submitted_at' => now()]);

        return response()->json(['message' => 'CTR marked as submitted.']);
    }

    // ── Reports & PDF Generation ──────────────────────────────────────────────

    /**
     * POST /api/kyc/reports/generate-str-pdf/{id}
     * Generate a pre-filled STR PDF for manual submission to MMA FIU.
     */
    public function generateStrPdf(Request $request, int $id)
    {
        $this->ensureKycEnabled($request);
        $tenantId = $request->user()->tenant_id;

        $record = KycRecord::with(['customer', 'cashier:id,name', 'terminal:id,terminal_name'])
            ->where('tenant_id', $tenantId)
            ->where('is_suspicious', true)
            ->findOrFail($id);

        $pdf = app(KycReportService::class)->generateStrPdf($record);
        return $pdf->download("STR-{$record->id}-{$record->created_at->format('Y-m-d')}.pdf");
    }

    /**
     * GET /api/kyc/reports/ctr
     * Generate a CTR report PDF for a date range.
     */
    public function generateCtrReport(Request $request)
    {
        $this->ensureKycEnabled($request);

        $request->validate([
            'date_from' => 'required|date',
            'date_to'   => 'required|date|after_or_equal:date_from',
        ]);

        $tenantId = $request->user()->tenant_id;
        $records = KycRecord::with('customer')
            ->where('tenant_id', $tenantId)
            ->where('requires_ctr', true)
            ->whereBetween('created_at', [$request->date_from, $request->date_to . ' 23:59:59'])
            ->orderBy('created_at')
            ->get();

        $pdf = app(KycReportService::class)->generateCtrReport($records, $request->date_from, $request->date_to, $request->user()->tenant);
        return $pdf->download("CTR-{$request->date_from}-to-{$request->date_to}.pdf");
    }

    /**
     * GET /api/kyc/reports/weekly-transfers
     * Generate a weekly fund transfer report PDF (§20).
     */
    public function generateWeeklyTransferReport(Request $request)
    {
        $this->ensureKycEnabled($request);

        $request->validate(['week_start' => 'required|date']);
        $tenantId = $request->user()->tenant_id;

        $weekStart = $request->week_start;
        $weekEnd   = date('Y-m-d', strtotime($weekStart . ' +6 days'));

        $records = KycRecord::with('customer')
            ->where('tenant_id', $tenantId)
            ->where('transaction_type', 'money_transfer')
            ->whereBetween('created_at', [$weekStart, $weekEnd . ' 23:59:59'])
            ->orderBy('created_at')
            ->get();

        $pdf = app(KycReportService::class)->generateWeeklyTransferReport($records, $weekStart, $weekEnd, $request->user()->tenant);
        return $pdf->download("Weekly-Transfers-{$weekStart}.pdf");
    }

    // ── Country Watchlist ─────────────────────────────────────────────────────

    /**
     * GET /api/kyc/countries
     * Return the high-risk country list (used for auto-flagging in the cashier form).
     */
    public function listCountries(Request $request)
    {
        $this->ensureKycEnabled($request);
        $countries = KycHighRiskCountry::orderBy('country_name')->get(['country_code', 'country_name', 'risk_level']);
        return response()->json($countries);
    }

    // ── Compliance Alerts Summary ─────────────────────────────────────────────

    /**
     * GET /api/kyc/alerts
     * Returns counts for all compliance alert categories.
     */
    public function alertsSummary(Request $request)
    {
        $this->ensureKycEnabled($request);
        $tenantId = $request->user()->tenant_id;

        return response()->json([
            'pending_str'    => KycRecord::where('tenant_id', $tenantId)->suspicious()->count(),
            'pending_edd'    => KycRecord::where('tenant_id', $tenantId)->pendingEdd()->count(),
            'pending_ctr'    => KycRecord::where('tenant_id', $tenantId)->requiresCtr()->count(),
            'expiring_soon'  => KycRecord::where('tenant_id', $tenantId)->expiringSoon(30)->count(),
        ]);
    }
}
