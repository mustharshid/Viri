# Bank of Maldives Internet Banking API Integration Guide

## Document Purpose
This document provides a comprehensive technical specification for integrating with the Bank of Maldives (BML) Internet Banking API. It is designed to be consumed by AI agents and developers for building legitimate integrations with proper authorization.

More examples are included in this document's folder.
---

## Document Version
- **Version:** 1.0
- **Date:** 2023-06-10
- **Base URL:** `https://www.bankofmaldives.com.mv/internetbanking`
- **API Type:** REST/JSON with Inertia.js framework

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Authentication Flow](#authentication-flow)
3. [Session Management](#session-management)
4. [API Endpoints](#api-endpoints)
5. [Request Headers](#request-headers)
6. [Complete Implementation Guide](#complete-implementation-guide)
7. [Error Handling](#error-handling)
8. [Security Considerations](#security-considerations)
9. [Quick Reference Card](#quick-reference-card)
10. [Testing & Validation](#testing--validation)
11. [Troubleshooting](#troubleshooting-common-issues)
12. [Appendix](#appendix)

---

## 1. Architecture Overview

### Technology Stack
- **Backend Framework:** Laravel PHP
- **Frontend Framework:** Inertia.js with Vue.js
- **Security:** CSRF Protection via XSRF tokens
- **Authentication:** Session-based with 2FA
- **API Format:** JSON
- **Rate Limiting:** 60 requests per minute

### Key Characteristics
- All API requests require CSRF protection via `X-XSRF-TOKEN` header
- Authentication uses session cookies (not JWT)
- The `X-Inertia` header is required for AJAX requests
- Profile selection is handled via URL navigation, not POST requests
- Account history is retrieved through separate endpoints

---

## 2. Authentication Flow

### Flow Diagram
Step 1: GET /web/login
↓ (Extract XSRF Token)
Step 2: POST /web/login (username + password)
↓ (Successful → 200 OK)
Step 3: POST /web/login/2fa (OTP code)
↓ (Successful → 200 OK)
Step 4: GET /web/profile (List profiles)
↓ (Select Profile)
Step 5: GET /web/profile/{profile_id}
↓ (May return 409 with redirect)
Step 6: GET /vf/accounts/overview (Dashboard)


### Prerequisites
- Valid online banking credentials
- Authenticator app or SMS-based OTP capability
- Valid session cookies

---

## 3. Session Management

### Cookie Handling
The API uses two critical cookies:
1. **XSRF-TOKEN**: CSRF protection token (must be extracted and sent)
2. **laravel_session**: Session identifier (automatically handled)

### Token Rotation
- XSRF tokens change with each major request (login → 2FA → dashboard)
- Always fetch a fresh token before making state-changing requests
- Extract tokens from cookies or response headers

---

## 4. API Endpoints

### 4.1 Initial XSRF Token Retrieval
GET /web/login

**Purpose:** Retrieve initial CSRF token

**Headers:**
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36


**Response:** HTML page containing XSRF cookie

**Token Extraction:**
XSRF-TOKEN = cookie.value (URL-decode)

---

### 4.2 Login Authentication
POST /web/login


**Purpose:** Authenticate user with username and password

**Headers:**
```http
Accept: text/html, application/xhtml+xml
Content-Type: application/json
X-Inertia: true
X-Requested-With: XMLHttpRequest
X-XSRF-TOKEN: {xsrf_token}
Referer: https://www.bankofmaldives.com.mv/internetbanking/web/login
User-Agent: {standard_browser_user_agent}
Request Body:

json
{
  "username": "your_username",
  "password": "your_password"
}
Success Response:

json
{
  // Redirects to /web/login/2fa for OTP
}
Failure Response:

json
{
  "error": "Invalid credentials"
}

4.3 Two-Factor Authentication (2FA)

POST /web/login/2fa
Purpose: Verify OTP code

Headers:

http
Accept: text/html, application/xhtml+xml
Content-Type: application/json
X-Inertia: true
X-Requested-With: XMLHttpRequest
X-XSRF-TOKEN: {xsrf_token}
Referer: https://www.bankofmaldives.com.mv/internetbanking/web/login/2fa
User-Agent: {standard_browser_user_agent}
Request Body:

json
{
  "otp": "123456"
}
Success Response:

json
{
  // Redirects to /web/profile
}
4.4 Profile Selection
4.4.1 List Available Profiles
GET /web/profile
Purpose: Get list of available profiles (personal/business)

Headers:

http
Accept: text/html, application/xhtml+xml
X-Inertia: true
X-Requested-With: XMLHttpRequest
X-XSRF-TOKEN: {xsrf_token}
Referer: https://www.bankofmaldives.com.mv/internetbanking/web/login/2fa
4.4.2 Select Specific Profile
GET /web/profile/{profile_id}
Purpose: Navigate to a specific profile

Headers:

http
Accept: text/html, application/xhtml+xml
X-Inertia: true
X-Requested-With: XMLHttpRequest
X-XSRF-TOKEN: {xsrf_token}
Referer: https://www.bankofmaldives.com.mv/internetbanking/web/profile
Profile ID Format: UUID (e.g., 55706095-F725-E711-80E8-00155D020F0A)

Special Response (409 Conflict):
When a 409 status is returned, the system requires a redirect to the location specified in:

X-Inertia-Location: /internetbanking/web/redirect
4.5 Account Management
4.5.1 Get Dashboard Overview
GET /api/dashboard
Purpose: Retrieve all accounts with balances

Headers:

http
Accept: application/json, text/plain, */*
Authorization: Bearer
X-XSRF-TOKEN: {xsrf_token}
Referer: https://www.bankofmaldives.com.mv/internetbanking/vf/accounts/overview
Response:

json
{
  "accounts": [
    {
      "id": "AD2ADF9D-46CE-E511-80D7-00155D020F0A",
      "account_number": "7701111524001",
      "alias": "MOHD.M.",
      "balance": 10000.50,
      "currency": "MVR"
    }
  ]
}
4.5.2 Get Account Details
text
GET /api/account/{account_id}
Purpose: Get specific account details

Headers:

http
Accept: application/json, text/plain, */*
Authorization: Bearer
X-XSRF-TOKEN: {xsrf_token}
Referer: https://www.bankofmaldives.com.mv/internetbanking/vf/accounts/overview
Account ID Format: UUID (e.g., AD2ADF9D-46CE-E511-80D7-00155D020F0A)

4.5.3 Get Today's Transactions
text
GET /api/account/{account_id}/history/today
Purpose: Retrieve transactions for the current day

Headers:

http
Accept: application/json, text/plain, */*
Authorization: Bearer
X-XSRF-TOKEN: {xsrf_token}
Referer: https://www.bankofmaldives.com.mv/internetbanking/vf/accounts/{account_id}
Response:

json
{
  "transactions": [
    {
      "id": "transaction_uuid",
      "date": "2026-06-19",
      "description": "Transfer to ACCOUNT X",
      "amount": -100.50,
      "balance": 9900.00,
      "type": "debit"
    }
  ]
}
4.5.4 Get Pending Transactions
GET /api/history/pending/{account_id}
Purpose: Retrieve pending/uncleared transactions

Headers:

http
Accept: application/json, text/plain, */*
Authorization: Bearer
X-XSRF-TOKEN: {xsrf_token}
Referer: https://www.bankofmaldives.com.mv/internetbanking/vf/accounts/{account_id}
4.5.5 Get Additional Account Types
text
GET /api/account/{account_id} (for credit cards)
GET /api/transfer (for transfer history)
GET /api/contacts (for beneficiary contacts)
GET /api/profile (for user profile info)
5. Request Headers
Common Headers for All Requests
Header	Value	Required	Notes
X-XSRF-TOKEN	Token from cookie	Yes	Must be URL-decoded
X-Inertia	true	Yes	For AJAX requests
X-Requested-With	XMLHttpRequest	Yes	Prevents CSRF
User-Agent	Browser UA string	Yes	Must be realistic
Accept	application/json or text/html	Yes	Varies by endpoint
Referer	Previous page URL	Yes	Must match navigation flow
Content-Type	application/json	Yes	For POST requests
Optional Headers
Header	Value	Purpose
Authorization	Bearer	Session placeholder (usually empty)
6. Complete Implementation Guide
6.1 JavaScript Implementation (Browser/Node.js)
javascript
class BMLBankingAPI {
  constructor() {
    this.baseUrl = 'https://www.bankofmaldives.com.mv/internetbanking';
    this.cookies = {};
    this.xsrfToken = null;
    this.sessionCookie = null;
  }

  /**
   * Step 1: Initialize session and get XSRF token
   */
  async initializeSession() {
    const response = await fetch(`${this.baseUrl}/web/login`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    // Extract cookies from response
    const cookieHeader = response.headers.get('set-cookie');
    if (cookieHeader) {
      const cookies = this.parseCookies(cookieHeader);
      this.xsrfToken = this.getCookieValue(cookies, 'XSRF-TOKEN');
      this.sessionCookie = this.getCookieValue(cookies, 'laravel_session');
    }

    return this.xsrfToken;
  }

  /**
   * Step 2: Login with credentials
   */
  async login(username, password) {
    if (!this.xsrfToken) {
      await this.initializeSession();
    }

    const response = await fetch(`${this.baseUrl}/web/login`, {
      method: 'POST',
      headers: {
        'Accept': 'text/html, application/xhtml+xml',
        'Content-Type': 'application/json',
        'X-Inertia': 'true',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': this.xsrfToken,
        'Referer': `${this.baseUrl}/web/login`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status}`);
    }

    // Extract new XSRF token if rotated
    const newToken = this.extractXsrfFromResponse(response);
    if (newToken) this.xsrfToken = newToken;

    return response.json();
  }

  /**
   * Step 3: Verify OTP
   */
  async verifyOtp(otpCode) {
    // Get fresh XSRF token for 2FA
    await this.getFreshXsrfToken('/web/login/2fa');

    const response = await fetch(`${this.baseUrl}/web/login/2fa`, {
      method: 'POST',
      headers: {
        'Accept': 'text/html, application/xhtml+xml',
        'Content-Type': 'application/json',
        'X-Inertia': 'true',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': this.xsrfToken,
        'Referer': `${this.baseUrl}/web/login/2fa`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      credentials: 'include',
      body: JSON.stringify({ otp: otpCode })
    });

    if (!response.ok) {
      throw new Error(`OTP verification failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Step 4: Select Profile
   */
  async selectProfile(profileId) {
    const response = await fetch(`${this.baseUrl}/web/profile/${profileId}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/html, application/xhtml+xml',
        'X-Inertia': 'true',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': this.xsrfToken,
        'Referer': `${this.baseUrl}/web/profile`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      credentials: 'include'
    });

    // Handle 409 Conflict - follow redirect
    if (response.status === 409) {
      const redirectUrl = response.headers.get('X-Inertia-Location');
      if (redirectUrl) {
        return this.followRedirect(redirectUrl);
      }
    }

    return response;
  }

  /**
   * Step 5: Get Account Dashboard
   */
  async getDashboard() {
    // Navigate to accounts overview first
    await this.navigateToAccounts();

    const response = await fetch(`${this.baseUrl}/api/dashboard`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': 'Bearer',
        'X-XSRF-TOKEN': this.xsrfToken,
        'Referer': `${this.baseUrl}/vf/accounts/overview`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      credentials: 'include'
    });

    return response.json();
  }

  /**
   * Step 6: Get Account History
   */
  async getAccountHistory(accountId) {
    const response = await fetch(`${this.baseUrl}/api/account/${accountId}/history/today`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': 'Bearer',
        'X-XSRF-TOKEN': this.xsrfToken,
        'Referer': `${this.baseUrl}/vf/accounts/${accountId}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      credentials: 'include'
    });

    return response.json();
  }

  /**
   * Step 7: Get Pending Transactions
   */
  async getPendingTransactions(accountId) {
    const response = await fetch(`${this.baseUrl}/api/history/pending/${accountId}`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': 'Bearer',
        'X-XSRF-TOKEN': this.xsrfToken,
        'Referer': `${this.baseUrl}/vf/accounts/${accountId}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      credentials: 'include'
    });

    return response.json();
  }

  // ====================== Helper Methods ======================

  /**
   * Navigate to accounts overview (required before API calls)
   */
  async navigateToAccounts() {
    await fetch(`${this.baseUrl}/vf/accounts/overview`, {
      headers: {
        'X-Inertia': 'true',
        'X-XSRF-TOKEN': this.xsrfToken,
        'Referer': `${this.baseUrl}/web/redirect`
      },
      credentials: 'include'
    });
  }

  /**
   * Follow Inertia redirect
   */
  async followRedirect(url) {
    return fetch(url, {
      headers: {
        'X-Inertia': 'true',
        'X-XSRF-TOKEN': this.xsrfToken
      },
      credentials: 'include'
    });
  }

  /**
   * Get fresh XSRF token from a specific page
   */
  async getFreshXsrfToken(path) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      credentials: 'include'
    });

    const newToken = this.extractXsrfFromResponse(response);
    if (newToken) this.xsrfToken = newToken;
    return this.xsrfToken;
  }

  /**
   * Parse cookies from Set-Cookie header
   */
  parseCookies(cookieHeader) {
    const cookies = {};
    if (Array.isArray(cookieHeader)) {
      cookieHeader.forEach(cookie => {
        const [nameValue] = cookie.split(';');
        const [name, value] = nameValue.trim().split('=');
        cookies[name] = decodeURIComponent(value);
      });
    }
    return cookies;
  }

  /**
   * Get cookie value by name
   */
  getCookieValue(cookies, name) {
    return cookies[name] || null;
  }

  /**
   * Extract XSRF token from response
   */
  extractXsrfFromResponse(response) {
    const cookieHeader = response.headers.get('set-cookie');
    if (cookieHeader) {
      const cookies = this.parseCookies(cookieHeader);
      return this.getCookieValue(cookies, 'XSRF-TOKEN');
    }
    return null;
  }

  /**
   * Complete login flow
   */
  async completeLoginFlow(username, password, otpCode, profileId) {
    try {
      // Step 1: Initialize session
      await this.initializeSession();
      console.log('✓ Session initialized');

      // Step 2: Login
      await this.login(username, password);
      console.log('✓ Login successful');

      // Step 3: Verify OTP
      await this.verifyOtp(otpCode);
      console.log('✓ OTP verified');

      // Step 4: Select profile
      await this.selectProfile(profileId);
      console.log('✓ Profile selected');

      // Step 5: Get dashboard
      const dashboard = await this.getDashboard();
      console.log('✓ Dashboard retrieved');
      
      // Step 6: Get account history
      const accountId = dashboard.accounts[0].id;
      const history = await this.getAccountHistory(accountId);
      console.log('✓ Account history retrieved');

      return {
        dashboard,
        history,
        accountId
      };

    } catch (error) {
      console.error('Login flow failed:', error);
      throw error;
    }
  }
}
6.2 PHP Implementation (Laravel/HTTP)
php
<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class BankOfMaldivesService
{
    private $baseUrl = 'https://www.bankofmaldives.com.mv/internetbanking';
    private $xsrfToken;
    private $cookies = [];
    private $sessionCookie;

    /**
     * Initialize session and get XSRF token
     */
    public function initializeSession(): string
    {
        $response = Http::withHeaders([
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])->get($this->baseUrl . '/web/login');

        // Extract cookies
        $cookies = $response->cookies();
        foreach ($cookies as $cookie) {
            if ($cookie->getName() === 'XSRF-TOKEN') {
                $this->xsrfToken = urldecode($cookie->getValue());
                $this->cookies[$cookie->getName()] = $cookie->getValue();
            }
            if ($cookie->getName() === 'laravel_session') {
                $this->sessionCookie = $cookie->getValue();
            }
        }

        return $this->xsrfToken;
    }

    /**
     * Login with credentials
     */
    public function login(string $username, string $password): array
    {
        if (!$this->xsrfToken) {
            $this->initializeSession();
        }

        $response = Http::withHeaders([
            'Accept' => 'text/html, application/xhtml+xml',
            'Content-Type' => 'application/json',
            'X-Inertia' => 'true',
            'X-Requested-With' => 'XMLHttpRequest',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . '/web/login',
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])
        ->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->post($this->baseUrl . '/web/login', [
            'username' => $username,
            'password' => $password
        ]);

        if (!$response->successful()) {
            throw new \Exception('Login failed: ' . $response->status());
        }

        // Extract new XSRF token if rotated
        $this->extractXsrfFromResponse($response);

        return $response->json() ?? [];
    }

    /**
     * Verify OTP
     */
    public function verifyOtp(string $otp): array
    {
        // Get fresh token from 2FA page
        $this->getFreshXsrfToken('/web/login/2fa');

        $response = Http::withHeaders([
            'Accept' => 'text/html, application/xhtml+xml',
            'Content-Type' => 'application/json',
            'X-Inertia' => 'true',
            'X-Requested-With' => 'XMLHttpRequest',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . '/web/login/2fa',
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])
        ->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->post($this->baseUrl . '/web/login/2fa', [
            'otp' => $otp
        ]);

        if (!$response->successful()) {
            throw new \Exception('OTP verification failed: ' . $response->status());
        }

        return $response->json() ?? [];
    }

    /**
     * Select Profile
     */
    public function selectProfile(string $profileId): void
    {
        $response = Http::withHeaders([
            'Accept' => 'text/html, application/xhtml+xml',
            'X-Inertia' => 'true',
            'X-Requested-With' => 'XMLHttpRequest',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . '/web/profile',
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])
        ->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->get($this->baseUrl . "/web/profile/{$profileId}");

        // Handle 409 Conflict - follow redirect
        if ($response->status() === 409) {
            $redirectUrl = $response->header('X-Inertia-Location');
            if ($redirectUrl) {
                Http::withHeaders(['X-Inertia' => 'true'])
                    ->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
                    ->get($redirectUrl);
            }
        }
    }

    /**
     * Get Account Dashboard
     */
    public function getDashboard(): array
    {
        $this->navigateToAccounts();

        $response = Http::withHeaders([
            'Accept' => 'application/json, text/plain, */*',
            'Authorization' => 'Bearer',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . '/vf/accounts/overview',
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])
        ->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->get($this->baseUrl . '/api/dashboard');

        if (!$response->successful()) {
            throw new \Exception('Failed to get dashboard: ' . $response->status());
        }

        return $response->json();
    }

    /**
     * Get Account History
     */
    public function getAccountHistory(string $accountId): array
    {
        $response = Http::withHeaders([
            'Accept' => 'application/json, text/plain, */*',
            'Authorization' => 'Bearer',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . "/vf/accounts/{$accountId}",
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])
        ->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->get($this->baseUrl . "/api/account/{$accountId}/history/today");

        if (!$response->successful()) {
            throw new \Exception('Failed to get account history: ' . $response->status());
        }

        return $response->json();
    }

    /**
     * Get Pending Transactions
     */
    public function getPendingTransactions(string $accountId): array
    {
        $response = Http::withHeaders([
            'Accept' => 'application/json, text/plain, */*',
            'Authorization' => 'Bearer',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . "/vf/accounts/{$accountId}",
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])
        ->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->get($this->baseUrl . "/api/history/pending/{$accountId}");

        if (!$response->successful()) {
            throw new \Exception('Failed to get pending transactions: ' . $response->status());
        }

        return $response->json();
    }

    // ====================== Helper Methods ======================

    /**
     * Navigate to accounts overview
     */
    private function navigateToAccounts(): void
    {
        Http::withHeaders([
            'X-Inertia' => 'true',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . '/web/redirect'
        ])
        ->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->get($this->baseUrl . '/vf/accounts/overview');
    }

    /**
     * Get fresh XSRF token from specific page
     */
    private function getFreshXsrfToken(string $path): void
    {
        $response = Http::withHeaders([
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])
        ->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->get($this->baseUrl . $path);

        $this->extractXsrfFromResponse($response);
    }

    /**
     * Extract XSRF token from response
     */
    private function extractXsrfFromResponse($response): void
    {
        $cookies = $response->cookies();
        foreach ($cookies as $cookie) {
            if ($cookie->getName() === 'XSRF-TOKEN') {
                $this->xsrfToken = urldecode($cookie->getValue());
                $this->cookies[$cookie->getName()] = $cookie->getValue();
                break;
            }
        }
    }

    /**
     * Complete login flow
     */
    public function completeLoginFlow(
        string $username, 
        string $password, 
        string $otpCode, 
        string $profileId
    ): array {
        try {
            // Step 1: Initialize session
            $this->initializeSession();
            Log::info('Session initialized');

            // Step 2: Login
            $this->login($username, $password);
            Log::info('Login successful');

            // Step 3: Verify OTP
            $this->verifyOtp($otpCode);
            Log::info('OTP verified');

            // Step 4: Select profile
            $this->selectProfile($profileId);
            Log::info('Profile selected');

            // Step 5: Get dashboard
            $dashboard = $this->getDashboard();
            Log::info('Dashboard retrieved');

            // Step 6: Get account history
            $accountId = $dashboard['accounts'][0]['id'] ?? null;
            if ($accountId) {
                $history = $this->getAccountHistory($accountId);
                $pending = $this->getPendingTransactions($accountId);
                
                return [
                    'success' => true,
                    'dashboard' => $dashboard,
                    'history' => $history,
                    'pending' => $pending,
                    'accountId' => $accountId
                ];
            }

            return [
                'success' => true,
                'dashboard' => $dashboard
            ];

        } catch (\Exception $e) {
            Log::error('Login flow failed: ' . $e->getMessage());
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
}
6.3 Python Implementation
python
import requests
import json
from typing import Dict, Any, Optional
from urllib.parse import unquote

class BMLBankingAPI:
    def __init__(self):
        self.base_url = 'https://www.bankofmaldives.com.mv/internetbanking'
        self.session = requests.Session()
        self.xsrf_token = None
        self.session_cookie = None
        
    def initialize_session(self) -> str:
        """Step 1: Initialize session and get XSRF token"""
        response = self.session.get(
            f'{self.base_url}/web/login',
            headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        )
        
        # Extract XSRF token from cookies
        for cookie in self.session.cookies:
            if cookie.name == 'XSRF-TOKEN':
                self.xsrf_token = unquote(cookie.value)
            if cookie.name == 'laravel_session':
                self.session_cookie = cookie.value
                
        return self.xsrf_token
    
    def login(self, username: str, password: str) -> Dict[str, Any]:
        """Step 2: Login with credentials"""
        if not self.xsrf_token:
            self.initialize_session()
            
        response = self.session.post(
            f'{self.base_url}/web/login',
            json={'username': username, 'password': password},
            headers={
                'Accept': 'text/html, application/xhtml+xml',
                'Content-Type': 'application/json',
                'X-Inertia': 'true',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/web/login',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        
        if response.status_code != 200:
            raise Exception(f'Login failed: {response.status_code}')
            
        # Update XSRF token if rotated
        self._extract_xsrf_from_cookies()
        return response.json() if response.text else {}
    
    def verify_otp(self, otp_code: str) -> Dict[str, Any]:
        """Step 3: Verify OTP"""
        # Get fresh token from 2FA page
        self._get_fresh_xsrf_token('/web/login/2fa')
        
        response = self.session.post(
            f'{self.base_url}/web/login/2fa',
            json={'otp': otp_code},
            headers={
                'Accept': 'text/html, application/xhtml+xml',
                'Content-Type': 'application/json',
                'X-Inertia': 'true',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/web/login/2fa',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        
        if response.status_code != 200:
            raise Exception(f'OTP verification failed: {response.status_code}')
            
        return response.json() if response.text else {}
    
    def select_profile(self, profile_id: str) -> Optional[requests.Response]:
        """Step 4: Select Profile"""
        response = self.session.get(
            f'{self.base_url}/web/profile/{profile_id}',
            headers={
                'Accept': 'text/html, application/xhtml+xml',
                'X-Inertia': 'true',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/web/profile',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        
        # Handle 409 - follow redirect
        if response.status_code == 409:
            redirect_url = response.headers.get('X-Inertia-Location')
            if redirect_url:
                return self.session.get(
                    redirect_url,
                    headers={'X-Inertia': 'true', 'X-XSRF-TOKEN': self.xsrf_token}
                )
                
        return response
    
    def get_dashboard(self) -> Dict[str, Any]:
        """Step 5: Get Account Dashboard"""
        # Navigate to accounts overview first
        self._navigate_to_accounts()
        
        response = self.session.get(
            f'{self.base_url}/api/dashboard',
            headers={
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Bearer',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/vf/accounts/overview',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        
        if response.status_code != 200:
            raise Exception(f'Failed to get dashboard: {response.status_code}')
            
        return response.json()
    
    def get_account_history(self, account_id: str) -> Dict[str, Any]:
        """Step 6: Get Account History"""
        response = self.session.get(
            f'{self.base_url}/api/account/{account_id}/history/today',
            headers={
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Bearer',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/vf/accounts/{account_id}',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        
        if response.status_code != 200:
            raise Exception(f'Failed to get account history: {response.status_code}')
            
        return response.json()
    
    def get_pending_transactions(self, account_id: str) -> Dict[str, Any]:
        """Step 7: Get Pending Transactions"""
        response = self.session.get(
            f'{self.base_url}/api/history/pending/{account_id}',
            headers={
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Bearer',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/vf/accounts/{account_id}',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        
        if response.status_code != 200:
            raise Exception(f'Failed to get pending transactions: {response.status_code}')
            
        return response.json()
    
    # ====================== Helper Methods ======================
    
    def _navigate_to_accounts(self) -> None:
        """Navigate to accounts overview"""
        self.session.get(
            f'{self.base_url}/vf/accounts/overview',
            headers={
                'X-Inertia': 'true',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/web/redirect'
            }
        )
    
    def _get_fresh_xsrf_token(self, path: str) -> None:
        """Get fresh XSRF token from specific page"""
        self.session.get(
            f'{self.base_url}{path}',
            headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        )
        self._extract_xsrf_from_cookies()
    
    def _extract_xsrf_from_cookies(self) -> None:
        """Extract XSRF token from session cookies"""
        for cookie in self.session.cookies:
            if cookie.name == 'XSRF-TOKEN':
                self.xsrf_token = unquote(cookie.value)
                break
    
    def complete_login_flow(self, username: str, password: str, 
                           otp_code: str, profile_id: str) -> Dict[str, Any]:
        """Complete login flow - all steps combined"""
        try:
            # Step 1: Initialize session
            self.initialize_session()
            print('✓ Session initialized')
            
            # Step 2: Login
            self.login(username, password)
            print('✓ Login successful')
            
            # Step 3: Verify OTP
            self.verify_otp(otp_code)
            print('✓ OTP verified')
            
            # Step 4: Select profile
            self.select_profile(profile_id)
            print('✓ Profile selected')
            
            # Step 5: Get dashboard
            dashboard = self.get_dashboard()
            print('✓ Dashboard retrieved')
            
            # Step 6: Get account history
            account_id = dashboard['accounts'][0]['id']
            history = self.get_account_history(account_id)
            pending = self.get_pending_transactions(account_id)
            print('✓ Account history retrieved')
            
            return {
                'success': True,
                'dashboard': dashboard,
                'history': history,
                'pending': pending,
                'account_id': account_id
            }
            
        except Exception as e:
            print(f'✗ Login flow failed: {str(e)}')
            return {
                'success': False,
                'error': str(e)
            }
7. Error Handling
Common HTTP Status Codes
Status	Meaning	Handling
200	Success	Process response
409	Conflict (Inertia redirect)	Follow X-Inertia-Location header
401	Unauthorized	Invalid credentials - retry
429	Too Many Requests	Wait and retry (rate limit)
500	Server Error	Retry with exponential backoff
Rate Limiting Headers
X-Ratelimit-Limit: 60
X-Ratelimit-Remaining: 54
Error Handling Template
javascript
async function handleApiResponse(response) {
    if (response.status === 200) {
        return await response.json();
    }
    
    if (response.status === 409) {
        const redirectUrl = response.headers.get('X-Inertia-Location');
        return { redirect: redirectUrl };
    }
    
    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        return retryRequest();
    }
    
    if (response.status === 401) {
        throw new Error('Session expired. Please re-authenticate.');
    }
    
    throw new Error(`API error: ${response.status}`);
}
8. Security Considerations
⚠️ Important Security Guidelines
Never hardcode credentials in application code

Store tokens securely using environment variables or secure storage

Implement proper session management with token rotation

Log all authentication attempts for audit purposes

Use HTTPS exclusively (all endpoints use HTTPS)

Validate all responses before processing

Implement proper logout to invalidate sessions

Respect rate limits to avoid being blocked

Handle token expiration gracefully

Do not store sensitive data in web servers

Secure Credential Storage
Environment Variables (.env)
BML_USERNAME=your_username
BML_PASSWORD=your_encrypted_password
BML_PROFILE_ID=your_profile_id
Secure Vault (Production)
javascript
// Use AWS Secrets Manager, HashiCorp Vault, or similar
const credentials = await vault.get('bml-credentials');
Session Timeout
Sessions expire after inactivity (typically 30 minutes)

Implement auto-refresh or re-authentication flow

Handle 401 responses gracefully

Logging
javascript
// Log all API interactions (without sensitive data)
function logApiAction(action, status, data) {
    console.log({
        timestamp: new Date().toISOString(),
        action: action,
        status: status,
        accountId: data.accountId || null,
        // DO NOT log: passwords, OTP codes, full account numbers
    });
}
9. Quick Reference Card
Complete Login Flow (JavaScript)
javascript
const api = new BMLBankingAPI();

const result = await api.completeLoginFlow(
    'YOUR_USERNAME',
    'YOUR_PASSWORD',
    '123456',  // OTP from authenticator app
    '55706095-F725-E711-80E8-00155D020F0A'  // Profile ID
);

if (result.success) {
    console.log('Dashboard:', result.dashboard);
    console.log('History:', result.history);
    console.log('Pending:', result.pending);
}
Key Endpoints Quick List
Endpoint	Method	Purpose
/web/login	GET	Get XSRF token
/web/login	POST	Login
/web/login/2fa	POST	Verify OTP
/web/profile	GET	List profiles
/web/profile/{id}	GET	Select profile
/api/dashboard	GET	Account overview
/api/account/{id}	GET	Account details
/api/account/{id}/history/today	GET	Today's transactions
/api/history/pending/{id}	GET	Pending transactions
/api/transfer	GET	Transfer history
/api/contacts	GET	Beneficiary contacts
/api/profile	GET	User profile info

10. Testing & Validation
Test Credentials
Use sandbox/test environment if available

Never test with real credentials in production

Create test accounts with limited balances

Validation Checklist
XSRF token successfully extracted

Login returns 200 OK

OTP verification succeeds

Profile selection loads correctly

Dashboard returns account list

Account history includes transactions

Pending transactions endpoint works

Rate limit headers are respected

Session persists across requests

409 redirects are handled correctly

11. Troubleshooting Common Issues
Issue 1: XSRF Token Missing
Solution: Ensure you're extracting the token from the /web/login page before making POST requests.

Issue 2: 409 Conflict Error
Solution: This is normal. Handle by following the X-Inertia-Location header.

Issue 3: Session Expired
Solution: Re-authenticate and get fresh tokens.

Issue 4: Rate Limited
Solution: Wait for X-Ratelimit-Reset time before retrying.

Issue 5: Invalid OTP
Solution: Verify the OTP is from the correct authenticator app and hasn't expired.

12. Appendix
Example Response: Dashboard
json
{
  "accounts": [
    {
      "id": "AD2ADF9D-46CE-E511-80D7-00155D020F0A",
      "account_number": "7701133527001",
      "alias": "AHD.M.",
      "balance": 10000.50,
      "currency": "MVR",
      "type": "savings"
    },
    {
      "id": "4ADBF1AA-D895-EC11-8161-00155D0C4A07",
      "account_number": "7770033376915",
      "alias": "M AHMED",
      "balance": 25000.00,
      "currency": "MVR",
      "type": "current"
    }
  ]
}
Example Response: Transaction History
json
{
  "transactions": [
    {
      "id": "txn_abc123",
      "date": "2026-06-19",
      "description": "Transfer to 7701333524001",
      "amount": -100.50,
      "balance": 9900.00,
      "type": "debit"
    },
    {
      "id": "txn_def456",
      "date": "2026-06-18",
      "description": "Salary Deposit",
      "amount": 10000.00,
      "balance": 10000.50,
      "type": "credit"
    }
  ]
}
Document Metadata
Purpose: Technical integration guide for Bank of Maldives Internet Banking API

Intended Audience: Developers and AI agents building legitimate integrations

Security Level: Internal use only - contains API specifications

Classification: Technical documentation