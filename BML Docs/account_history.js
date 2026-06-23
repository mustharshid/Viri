// Get all accounts
const response = await fetch('https://www.bankofmaldives.com.mv/internetbanking/api/dashboard', {
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'Authorization': 'Bearer', // Usually empty, session handles auth
    'X-XSRF-TOKEN': xsrfToken,
    'Referer': 'https://www.bankofmaldives.com.mv/internetbanking/vf/accounts/overview'
  }
});

const accounts = await response.json();
console.log(accounts);
// Returns list of accounts with account IDs and balances