<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Affiliate;
use App\Models\Commission;
use App\Models\PayoutBatch;
use App\Models\ReferralAttribution;
use App\Models\ReferralPerformanceTier;
use App\Models\ReferralSystemConfig;
use App\Services\ReferralCommissionEngine;
use App\Models\SubscriptionPlan;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReferralAdminController extends Controller
{
    public function getConfig()
    {
        $config = ReferralSystemConfig::getActiveConfig();
        $tiers = ReferralPerformanceTier::orderBy('min_monthly_sales', 'asc')->get();
        $subscriptionPlans = SubscriptionPlan::orderBy('price', 'asc')->get();

        $metrics = [
            'total_affiliates' => Affiliate::count(),
            'active_affiliates' => Affiliate::where('status', 'active')->count(),
            'total_attributions' => ReferralAttribution::count(),
            'total_commissions_paid' => (float) Commission::where('status', 'PAID')->sum('commission_amount'),
            'total_commissions_pending' => (float) Commission::where('status', 'PENDING')->sum('commission_amount'),
            'total_commissions_available' => (float) Commission::where('status', 'AVAILABLE')->sum('commission_amount'),
            'pending_payout_requests' => PayoutBatch::where('status', 'REQUESTED')->count(),
        ];

        return response()->json([
            'config' => $config,
            'tiers' => $tiers,
            'subscription_plans' => $subscriptionPlans,
            'metrics' => $metrics,
        ]);
    }

    public function updateConfig(Request $request)
    {
        $validated = $request->validate([
            'payout_mode' => 'required|in:manual_request,automated_batch',
            'program_headline' => 'nullable|string|max:255',
            'min_payout_threshold' => 'required|numeric|min:0',
            'auto_payout_day_of_month' => 'required|integer|min:1|max:31',
            'customer_discount_enabled' => 'required|boolean',
            'customer_discount_type' => 'required|in:percentage,fixed_amount',
            'customer_discount_value' => 'required|numeric|min:0',
            'package_commission_rules' => 'required|array',
            'commission_grace_period_days' => 'required|integer|min:0|max:90',
            'is_active' => 'required|boolean',
        ]);

        $config = ReferralSystemConfig::getActiveConfig();
        $config->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Referral system configuration updated successfully.',
            'config' => $config,
        ]);
    }

    // Tiers CRUD
    public function listTiers()
    {
        return response()->json(ReferralPerformanceTier::orderBy('sort_order', 'asc')->orderBy('min_monthly_sales', 'asc')->get());
    }

    public function createTier(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'min_monthly_sales' => 'required|integer|min:0',
            'bonus_commission_pct' => 'required|numeric|min:0|max:100',
            'badge_color' => 'required|string|max:30',
            'description' => 'nullable|string',
            'sort_order' => 'nullable|integer',
        ]);

        $tier = ReferralPerformanceTier::create($validated);
        return response()->json(['success' => true, 'tier' => $tier]);
    }

    public function updateTier(Request $request, $id)
    {
        $tier = ReferralPerformanceTier::findOrFail($id);
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'min_monthly_sales' => 'required|integer|min:0',
            'bonus_commission_pct' => 'required|numeric|min:0|max:100',
            'badge_color' => 'required|string|max:30',
            'description' => 'nullable|string',
            'sort_order' => 'nullable|integer',
        ]);

        $tier->update($validated);
        return response()->json(['success' => true, 'tier' => $tier]);
    }

    public function deleteTier($id)
    {
        $tier = ReferralPerformanceTier::findOrFail($id);
        $tier->delete();
        return response()->json(['success' => true, 'message' => 'Tier deleted successfully.']);
    }

    // Affiliates List
    public function listAffiliates(Request $request)
    {
        $query = Affiliate::with('currentTier')->withCount('attributions');

        if ($request->has('search') && ! empty($request->search)) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('name', 'like', "%{$s}%")
                    ->orWhere('email', 'like', "%{$s}%")
                    ->orWhere('referral_code', 'like', "%{$s}%")
                    ->orWhere('custom_coupon_code', 'like', "%{$s}%");
            });
        }

        $affiliates = $query->orderBy('lifetime_earned', 'desc')->paginate(20);
        return response()->json($affiliates);
    }

    // Payouts Management
    public function listPayouts(Request $request)
    {
        $query = PayoutBatch::with('affiliate', 'processedBy');

        if ($request->has('status') && ! empty($request->status)) {
            $query->where('status', $request->status);
        }

        $payouts = $query->orderBy('created_at', 'desc')->paginate(20);
        return response()->json($payouts);
    }

    public function approvePayout(Request $request, $id)
    {
        $payout = PayoutBatch::findOrFail($id);
        if ($payout->status === 'PAID') {
            return response()->json(['error' => 'Payout is already marked as PAID.'], 400);
        }

        $validated = $request->validate([
            'transaction_receipt_ref' => 'nullable|string|max:100',
            'admin_notes' => 'nullable|string',
        ]);

        DB::transaction(function () use ($payout, $validated, $request) {
            $payout->update([
                'status' => 'PAID',
                'processed_by' => $request->user()?->id,
                'processed_at' => Carbon::now(),
                'transaction_receipt_ref' => $validated['transaction_receipt_ref'] ?? null,
                'admin_notes' => $validated['admin_notes'] ?? null,
            ]);

            // Mark associated commissions as PAID
            Commission::where('payout_batch_id', $payout->id)->update([
                'status' => 'PAID',
                'paid_at' => Carbon::now(),
            ]);

            // Update affiliate paid balance
            $affiliate = $payout->affiliate;
            if ($affiliate) {
                $affiliate->increment('paid_balance', $payout->amount);
            }
        });

        return response()->json(['success' => true, 'message' => 'Payout approved and marked as PAID.']);
    }

    public function rejectPayout(Request $request, $id)
    {
        $payout = PayoutBatch::findOrFail($id);
        if ($payout->status === 'PAID') {
            return response()->json(['error' => 'Cannot reject an already completed payout.'], 400);
        }

        $validated = $request->validate([
            'admin_notes' => 'required|string',
        ]);

        DB::transaction(function () use ($payout, $validated, $request) {
            $payout->update([
                'status' => 'REJECTED',
                'processed_by' => $request->user()?->id,
                'processed_at' => Carbon::now(),
                'admin_notes' => $validated['admin_notes'],
            ]);

            // Detach commissions and revert them to AVAILABLE
            Commission::where('payout_batch_id', $payout->id)->update([
                'payout_batch_id' => null,
                'status' => 'AVAILABLE',
            ]);

            // Refund balance back to affiliate
            $affiliate = $payout->affiliate;
            if ($affiliate) {
                $affiliate->increment('available_balance', $payout->amount);
            }
        });

        return response()->json(['success' => true, 'message' => 'Payout rejected and funds returned to affiliate available balance.']);
    }

    public function triggerBatchGeneration(ReferralCommissionEngine $engine)
    {
        $result = $engine->processAutomatedPayoutBatches();
        return response()->json([
            'success' => true,
            'message' => "Generated {$result['generated']} automated payout batches totaling MVR " . number_format($result['total_amount'], 2),
            'data' => $result,
        ]);
    }

    public function triggerMaturityCheck(ReferralCommissionEngine $engine)
    {
        $maturedCount = $engine->maturePendingCommissions();
        $engine->evaluatePerformanceTiers();
        return response()->json([
            'success' => true,
            'message' => "Matured {$maturedCount} commissions and evaluated affiliate performance tiers.",
            'matured_count' => $maturedCount,
        ]);
    }
}
