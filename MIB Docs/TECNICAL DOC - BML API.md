Islamic Bank of Maldives (MIB) Faisanet API Integration Guide

Document Purpose
This document provides a comprehensive technical specification for integrating with the Islamic Bank of Maldives (MIB) Faisanet Internet Banking platform. It is designed to be consumed by AI agents and developers for building legitimate integrations with proper authorization.

Document Version
Version: 1.2

Date: 2022-05-22

Base URL: https://faisanet.mib.com.mv

API Type: REST/JSON with jQuery AJAX

Table of Contents
Architecture Overview

Authentication Flow

Session Management

API Endpoints

Request Headers

Complete Implementation Guide

Error Handling

Security Considerations

1. Architecture Overview
Technology Stack
Backend: PHP

Frontend: jQuery + HTML

Authentication: Session-based with rTag token

2FA: OTP verification (Email, Mobile, WhatsApp, Authenticator)

API Format: JSON

CSRF Protection: rTag token mechanism

Key Characteristics
Authentication uses a unique rTag token that must be passed with each request

Requests are form-urlencoded (not JSON)

Session cookies (PHPSESSID) are used for authentication

The rTag token is generated server-side and must be included in POST requests

Logout is a simple POST to /aAuth/logout

2. Authentication Flow
Flow Diagram

Step 1: GET /auth
    ↓ (Extract rTag from page)
Step 2: POST /aAuth/getAuthType (username + rTag)
    ↓ (Returns auth type - 2FA required)
Step 3: POST /aAuth/xAuth (password + clientSalt + rTag)
    ↓ (Redirects to /auth2FA)
Step 4: GET /auth2FA
    ↓ (Extract new rTag)
Step 5: POST /aAuth2FA/verifyOTP (OTP + otpType)
    ↓ (Redirects to /profiles)
Step 6: GET /profiles
    ↓ (Select profile)
Step 7: POST /aProfileHandler/switchProfile (profileId + profileType + rTag)
    ↓ (Redirects to /accounts)
Step 8: GET /accounts (Dashboard)
Prerequisites
Valid online banking credentials

OTP capability (authenticator app, email, SMS, or WhatsApp)

Valid session cookies

3. Session Management
Cookie Handling
The API uses two critical cookies:

PHPSESSID: PHP session identifier (automatically handled)

rTag: CSRF protection token (must be extracted and sent with each request)

rTag Token
The rTag is a unique token generated per session

Must be included in all POST requests as a form parameter

Extracted from the HTML page or from previous responses

Format: rTag=5eaca057140e69ea151d55c921c806a8

4. API Endpoints
4.1 Initial Page Load

GET /auth
Purpose: Load the login page and extract initial rTag

Headers:


User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Response: HTML page containing rTag in the page source

rTag Extraction:

javascript
// Look for rTag in the page HTML
// Example: rTag = "c0b3ce4ba51ad90fff6a818db265a666"
4.2 Get Authentication Type

POST /aAuth/getAuthType
Purpose: Check if user exists and determine authentication method

Headers:

http
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/auth
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Request Body:


rTag=c0b3ce4ba51ad90fff6a818db265a666&pgf01=muxthasir&retain=1
Parameter	Description
rTag	CSRF protection token from the page
pgf01	Username
retain	Always 1
Success Response:

json
{
  "status": "success",
  "authType": "2fa_required" // Indicates 2FA is needed
}
4.3 Primary Authentication (xAuth)

POST /aAuth/xAuth
Purpose: Authenticate user with password and prepare for 2FA

Headers:

http
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/auth
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Request Body:


rTag=c0b3ce4ba51ad90fff6a818db265a666&pgf01=muxthasir&retain=1&pgf03=9C0013AB4B55139D65677BC9D934DBE58DD1EC85A04F8B251856C89B20EF8782&clientSalt=bQzNOQCAFM9HQKsj7MNoEiwxjVmwbPs0
Parameter	Description
rTag	CSRF protection token
pgf01	Username
retain	Always 1
pgf03	SHA-256 hashed password
clientSalt	Random client-side salt
Password Hashing:

