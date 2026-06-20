/**
 * UBC Scheduler - Core Storage Engine
 * Manages UI workspace configuration and final extracted Workday schedule layouts.
 */
const REGISTRY_KEYS = {
    UI_WORKSPACE: 'ubc_ui_workspace_draft', // Key for Function 1 (UI draft preferences)
    FINAL_SCHEDULES: 'ubc_compiled_schedules', // Key for Functions 2, 3, 4 (Saved schedules vault)
    COURSE_DATA: 'ubcCourseData',
    EXTRACTED_COURSES: 'ubcExtractedCourses',
    SCRAPED_COURSE_DATA: 'scrapedCourseData'
};

function getLocalValue(key) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(null);

        chrome.storage.local.get([key], (result) => {
            resolve(result[key] ?? null);
        });
    });
}

// ==========================================
// FUNCTION 1: Store Active UI Preferences
// ==========================================
/**
 * Saves the user's current raw form selections from the popup UI screen.
 * @param {Object} uiData - Object containing campus, level, term, year, and course codes array.
 * @returns {Promise<boolean>}
 */
async function saveUiWorkspace(uiData) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(false);

        chrome.storage.local.set({ [REGISTRY_KEYS.UI_WORKSPACE]: uiData }, () => {
            console.log("Storage Engine [1/4]: UI configuration workspace updated.", uiData);
            resolve(true);
        });
    });
}

// ==========================================
// FUNCTION 2: Add Extracted Schedule to Vault
// ==========================================
/**
 * Saves a compiled, fully automated schedule under a custom identifier name.
 * @param {string} scheduleName - Unique user-defined profile name (e.g., "Term 1 - No 8AMs")
 * @param {Object} scheduleData - Complex extracted details (timings, professors, rooms, etc.)
 * @returns {Promise<boolean>}
 */
async function saveFinalSchedule(scheduleName, scheduleData) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(false);

        chrome.storage.local.get([REGISTRY_KEYS.FINAL_SCHEDULES], (result) => {
            const vault = result[REGISTRY_KEYS.FINAL_SCHEDULES] || {};

            // Nest the full layout payload under the name key
            vault[scheduleName] = {
                createdTimestamp: new Date().toISOString(),
                ...scheduleData
            };

            chrome.storage.local.set({ [REGISTRY_KEYS.FINAL_SCHEDULES]: vault }, () => {
                console.log(`Storage Engine [2/4]: Schedule "${scheduleName}" successfully committed to vault.`);
                resolve(true);
            });
        });
    });
}

// ==========================================
// FUNCTION 3: Remove Schedule by Name
// ==========================================
/**
 * Deletes a saved final schedule from memory using its name key.
 * @param {string} scheduleName - The name of the target schedule profile to delete.
 * @returns {Promise<boolean>}
 */
async function removeFinalSchedule(scheduleName) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(false);

        chrome.storage.local.get([REGISTRY_KEYS.FINAL_SCHEDULES], (result) => {
            const vault = result[REGISTRY_KEYS.FINAL_SCHEDULES] || {};

            if (!vault[scheduleName]) {
                console.warn(`Storage Engine [3/4]: Target "${scheduleName}" not found in vault.`);
                return resolve(false);
            }

            // Evict the key property completely from the object dictionary
            delete vault[scheduleName];

            chrome.storage.local.set({ [REGISTRY_KEYS.FINAL_SCHEDULES]: vault }, () => {
                console.log(`Storage Engine [3/4]: Schedule "${scheduleName}" successfully purged.`);
                resolve(true);
            });
        });
    });
}

// ==========================================
// FUNCTION 4: Replace Schedule with New Data
// ==========================================
/**
 * Overwrites an existing named schedule option with fresh updated course parameters.
 * @param {string} scheduleName - The targeted schedule profile name key to modify.
 * @param {Object} updatedData - The fresh schedule data payload to inject.
 * @returns {Promise<boolean>}
 */
