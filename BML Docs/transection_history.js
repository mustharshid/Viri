// Get today's transactions
const response = await fetch(`https://www.bankofmaldives.com.mv/internetbanking/api/account/${accountId}/history/today`, {
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'Authorization': 'Bearer',
    'X-XSRF-TOKEN': xsrfToken,
    'Referer': `https://www.bankofmaldives.com.mv/internetbanking/vf/accounts/${accountId}`
  }
});

const transactions = await response.json();
console.log(transactions);