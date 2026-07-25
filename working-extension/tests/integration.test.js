const { handleVerification } = require('../background.js');
// Mocking gateway-mv-js reference
const gatewayMvJsMock = require('./gateway-mv-js.mock');

describe('Integration: Bank Verification flow (gateway-mv-js simulation)', () => {
  it('successfully extracts recent CREDIT statements from BML sandbox', async () => {
    const payload = {
      amount: '450.00',
      bank: 'BML',
      accountId: 'acc_1'
    };
    
    // Simulate gateway response
    gatewayMvJsMock.simulateLoginSuccess();
    gatewayMvJsMock.injectMockStatement([
      { type: 'CREDIT', amount: '450.00', timestamp: new Date().toISOString() }
    ]);
    
    // In a real environment handleVerification invokes the gateway logic.
    // For this stub, we expect it to return the success object
    const result = await handleVerification(payload);
    
    expect(result.status).toBe('CREDITED');
    expect(result.amount).toBe('450.00');
  });
});