javascript
// Password is hashed with SHA-256
// pgf03 = SHA256(password)
// clientSalt = random string (e.g., bQzNOQCAFM9HQKsj7MNoEiwxjVmwbPs0)
Success Response:

json
{
  "status": "success",
  "redirect": "/auth2FA"
}
4.4 Two-Factor Authentication (2FA)
4.4.1 Load 2FA Page

GET /auth2FA
Purpose: Load the 2FA page and extract new rTag

Headers:

http
Referer: https://faisanet.mib.com.mv/auth
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Response: HTML page with 2FA form

4.4.2 Verify OTP

POST /aAuth2FA/verifyOTP
Purpose: Verify the OTP code

Headers:

http
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/auth2FA
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Request Body:


otpType=3&otp=352340
Parameter	Description
otpType	Channel type: 0=Email, 1=SMS, 2=WhatsApp, 3=Authenticator
otp	6-digit OTP code
Success Response:

json
{
  "status": "success",
  "redirect": "/profiles"
}
Error Response (Invalid OTP):

json
{
  "status": "error",
  "message": "Invalid OTP"
}
4.5 Profile Management
4.5.1 Load Profiles Page

GET /profiles
Purpose: Load the profile selection page

Headers:

http
Referer: https://faisanet.mib.com.mv/auth2FA
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Response: HTML page with profile list

4.5.2 Switch Profile

POST /aProfileHandler/switchProfile
Purpose: Select a profile (personal/business)

Headers:

http
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/profiles
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Request Body:


rTag=5eaca057140e69ea151d55c921c806a8&profileId=80059&profileType=0
Parameter	Description
rTag	CSRF protection token from profiles page
profileId	Numeric profile ID (e.g., 80059)
profileType	0=Personal, 1=Business
Success Response:

json
{
  "status": "success",
  "redirect": "/accounts"
}
4.6 Accounts Management
4.6.1 Load Accounts Page

GET /accounts
Purpose: Load the main accounts dashboard

Headers:

http
Referer: https://faisanet.mib.com.mv/profiles
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Response: HTML page with account list

4.6.2 Get Account Details

GET /accountDetails?accountNo={accountNo}
Purpose: View detailed account information and transaction history

Headers:

http
Referer: https://faisanet.mib.com.mv/accounts
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
URL Parameters:

Parameter	Description
accountNo	Account number (e.g., 90101101137791000)
Response: HTML page with account details

4.6.3 Get Transaction History

POST /ajaxAccounts/trxHistory
Purpose: Fetch transaction history for an account

Headers:

http
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/accountDetails?accountNo=90101101137791000
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Request Body:


accountNo=90101101137791000&trxNo=&trxType=0&sortTrx=date&sortDir=desc&fromDate=&toDate=&start=1&end=10&includeCount=1
Parameter	Description
accountNo	Account number
trxNo	Optional transaction reference number
trxType	Transaction type (0=All)
sortTrx	Sort field (date)
sortDir	Sort direction (desc)
fromDate	Optional start date (YYYY-MM-DD)
toDate	Optional end date (YYYY-MM-DD)
start	Start index (1-based)
end	End index
includeCount	Include total count (1)
Success Response:

json
{
  "status": "success",
  "data": {
    "transactions": [...],
    "total": 45
  }
}
4.7 Notifications

POST /aProfile/getLastNAlerts
Purpose: Fetch recent notifications/alerts

Headers:

http
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/accounts
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Request Body: (Empty)

Success Response:

json
{
  "status": "success",
  "alerts": [...]
}
4.8 Profile Image

POST /ajaxBeneficiary/getProfileImage
Purpose: Fetch beneficiary profile images

Headers:

http
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/accountDetails?accountNo=90101101137791000
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Request Body:


imageHash=bf87f9ec2e56ab838d99ef2ddf69b694c5NcxX77mm3jvJjipLHOHQW5PQSTCVXv
Parameter	Description
imageHash	Image hash from the beneficiary data
Success Response:

json
{
  "status": "success",
  "image": "base64_encoded_image_data"
}
4.9 Logout

