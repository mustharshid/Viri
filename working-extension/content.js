// Viri Bridge Content Script
// Automatically broadcasts the local extension ID to the web application

function broadcastId() {
  try {
    const extId = chrome.runtime.id;
    const version = chrome.runtime.getManifest().version;
    window.postMessage({
      type: 'VIRI_BRIDGE_HEARTBEAT',
      extensionId: extId,
      version: version
    }, '*');
  } catch (e) {
    console.error("Viri Bridge Content Script failed to broadcast ID:", e);
  }
}

// Broadcast immediately when content script loads
broadcastId();

// Also listen for ping requests from the Cashier web page
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'REQUEST_VIRI_BRIDGE_ID') {
    broadcastId();
  }
});