async function replaceFinalSchedule(scheduleName, updatedData) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(false);

        chrome.storage.local.get([REGISTRY_KEYS.FINAL_SCHEDULES], (result) => {
            const vault = result[REGISTRY_KEYS.FINAL_SCHEDULES] || {};

            if (!vault[scheduleName]) {
                console.warn(`Storage Engine [4/4]: Key "${scheduleName}" does not exist. Initializing alternative write route...`);
            }

            // Completely replace old values while appending a fresh modification log marker
            vault[scheduleName] = {
                lastModifiedTimestamp: new Date().toISOString(),
                ...updatedData
            };

            chrome.storage.local.set({ [REGISTRY_KEYS.FINAL_SCHEDULES]: vault }, () => {
                console.log(`Storage Engine [4/4]: Schedule "${scheduleName}" values successfully overwritten.`);
                resolve(true);
            });
        });
    });
}

// ==========================================
// FUNCTION 5: Retrieve a Single Schedule by Name
// ==========================================
/**
 * Fetches a specific compiled schedule configuration out of the vault using its name key.
 * @param {string} scheduleName - The unique profile name to look up.
 * @returns {Promise<Object|null>} The targeted schedule data object, or null if not found.
 */
async function getFinalScheduleByName(scheduleName) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(null);

        chrome.storage.local.get([REGISTRY_KEYS.FINAL_SCHEDULES], (result) => {
            const vault = result[REGISTRY_KEYS.FINAL_SCHEDULES] || {};
            const schedule = vault[scheduleName];

            if (schedule) {
                console.log(`Storage Engine: Successfully retrieved schedule "${scheduleName}".`);
                resolve(schedule);
            } else {
                console.warn(`Storage Engine: Schedule "${scheduleName}" could not be found in the vault.`);
                resolve(null);
            }
        });
    });
}

// ==========================================
// FUNCTION 6: Retrieve Active UI Options
// ==========================================
/**
 * Retrieves the currently saved UI form configuration selections.
 * @returns {Promise<Object|null>} The stored UI configuration object, or null if empty.
 */
async function getUiWorkspace() {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(null);

        chrome.storage.local.get([REGISTRY_KEYS.UI_WORKSPACE], (result) => {
            const uiData = result[REGISTRY_KEYS.UI_WORKSPACE];
            if (uiData) {
                console.log("Storage Engine [6/6]: Retrieved current UI workspace configurations.", uiData);
                resolve(uiData);
            } else {
                console.log("Storage Engine [6/6]: No UI configuration workspace found.");
                resolve(null);
            }
        });
    });
}

// ==========================================
// FUNCTION 1B: Retrieve Extracted Course Data
// ==========================================
/**
 * Gets the extracted course tree that navigation.js stores after scraping completes.
 * @returns {Promise<Object>}
 */
async function getCourseData() {
    const primary = await getLocalValue(REGISTRY_KEYS.COURSE_DATA);
    if (primary) return primary;

    const fallbackA = await getLocalValue(REGISTRY_KEYS.EXTRACTED_COURSES);
    if (fallbackA) return fallbackA;

    const fallbackB = await getLocalValue(REGISTRY_KEYS.SCRAPED_COURSE_DATA);
    return fallbackB || {};
}

// ==========================================
// FUNCTION 1C: Retrieve Form Data
// ==========================================
/**
 * Gets the saved popup form selections.
 * @returns {Promise<Object>}
 */
async function getFormData() {
    return (await getUiWorkspace()) || {};
}

// ==========================================
// FUNCTION 2B: Save Schedule with Validation
// ==========================================
/**
 * Saves or updates a named schedule while preventing duplicate names.
 * @param {Object} scheduleData
 * @param {string|null} editingScheduleId
 * @param {string|null} originalName
 * @returns {Promise<{success:boolean,error?:string,schedule?:Object}>}
 */
