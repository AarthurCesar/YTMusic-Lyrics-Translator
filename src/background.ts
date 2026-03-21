// Reinjeta o content script nas abas abertas do YTMusic ao iniciar/atualizar
async function injectIntoExistingTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['overlay.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch {
      // Aba pode estar inacessível (ex: DevTools, chrome-extension://)
    }
  }
}

chrome.runtime.onInstalled.addListener(injectIntoExistingTabs);
chrome.runtime.onStartup.addListener(injectIntoExistingTabs);
