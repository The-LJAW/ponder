// Clicking the toolbar icon (or Alt+P) opens the Ponder side panel next to
// the video, so the study pack sits beside what you're watching.
const openOnClick = () =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(openOnClick);
chrome.runtime.onStartup.addListener(openOnClick);
