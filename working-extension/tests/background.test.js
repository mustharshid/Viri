// Using Jest as a mock runner for Chrome Extension logic

// Mocking Chrome API
global.chrome = {
  runtime: {
    onMessageExternal: {
      addListener: jest.fn()
    }
  },
  declarativeNetRequest: {
    updateDynamicRules: jest.fn()
  }
};

describe('Browser Extension Bridge', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the external message listener on load', () => {
    // Require the background script
    require('../background.js');
    
    expect(chrome.runtime.onMessageExternal.addListener).toHaveBeenCalledTimes(1);
  });

  it('updates declarativeNetRequest rules on load to handle CORS', () => {
    require('../background.js');
    
    expect(chrome.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith(
      expect.objectContaining({
        addRules: expect.any(Array),
        removeRuleIds: [1]
      })
    );
  });

});
