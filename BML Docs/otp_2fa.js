// Example: OTP Verification
const otpPayload = {
  otp: "123456" // 6-digit code from your authenticator app
};

const response = await fetch('https://www.bankofmaldives.com.mv/internetbanking/web/login/2fa', {
  method: 'POST',
  headers: {
    'Accept': 'text/html, application/xhtml+xml',
    'Content-Type': 'application/json',
    'X-Inertia': 'true',
    'X-Requested-With': 'XMLHttpRequest',
    'X-XSRF-TOKEN': xsrfToken, // New token from the 2FA page
    'Referer': 'https://www.bankofmaldives.com.mv/internetbanking/web/login/2fa',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  },
  body: JSON.stringify(otpPayload)
});

const result = await response.json();
console.log(result);
// On success: redirects to /web/profile or /vf/accounts/overview