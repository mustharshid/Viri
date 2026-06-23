// Get pending transactions
const response = await fetch(`https://www.bankofmaldives.com.mv/internetbanking/api/history/pending/${accountId}`, {
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'Authorization': 'Bearer',
    'X-XSRF-TOKEN': xsrfToken,
    'Referer': `https://www.bankofmaldives.com.mv/internetbanking/vf/accounts/${accountId}`
  }
});

const pending = await response.json();
console.log(pending);