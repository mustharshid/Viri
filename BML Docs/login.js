// Example: Login Request
const loginPayload = {
  username: "your_username_here",
  password: "your_password_here"
};

const response = await fetch('https://www.bankofmaldives.com.mv/internetbanking/web/login', {
  method: 'POST',
  headers: {
    'Accept': 'text/html, application/xhtml+xml',
    'Content-Type': 'application/json',
    'X-Inertia': 'true',
    'X-Requested-With': 'XMLHttpRequest',
    'X-XSRF-TOKEN': xsrfToken, // Get this from cookies or previous page
    'Referer': 'https://www.bankofmaldives.com.mv/internetbanking/web/login',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  },
  body: JSON.stringify(loginPayload)
});

const result = await response.json();
console.log(result);
// On success: redirects to /login/2fa for OTP