/**
 * Navigation Manager for UBC Scheduler
 * Handles tab navigation and back button functionality
 */

/** Handles storing/restoring origin tab and closing calendar tab. */
const Navigation = {
    originTabId: null,
    currentTabId: null,

    /** Load origin tab id from storage; cache current tab id. */
    async init() {
        try {
            const result = await this.getFromSession('ubcOriginTabId');
            this.originTabId = result || null;
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                this.currentTabId = tabs[0].id;
            }
        } catch (e) {
            console.warn('Navigation init error:', e);
        }
    },

    /** Save active tab id so we can return to it (e.g. Workday); call from popup before opening calendar. */
    async storeOriginTab() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                await this.setInSession('ubcOriginTabId', tabs[0].id);
                return tabs[0].id;
            }
        } catch (e) {
            console.warn('Failed to store origin tab:', e);
        }
        return null;
    },

    /** Focus origin tab and close this tab; fallback: just close. */
    async goBack() {
        try {
            if (this.originTabId) {
                const tab = await this.getTab(this.originTabId);
                if (tab) {
                    await chrome.tabs.update(this.originTabId, { active: true });
                    await this.clearSession('ubcOriginTabId');
                    window.close();
                    return true;
                }
            }
        } catch (e) {
            console.warn('Failed to navigate to origin tab:', e);
        }
        
        window.close();
        return false;
    },

    /** Return tab by id or null if invalid/closed. */
    async getTab(tabId) {
        try {
            return await chrome.tabs.get(tabId);
        } catch (e) {
            return null;
        }
    },

    /** Read key from session (or local) storage. */
    async getFromSession(key) {
        return new Promise((resolve) => {
            if (chrome.storage?.session) {
                chrome.storage.session.get(key, (result) => {
                    resolve(result[key]);
                });
            } else {
                chrome.storage.local.get(key, (result) => {
                    resolve(result[key]);
                });
            }
        });
    },

    /** Write key to session (or local) storage. */
    async setInSession(key, value) {
        return new Promise((resolve) => {
            if (chrome.storage?.session) {
                chrome.storage.session.set({ [key]: value }, resolve);
            } else {
                chrome.storage.local.set({ [key]: value }, resolve);
            }
        });
    },

    /** Remove key from session (or local) storage. */
    async clearSession(key) {
        return new Promise((resolve) => {
            if (chrome.storage?.session) {
                chrome.storage.session.remove(key, resolve);
            } else {
                chrome.storage.local.remove(key, resolve);
            }
        });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Navigation };
}
