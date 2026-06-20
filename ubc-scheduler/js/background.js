chrome.runtime.onInstalled.addListener(() => {
    console.log('UBC Scheduler background service worker ready.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action !== 'OPEN_CALENDAR_PAGE') {
        return false;
    }

    const url = chrome.runtime.getURL('calendar.html');
    chrome.tabs.create({ url, active: true }, () => {
        sendResponse?.({ success: true });
    });

    return true;
});