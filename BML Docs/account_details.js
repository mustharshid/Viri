// Get specific account details
const accountId = "AD2ADF9D-46CE-E511-80D7-00155D020F0A"; // From your HAR

const response = await fetch(`https://www.bankofmaldives.com.mv/internetbanking/api/account/${accountId}`, {
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'Authorization': 'Bearer',
    'X-XSRF-TOKEN': xsrfToken,
    'Referer': 'https://www.bankofmaldives.com.mv/internetbanking/vf/accounts/overview'
  }
});

const accountDetails = await response.json();
console.log(accountDetails);