<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\TenantCurrency;
use App\Models\Terminal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CurrencyController extends Controller
{
    private function resolveTenantId(Request $request): ?int
    {
        if ($request->user() && $request->user()->tenant_id) {
            return (int) $request->user()->tenant_id;
        }

        if ($request->filled('hardware_id')) {
            $terminal = Terminal::where('hardware_id', $request->hardware_id)->first();
            if ($terminal && $terminal->status === 'active') {
                return (int) $terminal->tenant_id;
            }
        }

        return null;
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId = $this->resolveTenantId($request);
        if (! $tenantId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $currencies = TenantCurrency::where('tenant_id', $tenantId)
            ->orderBy('is_default', 'desc')
            ->orderBy('code', 'asc')
            ->get();

        // If no currencies exist for this tenant, seed USD and MVR defaults
        if ($currencies->isEmpty()) {
            TenantCurrency::insert([
                [
                    'tenant_id' => $tenantId,
                    'code' => 'USD',
                    'name' => 'US Dollar',
                    'symbol' => '$',
                    'buy_rate' => 15.42,
                    'sell_rate' => 17.50,
                    'is_active' => true,
                    'is_default' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'tenant_id' => $tenantId,
                    'code' => 'MVR',
                    'name' => 'Maldivian Rufiyaa',
                    'symbol' => 'Rf',
                    'buy_rate' => 1.00,
                    'sell_rate' => 1.00,
                    'is_active' => true,
                    'is_default' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);

            $currencies = TenantCurrency::where('tenant_id', $tenantId)->get();
        }

        return response()->json($currencies);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = $this->resolveTenantId($request);
        if (! $tenantId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $request->validate([
            'code' => 'required|string|max:10',
            'name' => 'required|string|max:50',
            'symbol' => 'nullable|string|max:10',
            'buy_rate' => 'nullable|numeric|min:0',
            'sell_rate' => 'nullable|numeric|min:0',
            'is_active' => 'nullable|boolean',
        ]);

        $code = strtoupper(trim($request->code));

        $currency = TenantCurrency::updateOrCreate(
            ['tenant_id' => $tenantId, 'code' => $code],
            [
                'name' => trim($request->name),
                'symbol' => $request->symbol ?: '$',
                'buy_rate' => $request->buy_rate,
                'sell_rate' => $request->sell_rate,
                'is_active' => $request->boolean('is_active', true),
            ]
        );

        return response()->json($currency, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tenantId = $this->resolveTenantId($request);
        if (! $tenantId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $currency = TenantCurrency::where('tenant_id', $tenantId)->findOrFail($id);

        $request->validate([
            'name' => 'sometimes|required|string|max:50',
            'symbol' => 'nullable|string|max:10',
            'buy_rate' => 'nullable|numeric|min:0',
            'sell_rate' => 'nullable|numeric|min:0',
            'is_active' => 'nullable|boolean',
        ]);

        $currency->update($request->only(['name', 'symbol', 'buy_rate', 'sell_rate', 'is_active']));

        return response()->json($currency);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = $this->resolveTenantId($request);
        if (! $tenantId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $currency = TenantCurrency::where('tenant_id', $tenantId)->findOrFail($id);

        if ($currency->is_default) {
            return response()->json(['error' => 'Cannot delete default base currency'], 422);
        }

        $currency->delete();

        return response()->json(['message' => 'Currency removed successfully']);
    }
}
