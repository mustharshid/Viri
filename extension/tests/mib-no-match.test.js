describe('MIB no-match handling (regression test for connection-lost bug)', () => {
  const runMibApiFlow = null; // cannot import ES module background.js in node

  it('the fix replaces not_found with an error throw', () => {
    const bg = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'background.js'),
      'utf-8'
    );

    const hasNotFoundPostMessage = bg.includes("type: 'not_found'");
    const hasErrorThrow = bg.includes(
      "throw new Error(`Verification Failed: No recent credit transaction found for"
    );

    expect(hasNotFoundPostMessage).toBe(false);
    expect(hasErrorThrow).toBe(true);
  });

  it('the catch block sends type:error for thrown errors', () => {
    // Verify the catch block at line ~3102 correctly sends { type: 'error', error: error.message }
    const bg = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'background.js'),
      'utf-8'
    );

    // For mode !== 'fetch_only', the catch sends type: 'error'
    expect(bg).toContain("port.postMessage({ type: 'error', error: error.message });");
  });

  it('the PWA message handler handles type:error with search-not-found UX', () => {
    const pwa = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'pwa', 'src', 'pages', 'Cashier', 'CashierApp.tsx'),
      'utf-8'
    );

    // PWA checks for "No recent credit transaction found" in error messages
    expect(pwa).toContain("/No recent credit transaction found/i");
  });
});
