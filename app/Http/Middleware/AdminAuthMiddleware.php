<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AdminAuthMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Simple Bearer token check for Super-Admin access.
        // In a real scenario, this would validate against a hashed key or use Sanctum.
        $token = $request->bearerToken();
        
        $expectedToken = env('ADMIN_API_TOKEN');

        if (!$token || $token !== $expectedToken) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        return $next($request);
    }
}
