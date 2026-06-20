/**
 * Storage Manager for UBC Scheduler
 * Handles schedule persistence via chrome.storage.local
 * 
 * RULES:
 * - No duplicate names allowed (case-insensitive)
 * - If editing + name unchanged → update existing
 * - If editing + name changed → create new (preserves original)
 * - If new schedule → create with new UUID
 */

/** Chrome storage.local keys used by the extension. */
const STORAGE_KEYS = {
    SCHEDULES: 'ubcSchedules', // Named saved schedules array (Save button in calendar header)
    COURSE_DATA: 'ubcExtractedCourses',
    FORM_DATA: 'ubcSchedulerData',
    PREFERENCES: 'ubcPreferences',
    ORIGIN_TAB: 'ubcOriginTabId',
    PENDING_WORKDAY: 'ubcPendingWorkdaySchedules', // Checked schedules queued by Add to Workday
    SCHEDULE_TO_LOAD: 'ubcScheduleToLoad' // One-time pointer when Load opens/focuses calendar
};

const Storage = {
    /** Case-insensitive duplicate name check; excludeId used when editing same schedule. */
    async nameExists(name, excludeId = null) {
        const schedules = await this.getAllSchedules();
        const normalizedName = name.trim().toLowerCase();
        return schedules.some(s => 
            s.name.trim().toLowerCase() === normalizedName && 
            s.id !== excludeId
        );
    },

    /** Save or update schedule; same name + same id → update in place; new name or new id → create (replace any existing same name). */
    async saveScheduleWithValidation(schedule, editingId = null, originalName = null) {
        const newName = (schedule.name || 'Untitled Schedule').trim();
        const schedules = await this.getAllSchedules();
        const normalizedName = newName.trim().toLowerCase();

        if (editingId && originalName) {
            const originalNormalized = originalName.trim().toLowerCase();
            if (originalNormalized === normalizedName) {
                const index = schedules.findIndex(s => s.id === editingId);
                if (index !== -1) {
                    schedules[index] = {
                        ...schedules[index],
                        ...schedule,
                        id: editingId,
                        name: newName,
                        createdAt: schedules[index].createdAt,
                        updatedAt: Date.now()
                    };
                    // STORAGE WRITE: update existing entry in "ubcSchedules"
                    await this._setStorage(STORAGE_KEYS.SCHEDULES, schedules);
                    return { success: true, schedule: schedules[index], isUpdate: true };
                }
            }
        }

        const existingIndex = schedules.findIndex(s =>
            s.name.trim().toLowerCase() === normalizedName && s.id !== editingId
        );
        if (existingIndex >= 0) {
            schedules.splice(existingIndex, 1);
        }

        const newSchedule = {
            ...schedule,
            id: crypto.randomUUID(),
            name: newName,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        schedules.push(newSchedule);
        // STORAGE WRITE: append new schedule to "ubcSchedules"
        await this._setStorage(STORAGE_KEYS.SCHEDULES, schedules);

        return { success: true, schedule: newSchedule, isUpdate: false };
    },

    /** Return all schedules from storage (empty array if none). */
    async getAllSchedules() {
        const result = await this._getStorage(STORAGE_KEYS.SCHEDULES);
        return result || [];
    },

    /** Return single schedule by id or null. */
    async getScheduleById(id) {
        const schedules = await this.getAllSchedules();
        return schedules.find(s => s.id === id) || null;
    },

    /** Remove schedule by id; returns false if not found. */
    async deleteSchedule(id) {
        const schedules = await this.getAllSchedules();
        const filtered = schedules.filter(s => s.id !== id);
        
        if (filtered.length === schedules.length) {
            return false;
        }
        
        // STORAGE WRITE: remove deleted schedule from "ubcSchedules"
        await this._setStorage(STORAGE_KEYS.SCHEDULES, filtered);
        return true;
    },

    /** Get extracted course data (courseCode → { Lecture, Discussion, Laboratory }). */
    async getCourseData() {
        const primary = await this._getStorage(STORAGE_KEYS.COURSE_DATA);
        if (primary && Object.keys(primary).length > 0) return primary;

        const fallbackA = await this._getStorage('ubcCourseData');
        if (fallbackA && Object.keys(fallbackA).length > 0) return fallbackA;

        const fallbackB = await this._getStorage('scrapedCourseData');
        return fallbackB || {};
    },

    /** Get saved form/preferences payload (popup writes ubc_ui_workspace_draft). */
    async getFormData() {
        const workspace = await this._getStorage('ubc_ui_workspace_draft');
        if (workspace) return workspace;

        const result = await this._getStorage(STORAGE_KEYS.FORM_DATA);
        return result || {};
    },

    /** Persist tab id to return to (e.g. Workday) after calendar. */
    async setOriginTab(tabId) {
        await this._setStorage(STORAGE_KEYS.ORIGIN_TAB, tabId);
    },

    /** Read stored origin tab id. */
    async getOriginTab() {
        return await this._getStorage(STORAGE_KEYS.ORIGIN_TAB);
    },

    /** Remove stored origin tab id. */
    async clearOriginTab() {
        await this._removeStorage(STORAGE_KEYS.ORIGIN_TAB);
    },

    /** Queue selected schedules for Workday enrollment automation. */
    async setPendingWorkdaySchedules(schedules) {
        // STORAGE WRITE: Add to Workday — full checked schedule objects for navigation.js on the Workday tab
        await this._setStorage(STORAGE_KEYS.PENDING_WORKDAY, {
            scheduleIds: schedules.map(s => s.id),
            schedules,
            queuedAt: Date.now()
        });
    },

    /** Read queued Workday schedules payload. */
    async getPendingWorkdaySchedules() {
        return (await this._getStorage(STORAGE_KEYS.PENDING_WORKDAY)) || null;
    },

    /** Tell calendar which saved schedule to open on load. */
    async setScheduleToLoad(id) {
        // STORAGE WRITE: Load button — calendar reads this on init or via storage.onChanged
        await this._setStorage(STORAGE_KEYS.SCHEDULE_TO_LOAD, id);
    },

    /** Clear schedule-to-load pointer after calendar consumes it. */
    async clearScheduleToLoad() {
        // STORAGE WRITE: remove "ubcScheduleToLoad" after calendar has loaded the schedule
        await this._removeStorage(STORAGE_KEYS.SCHEDULE_TO_LOAD);
    },

    /** Read schedule id queued for calendar load. */
    async getScheduleToLoad() {
        return await this._getStorage(STORAGE_KEYS.SCHEDULE_TO_LOAD);
    },

    /** Low-level: get one key from chrome.storage.local. */
    _getStorage(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => {
                resolve(result[key]);
            });
        });
    },

    /** Low-level: set one key in chrome.storage.local. */
    _setStorage(key, value) {
        return new Promise((resolve, reject) => {
            // All calendar schedule persistence ultimately goes through this chrome.storage.local.set call
            chrome.storage.local.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    },

    /** Low-level: remove one key from chrome.storage.local. */
    _removeStorage(key) {
        return new Promise((resolve, reject) => {
            // Used to clear one-time keys (e.g. "ubcScheduleToLoad") after calendar consumes them
            chrome.storage.local.remove(key, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Storage, STORAGE_KEYS };
}
