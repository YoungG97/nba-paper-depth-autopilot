// service-worker.js — Manifest V3 background service worker

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
  console.error('Failed to set panel behavior:', err);
});

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const { activeMode } = await chrome.storage.local.get('activeMode');
    if (!activeMode) {
      await chrome.storage.local.set({
        activeMode: 'video',
        queueIntervalSec: 25,
        autoSubmitOnFill: true
      });
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
});