POST /aAuth/logout
Purpose: Terminate the session

Headers:

http
Accept: */*
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/accountDetails?accountNo=90101101137791000
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Request Body: (Empty)

Success Response:

json
{
  "status": "success",
  "redirect": "/auth"
}
5. Request Headers
Common Headers for All Requests
Header	Value	Required	Notes
Content-Type	application/x-www-form-urlencoded; charset=UTF-8	For POST	Form data format
X-Requested-With	XMLHttpRequest	For AJAX	Identifies AJAX requests
Referer	Previous page URL	Yes	Must match navigation flow
User-Agent	Browser UA string	Yes	Must be realistic
Accept	*/*	For AJAX	Accept any response type
Critical Headers
Header	Value	When
Content-Type	application/x-www-form-urlencoded	All POST requests
X-Requested-With	XMLHttpRequest	All AJAX requests
Referer	Current page URL	Must be set correctly
6. Complete Implementation Guide
6.1 JavaScript Implementation (Browser/Node.js)
javascript
const crypto = require('crypto');
const axios = require('axios');

class MIBBankingAPI {
    constructor() {
        this.baseUrl = 'https://faisanet.mib.com.mv';
        this.session = axios.create({
            withCredentials: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        });
        this.rTag = null;
        this.clientSalt = null;
    }

    /**
     * Extract rTag from HTML page
     */
    extractRTag(html) {
        // Look for rTag in JavaScript variables
        const match = html.match(/rTag\s*=\s*["']([^"']+)["']/);
        if (match) {
            this.rTag = match[1];
            return this.rTag;
        }
        throw new Error('Failed to extract rTag');
    }

    /**
     * Generate client salt
     */
    generateClientSalt() {
        this.clientSalt = crypto.randomBytes(16).toString('base64');
        return this.clientSalt;
    }

