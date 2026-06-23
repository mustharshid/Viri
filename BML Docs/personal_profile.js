// Example: Select a profile (navigate to specific profile)
const profileId = "55706095-F725-E711-80E8-00155D020F0A"; // From your HAR

const response = await fetch(`https://www.bankofmaldives.com.mv/internetbanking/web/profile/${profileId}`, {
  method: 'GET',
  headers: {
    'Accept': 'text/html, application/xhtml+xml',
    'X-Inertia': 'true',
    'X-Requested-With': 'XMLHttpRequest',
    'X-XSRF-TOKEN': xsrfToken,
    'Referer': 'https://www.bankofmaldives.com.mv/internetbanking/web/profile',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  }
});

// If response status is 409 (Conflict), follow the redirect:
// X-Inertia-Location: /internetbanking/web/redirect
if (response.status === 409) {
  const redirectUrl = response.headers.get('X-Inertia-Location');
  // Follow the redirect URL
  await fetch(redirectUrl, { headers: { 'X-Inertia': 'true' } });
}