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



function getFromSessionOrLocal(key) {

    return new Promise((resolve) => {

        if (chrome.storage?.session) {

            chrome.storage.session.get(key, (result) => {

                resolve(result[key] ?? null);

            });

        } else {

            chrome.storage.local.get(key, (result) => {

                resolve(result[key] ?? null);

            });

        }

    });

}



function focusTab(tabId) {

    return new Promise((resolve) => {

        chrome.tabs.get(tabId, (tab) => {

            if (chrome.runtime.lastError || !tab) {

                resolve(null);

                return;

            }

            chrome.tabs.update(tabId, { active: true }, () => {

                if (tab.windowId != null) {

                    chrome.windows.update(tab.windowId, { focused: true }, () => resolve(tab));

                } else {

                    resolve(tab);

                }

            });

        });

    });

}



async function findWorkdayTab() {

    const originId = await getFromSessionOrLocal(ORIGIN_TAB_KEY);

    if (originId) {

        const tab = await focusTab(originId);

        if (tab) return tab;

    }



    return new Promise((resolve) => {

        chrome.tabs.query({ url: '*://*.myworkday.com/*' }, async (tabs) => {

            if (!tabs?.length) {

                resolve(null);

                return;

            }

            const tab = await focusTab(tabs[0].id);

            resolve(tab);

        });

    });

}



async function findCalendarTab() {

    const calendarUrl = chrome.runtime.getURL('src/calendar.html');

    return new Promise((resolve) => {

        chrome.tabs.query({ url: calendarUrl }, (tabs) => {

            resolve(tabs?.[0] ?? null);

        });

    });

}



async function openOrFocusCalendar(sendResponse) {

    const existing = await findCalendarTab();

    if (existing) {

        await focusTab(existing.id);

        sendResponse?.({ success: true, tabId: existing.id });

        return;

    }



    const url = chrome.runtime.getURL('src/calendar.html');

    chrome.tabs.create({ url, active: true }, (tab) => {

        sendResponse?.({ success: true, tabId: tab?.id ?? null });

    });

}



async function focusWorkdayTab(sendResponse) {

    const tab = await findWorkdayTab();

    if (!tab) {

        sendResponse?.({ success: false, error: 'No Workday tab found.' });

        return;

    }



    try {

        chrome.tabs.sendMessage(tab.id, { action: 'PENDING_SCHEDULES_READY' });

    } catch (e) {

        // Content script may not be injected yet; storage still holds pending schedules

    }



    sendResponse?.({ success: true, tabId: tab.id });

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



    if (message?.action === 'FOCUS_WORKDAY_TAB') {

        focusWorkdayTab(sendResponse);

        return true;

    }



    if (message?.action === 'OPEN_OR_FOCUS_CALENDAR') {

        openOrFocusCalendar(sendResponse);

        return true;

    }



    if (message?.action === 'OPEN_CALENDAR_PAGE') {

        openOrFocusCalendar(sendResponse);

        return true;

    }



    return false;

});