    /**
     * Hash password with SHA-256
     */
    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex').toUpperCase();
    }

    /**
     * Step 1: Initialize session and get rTag
     */
    async initializeSession() {
        const response = await this.session.get(`${this.baseUrl}/auth`);
        this.extractRTag(response.data);
        return this.rTag;
    }

    /**
     * Step 2: Get authentication type
     */
    async getAuthType(username) {
        const data = new URLSearchParams();
        data.append('rTag', this.rTag);
        data.append('pgf01', username);
        data.append('retain', '1');

        const response = await this.session.post(
            `${this.baseUrl}/aAuth/getAuthType`,
            data,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${this.baseUrl}/auth`
                }
            }
        );

        return response.data;
    }

    /**
     * Step 3: Primary authentication (xAuth)
     */
    async xAuth(username, password) {
        const hashedPassword = this.hashPassword(password);
        this.generateClientSalt();

        const data = new URLSearchParams();
        data.append('rTag', this.rTag);
        data.append('pgf01', username);
        data.append('retain', '1');
        data.append('pgf03', hashedPassword);
        data.append('clientSalt', this.clientSalt);

        const response = await this.session.post(
            `${this.baseUrl}/aAuth/xAuth`,
            data,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${this.baseUrl}/auth`
                }
            }
        );

        return response.data;
    }

    /**
     * Step 4: Load 2FA page and extract new rTag
     */
    async load2FAPage() {
        const response = await this.session.get(`${this.baseUrl}/auth2FA`, {
            headers: {
                'Referer': `${this.baseUrl}/auth`
            }
        });

        this.extractRTag(response.data);
        return response.data;
    }

    /**
     * Step 5: Verify OTP
     */
    async verifyOTP(otp, otpType = 3) {
        const data = new URLSearchParams();
        data.append('otpType', otpType);
        data.append('otp', otp);

        const response = await this.session.post(
            `${this.baseUrl}/aAuth2FA/verifyOTP`,
            data,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${this.baseUrl}/auth2FA`
                }
            }
        );

        return response.data;
    }

    /**
     * Step 6: Load profiles page
     */
    async loadProfilesPage() {
        const response = await this.session.get(`${this.baseUrl}/profiles`, {
            headers: {
                'Referer': `${this.baseUrl}/auth2FA`
            }
        });

        this.extractRTag(response.data);
        return response.data;
    }

    /**
     * Step 7: Switch profile
     */
    async switchProfile(profileId, profileType = 0) {
        const data = new URLSearchParams();
        data.append('rTag', this.rTag);
        data.append('profileId', profileId);
        data.append('profileType', profileType);

        const response = await this.session.post(
            `${this.baseUrl}/aProfileHandler/switchProfile`,
            data,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${this.baseUrl}/profiles`
                }
            }
        );

        return response.data;
    }

    /**
     * Step 8: Load accounts page
     */
    async loadAccountsPage() {
        const response = await this.session.get(`${this.baseUrl}/accounts`, {
            headers: {
                'Referer': `${this.baseUrl}/profiles`
            }
        });

        return response.data;
    }

    /**
     * Step 9: Get transaction history
     */
    async getTransactionHistory(accountNo, options = {}) {
        const data = new URLSearchParams();
        data.append('accountNo', accountNo);
        data.append('trxNo', options.trxNo || '');
        data.append('trxType', options.trxType || '0');
        data.append('sortTrx', options.sortTrx || 'date');
        data.append('sortDir', options.sortDir || 'desc');
        data.append('fromDate', options.fromDate || '');
        data.append('toDate', options.toDate || '');
        data.append('start', options.start || '1');
        data.append('end', options.end || '10');
        data.append('includeCount', options.includeCount || '1');

        const response = await this.session.post(
            `${this.baseUrl}/ajaxAccounts/trxHistory`,
            data,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `${this.baseUrl}/accountDetails?accountNo=${accountNo}`
                }
            }
        );

        return response.data;
    }

    /**
     * Step 10: Logout
     */
    async logout() {
        const response = await this.session.post(
            `${this.baseUrl}/aAuth/logout`,
            new URLSearchParams(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }
        );

        return response.data;
    }

    /**
     * Complete login flow
     */
    async completeLoginFlow(username, password, otp) {
        try {
            console.log('Step 1: Initializing session...');
            await this.initializeSession();

            console.log('Step 2: Getting auth type...');
            await this.getAuthType(username);

            console.log('Step 3: Primary authentication...');
            await this.xAuth(username, password);

            console.log('Step 4: Loading 2FA page...');
            await this.load2FAPage();

            console.log('Step 5: Verifying OTP...');
            await this.verifyOTP(otp);

            console.log('Step 6: Loading profiles...');
            await this.loadProfilesPage();

            // Parse profiles from HTML to get profileId
            // This would require HTML parsing

            return {
                success: true,
                message: 'Login successful'
            };

        } catch (error) {
            console.error('Login failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Usage Example
const api = new MIBBankingAPI();
api.completeLoginFlow('username', 'password', '123456')
    .then(result => console.log(result))
    .catch(error => console.error(error));
6.2 PHP Implementation (Laravel/HTTP)
php
<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MIBBankingAPI
{
    private $baseUrl = 'https://faisanet.mib.com.mv';
    private $session;
    private $rTag;
    private $clientSalt;
    private $cookies = [];

    public function __construct()
    {
        $this->session = Http::withOptions([
            'verify' => false,
            'cookies' => true,
            'headers' => [
                'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            ]
        ]);
    }

    /**
     * Extract rTag from HTML
     */
    private function extractRTag($html)
    {
        preg_match('/rTag\s*=\s*["\']([^"\']+)["\']/', $html, $matches);
        if (isset($matches[1])) {
            $this->rTag = $matches[1];
            return $this->rTag;
        }
        throw new \Exception('Failed to extract rTag');
    }

    /**
     * Hash password with SHA-256
     */
    private function hashPassword($password)
    {
        return strtoupper(hash('sha256', $password));
    }

    /**
     * Generate client salt
     */
    private function generateClientSalt()
    {
        $this->clientSalt = base64_encode(random_bytes(16));
        return $this->clientSalt;
    }

    /**
     * Step 1: Initialize session
     */
    public function initializeSession()
    {
        $response = $this->session->get($this->baseUrl . '/auth');
        $this->extractRTag($response->body());
        return $this->rTag;
    }

    /**
     * Step 2: Get auth type
     */
    public function getAuthType($username)
    {
        $response = $this->session->withHeaders([
            'Content-Type' => 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With' => 'XMLHttpRequest',
            'Referer' => $this->baseUrl . '/auth'
        ])->asForm()->post($this->baseUrl . '/aAuth/getAuthType', [
            'rTag' => $this->rTag,
            'pgf01' => $username,
            'retain' => 1
        ]);

        return $response->json();
    }

    /**
     * Step 3: Primary authentication
     */
    public function xAuth($username, $password)
    {
        $hashedPassword = $this->hashPassword($password);
        $this->generateClientSalt();

        $response = $this->session->withHeaders([
            'Content-Type' => 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With' => 'XMLHttpRequest',
            'Referer' => $this->baseUrl . '/auth'
        ])->asForm()->post($this->baseUrl . '/aAuth/xAuth', [
            'rTag' => $this->rTag,
            'pgf01' => $username,
            'retain' => 1,
            'pgf03' => $hashedPassword,
            'clientSalt' => $this->clientSalt
        ]);

        return $response->json();
    }

    /**
     * Step 4: Load 2FA page
     */
    public function load2FAPage()
    {
        $response = $this->session->withHeaders([
            'Referer' => $this->baseUrl . '/auth'
        ])->get($this->baseUrl . '/auth2FA');

        $this->extractRTag($response->body());
        return $response->body();
    }

    /**
     * Step 5: Verify OTP
     */
    public function verifyOTP($otp, $otpType = 3)
    {
        $response = $this->session->withHeaders([
            'Content-Type' => 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With' => 'XMLHttpRequest',
            'Referer' => $this->baseUrl . '/auth2FA'
        ])->asForm()->post($this->baseUrl . '/aAuth2FA/verifyOTP', [
            'otpType' => $otpType,
            'otp' => $otp
        ]);

        return $response->json();
    }

    /**
     * Step 6: Load profiles page
     */
    public function loadProfilesPage()
    {
        $response = $this->session->withHeaders([
            'Referer' => $this->baseUrl . '/auth2FA'
        ])->get($this->baseUrl . '/profiles');

        $this->extractRTag($response->body());
        return $response->body();
    }

    /**
     * Step 7: Switch profile
     */
    public function switchProfile($profileId, $profileType = 0)
    {
        $response = $this->session->withHeaders([
            'Content-Type' => 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With' => 'XMLHttpRequest',
            'Referer' => $this->baseUrl . '/profiles'
        ])->asForm()->post($this->baseUrl . '/aProfileHandler/switchProfile', [
            'rTag' => $this->rTag,
            'profileId' => $profileId,
            'profileType' => $profileType
        ]);

        return $response->json();
    }

    /**
     * Step 8: Get transaction history
     */
    public function getTransactionHistory($accountNo, $start = 1, $end = 10)
    {
        $response = $this->session->withHeaders([
            'Content-Type' => 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With' => 'XMLHttpRequest',
            'Referer' => $this->baseUrl . "/accountDetails?accountNo={$accountNo}"
        ])->asForm()->post($this->baseUrl . '/ajaxAccounts/trxHistory', [
            'accountNo' => $accountNo,
            'trxNo' => '',
            'trxType' => 0,
            'sortTrx' => 'date',
            'sortDir' => 'desc',
            'fromDate' => '',
            'toDate' => '',
            'start' => $start,
            'end' => $end,
            'includeCount' => 1
        ]);

        return $response->json();
    }

    /**
     * Step 9: Logout
     */
    public function logout()
    {
        $response = $this->session->withHeaders([
            'Content-Type' => 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With' => 'XMLHttpRequest'
        ])->asForm()->post($this->baseUrl . '/aAuth/logout', []);

        return $response->json();
    }

    /**
     * Complete login flow
     */
    public function completeLoginFlow($username, $password, $otp)
    {
        try {
            Log::info('MIB: Initializing session...');
            $this->initializeSession();

            Log::info('MIB: Getting auth type...');
            $this->getAuthType($username);

            Log::info('MIB: Primary authentication...');
            $result = $this->xAuth($username, $password);

            if (!isset($result['status']) || $result['status'] !== 'success') {
                throw new \Exception('Authentication failed: ' . json_encode($result));
            }

            Log::info('MIB: Loading 2FA page...');
            $this->load2FAPage();

            Log::info('MIB: Verifying OTP...');
            $otpResult = $this->verifyOTP($otp);

            if (!isset($otpResult['status']) || $otpResult['status'] !== 'success') {
                throw new \Exception('OTP verification failed: ' . json_encode($otpResult));
            }

            Log::info('MIB: Loading profiles...');
            $this->loadProfilesPage();

            return [
                'success' => true,
                'message' => 'Login successful'
            ];

        } catch (\Exception $e) {
            Log::error('MIB: Login failed - ' . $e->getMessage());
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
import hashlib
import re
import base64
import secrets
from typing import Dict, Any, Optional
from urllib.parse import urljoin, urlencode

class MIBBankingAPI:
    """Islamic Bank of Maldives Faisanet API Client"""
    
    def __init__(self):
        self.base_url = 'https://faisanet.mib.com.mv'
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        self.r_tag = None
        self.client_salt = None
    
    def log(self, message: str):
        """Simple logging"""
        print(f'[MIB] {message}')
    
    def _extract_r_tag(self, html: str) -> str:
        """Extract rTag from HTML page"""
        match = re.search(r'rTag\s*=\s*["\']([^"\']+)["\']', html)
        if match:
            self.r_tag = match.group(1)
            return self.r_tag
        raise Exception('Failed to extract rTag from HTML')
    
    def _hash_password(self, password: str) -> str:
        """Hash password with SHA-256"""
        return hashlib.sha256(password.encode()).hexdigest().upper()
    
    def _generate_client_salt(self) -> str:
        """Generate random client salt"""
        self.client_salt = base64.b64encode(secrets.token_bytes(16)).decode()
        return self.client_salt
    
    def _make_form_request(self, url: str, data: Dict, referer: str) -> Dict:
        """Make a form-urlencoded request"""
        response = self.session.post(
            urljoin(self.base_url, url),
            data=data,
            headers={
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': referer
            }
        )
        return response.json()
    
    def initialize_session(self) -> str:
        """Step 1: Initialize session and get rTag"""
        self.log('Initializing session...')
        response = self.session.get(f'{self.base_url}/auth')
        self._extract_r_tag(response.)
        self.log(f'rTag obtained: {self.r_tag[:20]}...')
        return self.r_tag
    
    def get_auth_type(self, username: str) -> Dict:
        """Step 2: Get authentication type"""
        self.log('Getting auth type...')
        return self._make_form_request(
            '/aAuth/getAuthType',
            {
                'rTag': self.r_tag,
                'pgf01': username,
                'retain': '1'
            },
            f'{self.base_url}/auth'
        )
    
    def xauth(self, username: str, password: str) -> Dict:
        """Step 3: Primary authentication"""
        self.log('Performing primary authentication...')
        hashed_password = self._hash_password(password)
        self._generate_client_salt()
        
        return self._make_form_request(
            '/aAuth/xAuth',
            {
                'rTag': self.r_tag,
                'pgf01': username,
                'retain': '1',
                'pgf03': hashed_password,
                'clientSalt': self.client_salt
            },
            f'{self.base_url}/auth'
        )
    
    def load_2fa_page(self) -> str:
        """Step 4: Load 2FA page and extract rTag"""
        self.log('Loading 2FA page...')
        response = self.session.get(
            f'{self.base_url}/auth2FA',
            headers={'Referer': f'{self.base_url}/auth'}
        )
        self._extract_r_tag(response.text)
        return response.text
    
    def verify_otp(self, otp: str, otp_type: int = 3) -> Dict:
        """Step 5: Verify OTP"""
        self.log('Verifying OTP...')
        return self._make_form_request(
            '/aAuth2FA/verifyOTP',
            {
                'otpType': str(otp_type),
                'otp': otp
            },
            f'{self.base_url}/auth2FA'
        )
    
    def load_profiles_page(self) -> str:
        """Step 6: Load profiles page and extract rTag"""
        self.log('Loading profiles page...')
        response = self.session.get(
            f'{self.base_url}/profiles',
            headers={'Referer': f'{self.base_url}/auth2FA'}
        )
        self._extract_r_tag(response.text)
        return response.text
    
    def switch_profile(self, profile_id: str, profile_type: int = 0) -> Dict:
        """Step 7: Switch profile"""
        self.log(f'Switching to profile: {profile_id}')
        return self._make_form_request(
            '/aProfileHandler/switchProfile',
            {
                'rTag': self.r_tag,
                'profileId': profile_id,
                'profileType': str(profile_type)
            },
            f'{self.base_url}/profiles'
        )
    
    def load_accounts_page(self) -> str:
        """Step 8: Load accounts page"""
        self.log('Loading accounts page...')
        response = self.session.get(
            f'{self.base_url}/accounts',
            headers={'Referer': f'{self.base_url}/profiles'}
        )
        return response.text
    
    def get_transaction_history(self, account_no: str, start: int = 1, end: int = 10) -> Dict:
        """Step 9: Get transaction history"""
        self.log(f'Fetching transaction history for: {account_no}')
        return self._make_form_request(
            '/ajaxAccounts/trxHistory',
            {
                'accountNo': account_no,
                'trxNo': '',
                'trxType': '0',
                'sortTrx': 'date',
                'sortDir': 'desc',
                'fromDate': '',
                'toDate': '',
                'start': str(start),
                'end': str(end),
                'includeCount': '1'
            },
            f'{self.base_url}/accountDetails?accountNo={account_no}'
        )
    
    def logout(self) -> Dict:
        """Step 10: Logout"""
        self.log('Logging out...')
        response = self.session.post(
            f'{self.base_url}/aAuth/logout',
            data={},
            headers={
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            }
        )
        return response.json()
    
    def complete_login_flow(self, username: str, password: str, otp: str) -> Dict:
        """
        Complete login flow - all steps combined
        """
        try:
            print('\n' + '='*60)
            print('ISLAMIC BANK OF MALDIVES API INTEGRATION')
            print('='*60 + '\n')
            
            # Step 1: Initialize session
            self.initialize_session()
            self.log('✓ Session initialized', 'SUCCESS')
            
            # Step 2: Get auth type
            auth_result = self.get_auth_type(username)
            self.log('✓ Auth type retrieved', 'SUCCESS')
            
            # Step 3: Primary authentication
            xauth_result = self.xauth(username, password)
            if xauth_result.get('status') != 'success':
                raise Exception(f'Authentication failed: {xauth_result}')
            self.log('✓ Primary authentication successful', 'SUCCESS')
            
            # Step 4: Load 2FA page
            self.load_2fa_page()
            self.log('✓ 2FA page loaded', 'SUCCESS')
            
            # Step 5: Verify OTP
            otp_result = self.verify_otp(otp)
            if otp_result.get('status') != 'success':
                raise Exception(f'OTP verification failed: {otp_result}')
            self.log('✓ OTP verified', 'SUCCESS')
            
            # Step 6: Load profiles
            self.load_profiles_page()
            self.log('✓ Profiles loaded', 'SUCCESS')
            
            # Step 7: Get accounts
            self.load_accounts_page()
            self.log('✓ Accounts loaded', 'SUCCESS')
            
            return {
                'success': True,
                'message': 'Login successful'
            }
            
        except Exception as e:
            self.log(f'✗ Login failed: {str(e)}', 'ERROR')
            return {
                'success': False,
                'error': str(e)
            }


# ============================================================
# USAGE EXAMPLE
# ============================================================

if __name__ == '__main__':
    import os
    
    username = os.getenv('MIB_USERNAME', input('Enter username: '))
    password = os.getenv('MIB_PASSWORD', input('Enter password: '))
    otp = os.getenv('MIB_OTP', input('Enter OTP: '))
    
    api = MIBBankingAPI()
    result = api.complete_login_flow(username, password, otp)
    
    if result.get('success'):
        print('\n✅ Login successful!')
        
        # After login, you can fetch transaction history
        account_no = input('\nEnter account number for history: ')
        if account_no:
            history = api.get_transaction_history(account_no)
            print('\n📊 Transaction History:')
            print(history)
    else:
        print(f'\n❌ Login failed: {result.get("error")}')
7. Error Handling
Common HTTP Status Codes
Status	Meaning	Handling
200	Success	Process response
203	Success (with redirect)	Follow redirect
401	Unauthorized	Invalid credentials - retry
500	Server Error	Retry with exponential backoff
Error Responses
json
// Invalid OTP
{
  "status": "error",
  "message": "Invalid OTP"
}

// Invalid Credentials
{
  "status": "error",
  "message": "Invalid username or password"
}

// Session Expired
{
  "status": "error",
  "message": "Session expired",
  "redirect": "/auth"
}
Error Handling Template
python
def handle_api_response(response):
    if response.get('status') == 'success':
        return response
    
    if response.get('status') == 'error':
        error_msg = response.get('message', 'Unknown error')
        if 'session' in error_msg.lower():
            raise Exception('Session expired. Please re-authenticate.')
        raise Exception(f'API error: {error_msg}')
    
    raise Exception(f'Unexpected response: {response}')
8. Security Considerations
⚠️ Important Security Guidelines
Never hardcode credentials in application code

Store tokens securely using environment variables or secure storage

Implement proper session management with rTag rotation

Log all authentication attempts for audit purposes

Use HTTPS exclusively (all endpoints use HTTPS)

Validate all responses before processing

Implement proper logout to invalidate sessions

Respect rate limits (unknown, but respect 60 requests/minute as a baseline)

Handle token expiration gracefully

Do not store sensitive data in logs

Password Hashing
The MIB Faisanet system uses client-side password hashing:

javascript
// The password is hashed with SHA-256 before sending
// No salt is used for the password hash itself
// pgf03 = SHA256(password)
rTag Token
The rTag is the primary CSRF protection

Must be extracted from each page before making POST requests

Rotates with each major page load

Session Timeout
Sessions expire after inactivity (typically 30 minutes)

Implement auto-refresh or re-authentication flow

Handle 401 responses gracefully

9. Quick Reference Card
Complete Login Flow (Python)
python
api = MIBBankingAPI()
result = api.complete_login_flow(
    'YOUR_USERNAME',
    'YOUR_PASSWORD',
    '123456'  # OTP from authenticator
)

if result['success']:
    # Now you can fetch transaction history
    history = api.get_transaction_history('90101101137791000')
Key Endpoints Quick List
Endpoint	Method	Purpose
/auth	GET	Get rTag token
/aAuth/getAuthType	POST	Check username
/aAuth/xAuth	POST	Login with password
/auth2FA	GET	Load 2FA page
/aAuth2FA/verifyOTP	POST	Verify OTP
/profiles	GET	List profiles
/aProfileHandler/switchProfile	POST	Select profile
/accounts	GET	Account dashboard
/ajaxAccounts/trxHistory	POST	Transaction history
/aAuth/logout	POST	Logout
10. Appendix
Example Response: Transaction History
json
{
  "status": "success",
  "data": {
    "transactions": [
      {
        "date": "2026-06-22",
        "description": "Transfer to Account X",
        "amount": -1000.00,
        "balance": 5000.00,
        "reference": "TXN123456"
      }
    ],
    "total": 45
  }
}
Example Response: Profile Switch
json
{
  "status": "success",
  "redirect": "/accounts"
}
Document Metadata
Purpose: Technical integration guide for Islamic Bank of Maldives Faisanet API

Intended Audience: Developers and AI agents building legitimate integrations

Security Level: Internal use only - contains API specifications

Classification: Technical documentation

End of Document