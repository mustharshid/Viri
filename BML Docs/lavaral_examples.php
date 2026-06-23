<?php

use Illuminate\Support\Facades\Http;

class BankOfMaldivesAPI
{
    private $baseUrl = 'https://www.bankofmaldives.com.mv/internetbanking';
    private $xsrfToken;
    private $cookies = [];

    public function getXsrfToken()
    {
        // Initial request to get XSRF token
        $response = Http::withHeaders([
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])->get($this->baseUrl . '/web/login');

        // Extract XSRF token from cookies
        foreach ($response->cookies() as $cookie) {
            if ($cookie->getName() === 'XSRF-TOKEN') {
                $this->xsrfToken = urldecode($cookie->getValue());
                $this->cookies[] = $cookie->getName() . '=' . $cookie->getValue();
                break;
            }
        }

        return $this->xsrfToken;
    }

    public function login($username, $password)
    {
        $this->getXsrfToken();

        $response = Http::withHeaders([
            'Accept' => 'text/html, application/xhtml+xml',
            'Content-Type' => 'application/json',
            'X-Inertia' => 'true',
            'X-Requested-With' => 'XMLHttpRequest',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . '/web/login',
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->post($this->baseUrl . '/web/login', [
            'username' => $username,
            'password' => $password
        ]);

        return $response->json();
    }

    public function verifyOtp($otp)
    {
        // Get new XSRF token for 2FA page
        $this->getXsrfToken();

        $response = Http::withHeaders([
            'Accept' => 'text/html, application/xhtml+xml',
            'Content-Type' => 'application/json',
            'X-Inertia' => 'true',
            'X-Requested-With' => 'XMLHttpRequest',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . '/web/login/2fa',
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->post($this->baseUrl . '/web/login/2fa', [
            'otp' => $otp
        ]);

        return $response->json();
    }

    public function selectProfile($profileId)
    {
        $response = Http::withHeaders([
            'Accept' => 'text/html, application/xhtml+xml',
            'X-Inertia' => 'true',
            'X-Requested-With' => 'XMLHttpRequest',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . '/web/profile',
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->get($this->baseUrl . "/web/profile/{$profileId}");

        // Handle 409 redirect
        if ($response->status() === 409) {
            $redirectUrl = $response->header('X-Inertia-Location');
            return Http::withHeaders(['X-Inertia' => 'true'])
                ->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
                ->get($redirectUrl);
        }

        return $response;
    }

    public function getAccountHistory($accountId)
    {
        $response = Http::withHeaders([
            'Accept' => 'application/json, text/plain, */*',
            'Authorization' => 'Bearer',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . "/vf/accounts/{$accountId}",
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->get($this->baseUrl . "/api/account/{$accountId}/history/today");

        return $response->json();
    }

    public function getPendingTransactions($accountId)
    {
        $response = Http::withHeaders([
            'Accept' => 'application/json, text/plain, */*',
            'Authorization' => 'Bearer',
            'X-XSRF-TOKEN' => $this->xsrfToken,
            'Referer' => $this->baseUrl . "/vf/accounts/{$accountId}",
            'User-Agent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ])->withCookies($this->cookies, 'www.bankofmaldives.com.mv')
        ->get($this->baseUrl . "/api/history/pending/{$accountId}");

        return $response->json();
    }
}

// Usage:
$api = new BankOfMaldivesAPI();
$api->login('your_username', 'your_password');
$api->verifyOtp('123456');
$api->selectProfile('55706095-F725-E711-80E8-00155D020F0A');
$history = $api->getAccountHistory('AD2ADF9D-46CE-E511-80D7-00155D020F0A');