async function saveScheduleWithValidation(scheduleData, editingScheduleId = null, originalName = null) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            resolve({ success: false, error: 'Storage unavailable' });
            return;
        }

        chrome.storage.local.get([REGISTRY_KEYS.FINAL_SCHEDULES], (result) => {
            const vault = result[REGISTRY_KEYS.FINAL_SCHEDULES] || {};
            const nextName = (scheduleData?.name || 'Untitled Schedule').trim();
            const nextId = editingScheduleId || scheduleData?.id || crypto.randomUUID();

            const duplicate = Object.entries(vault).find(([key, value]) => {
                const sameEntry = key === nextId || value?.id === nextId;
                if (sameEntry) return false;
                return (value?.name || key).trim().toLowerCase() === nextName.toLowerCase();
            });

            if (duplicate && duplicate[1]) {
                resolve({ success: false, error: 'Schedule name already exists' });
                return;
            }

            if (editingScheduleId && editingScheduleId !== nextId) {
                delete vault[editingScheduleId];
            }

            vault[nextId] = {
                id: nextId,
                name: nextName,
                ...scheduleData,
                name: nextName,
                lastModifiedTimestamp: new Date().toISOString(),
                originalName: originalName || null
            };

            chrome.storage.local.set({ [REGISTRY_KEYS.FINAL_SCHEDULES]: vault }, () => {
                resolve({ success: true, schedule: vault[nextId] });
            });
        });
    });
}

// ==========================================
// FUNCTION 3B: Delete Schedule by Id
// ==========================================
/**
 * Deletes a schedule from the vault by id or name.
 * @param {string} scheduleId
 * @returns {Promise<boolean>}
 */
async function deleteSchedule(scheduleId) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(false);

        chrome.storage.local.get([REGISTRY_KEYS.FINAL_SCHEDULES], (result) => {
            const vault = result[REGISTRY_KEYS.FINAL_SCHEDULES] || {};

            if (vault[scheduleId]) {
                delete vault[scheduleId];
            } else {
                const entry = Object.entries(vault).find(([key, value]) => key === scheduleId || value?.id === scheduleId || value?.name === scheduleId);
                if (!entry) return resolve(false);
                delete vault[entry[0]];
            }

            chrome.storage.local.set({ [REGISTRY_KEYS.FINAL_SCHEDULES]: vault }, () => resolve(true));
        });
    });
}

// ==========================================
// FUNCTION 5B: Retrieve Schedule by Id
// ==========================================
/**
 * Fetches a saved schedule by id or name.
 * @param {string} scheduleId
 * @returns {Promise<Object|null>}
 */
async function getScheduleById(scheduleId) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(null);

        chrome.storage.local.get([REGISTRY_KEYS.FINAL_SCHEDULES], (result) => {
            const vault = result[REGISTRY_KEYS.FINAL_SCHEDULES] || {};
            const direct = vault[scheduleId];
            if (direct) {
                resolve({ id: scheduleId, ...direct });
                return;
            }

            const found = Object.entries(vault).find(([key, value]) => key === scheduleId || value?.id === scheduleId || value?.name === scheduleId);
            if (found) {
                resolve({ id: found[0], ...found[1] });
                return;
            }

            resolve(null);
        });
    });
}

// ==========================================
// FUNCTION 5C: Retrieve All Schedules
// ==========================================
/**
 * Returns all saved schedules as an array for the calendar UI.
 * @returns {Promise<Array>}
 */
async function getAllSchedules() {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve([]);

        chrome.storage.local.get([REGISTRY_KEYS.FINAL_SCHEDULES], (result) => {
            const vault = result[REGISTRY_KEYS.FINAL_SCHEDULES] || {};
            const schedules = Object.entries(vault).map(([key, value]) => ({
                id: value?.id || key,
                name: value?.name || key,
                ...value,
                id: value?.id || key,
                name: value?.name || key
            }));
            resolve(schedules);
        });
    });
}