chrome.runtime.onInstalled.addListener(() => {
    console.log('UBC Scheduler background service worker ready.');
});

const ORIGIN_TAB_KEY = 'ubcOriginTabId';

function persistOriginTabId(tabId, sendResponse) {
    const payload = { [ORIGIN_TAB_KEY]: tabId };
    const onStored = () => sendResponse?.({ tabId });

    if (chrome.storage.session) {
        chrome.storage.session.set(payload, onStored);
    } else {
        chrome.storage.local.set(payload, onStored);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action === 'STORE_ORIGIN_TAB') {
        const tabId = sender.tab?.id ?? null;
        if (!tabId) {
            sendResponse?.({ tabId: null });
            return true;
        }
        persistOriginTabId(tabId, sendResponse);
        return true;
    }

    if (message?.action !== 'OPEN_CALENDAR_PAGE') {
        return false;
    }

    const url = chrome.runtime.getURL('calendar.html');
    chrome.tabs.create({ url, active: true }, () => {
        sendResponse?.({ success: true });
    });

    return true;
});