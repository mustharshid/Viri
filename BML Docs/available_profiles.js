// Load the profile selection page
const response = await fetch('https://www.bankofmaldives.com.mv/internetbanking/web/profile', {
  headers: {
    'X-Inertia': 'true',
    'X-Requested-With': 'XMLHttpRequest',
    'X-XSRF-TOKEN': xsrfToken
  }
});

const html = await response.text();
// Parse the HTML to extract profile IDs and names
// Look for: <a href="/internetbanking/web/profile/{PROFILE_ID}">