chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "START_AUTOMATION2") {
        console.log("Automation signal received inside Workday tab.");
        navigateTillCourseSearch7(); // This function now has access to document
        sendResponse({ status: "started" });
    }
    return true;
});

async function navigateTillCourseSearch7() {
    console.log("Executing chunky navigation...");
    async function getRawData() {
        try {
            // You can pass the key as a string or an array
            const result = await chrome.storage.local.get(['rawdata']);

            if (result.rawdata) {
                console.log('✅ Data retrieved:', result.rawdata);
                return result.rawdata;
            } else {
                console.log('⚠️ No data found under "rawdata"');
                return null;
            }
        } catch (error) {
            console.error('❌ Error fetching data:', error);
        }
    }
    const rawUiData = await getRawData();
    if (!rawUiData) {
        console.error("❌ No rawUiData found in storage. Navigation aborted.");
        return;
    }
    function mapCampus(input) {
        const val = input.toLowerCase();
        if (val.includes("vancouver") || val.includes("ubcv")) return "vancouver";
        if (val.includes("okanagan") || val.includes("ubco")) return "okanagan";
        return "vancouver"; // Default fallback
    }

    function mapYear(input) {
        // Replace the slash with a hyphen if it exists, otherwise return as is
        return input.replace('/', '-');
    }

    function mapLevel(input) {
        const val = input.toLowerCase();
        if (val.includes("undergrad")) return "undergraduate";
        if (val.includes("graduate" && !val.includes("under"))) return "graduate";
    }

    function mapTerm(input) {
        const val = input.toLowerCase();
        if (val.includes("winter1") || val.includes("w1")) return "winter1";
        if (val.includes("winter2") || val.includes("w2")) return "winter2";
        if (val.includes("summer")) return "summer";
    }

    function normalizeOptions(rawData) {
        return {
            campus: mapCampus(rawData.campus),
            level: mapLevel(rawData.level),
            year: mapYear(rawData.year), // Assuming this is already in "YYYY-YYYY" format
            term: mapTerm(rawData.term)
        };
    }



    console.log("Starting navigation process...");
    console.log("Raw UI data retrieved for navigation:", rawUiData);
    const cleanConfig = normalizeOptions(rawUiData);

    if (!rawUiData) { console.log("No UI workspace data found. Navigation aborted."); return; }

    const { campus, level, term, year } = cleanConfig;

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const sendError = (msg) => {
        try {
            chrome.runtime.sendMessage({ type: 'automation-error', message: msg });
        } catch (e) { }
    };
    const sendComplete = () => {
        try {
            chrome.runtime.sendMessage({ type: 'automation-complete' });
        } catch (e) { }
    };


    // --- STAGE 1: Check page & navigate to Academics (skip if already there) --

    const titleEl = document.querySelector('[data-automation-id="pageHeaderTitleText"]');
    const isAlreadyAcademics = titleEl && (titleEl.innerText || titleEl.textContent || '').trim() === 'Academics';

    const updatePopupStatus = (text) => {
        try {
            chrome.runtime.sendMessage({
                type: 'UPDATE_WORKING_TEXT',
                newText: text
            });
        } catch (e) {
            console.error("Failed to update popup status:", e);
        }
    };
    if (!isAlreadyAcademics) {
        // Click Student in sidebar to expand menu
        const studentBtn = Array.from(document.querySelectorAll('[data-automation-id="sidebarL1"]')).find(
            (b) => (b.innerText || b.textContent || '').trim() === 'Student'
        );
        if (studentBtn) {
            updatePopupStatus("Opening Course Search Page...");
            studentBtn.click();
            await delay(500);
        }

        // Click Academics link to open Academics section
        const academicsLink = Array.from(document.querySelectorAll('[data-automation-id="sidebarL2"]')).find(
            (el) => (el.innerText || el.textContent || '').trim() === 'Academics'
        );
        if (academicsLink) {
            academicsLink.click();
            await delay(1000);
        }
    }

    // --- STAGE 2: Click Registration & Courses tab ---
    const regTab = Array.from(document.querySelectorAll('[data-automation-id="tabLabel"]')).find(
        (t) => (t.innerText || t.textContent || '').trim() === 'Registration & Courses'
    );
    if (regTab) {
        regTab.click();
        await delay(1149);
    }

    // --- STAGE 3: Click Find Course Sections menu item ---
    const findCourseItem = Array.from(document.querySelectorAll('[data-automation-id="menuItem"]')).find(
        (m) => (m.innerText || m.textContent || '').trim() === 'Find Course Sections'
    );
    if (findCourseItem) {
        findCourseItem.click();
        await delay(600);
    }

    // --- STAGE 4: Open Academic Period dropdown (1st multiselect) ---
    const multiContainers = document.querySelectorAll('[data-automation-id="multiselectInputContainer"]');
    const periodContainer = multiContainers[0]; // First container = Academic Period

    if (!periodContainer) {
        sendError("Academic Period input not found");
        return;
    }

    periodContainer.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await delay(500);

    const innerInput = periodContainer.querySelector('input[data-uxi-widget-type="selectinput"]');

    if (innerInput) {
        innerInput.focus();
        ['mousedown', 'mouseup', 'click'].forEach(type => {
            innerInput.dispatchEvent(new MouseEvent(type, {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
            }));
        });
        innerInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    } else {
        sendError("Could not find internal input field");
        return;
    }

    await delay(600);

    // Helper: poll for promptOption to appear (Workday loads options dynamically)
    const waitForPeriodOption = async (label) => {
        for (let i = 0; i < 20; i++) {
            let el = document.querySelector(`[data-automation-id="promptOption"][data-automation-label="${label}"]`);
            if (!el) {
                el = Array.from(document.querySelectorAll('[data-automation-id="promptOption"]')).find(
                    (e) => (e.getAttribute('data-automation-label') || e.textContent || '').trim() === label
                );
            }
            if (el) return el;
            await delay(250);
        }
        return null;
    };
    let periodLabel = '';

    if (rawUiData.timePeriod === 'current') { periodLabel = "Current Periods"; }
    if (rawUiData.timePeriod === 'future') { periodLabel = "Future Periods"; }
    if (rawUiData.timePeriod === 'past') { periodLabel = "Past Periods"; }
    if (rawUiData.timePeriod === 'non-year') { periodLabel = "Non-Year"; }
    const periodOption = await waitForPeriodOption(periodLabel);
    if (periodOption) {
        periodOption.scrollIntoView({ block: 'center', behavior: 'auto' });
        await delay(150);
        periodOption.click();
        await delay(700);
    }


    // --- STAGE 6: Select Academic Year (e.g. 2024-25 UBC-V Academic Year) ---
    const school = campus === 'vancouver' ? 'UBC-V' : 'UBC-O';
    const yearShort = year;
    const yearSearchStr = `${yearShort} ${school} Academic Year`;

    try {
        const yearOption = Array.from(document.querySelectorAll('[data-automation-id="promptOption"]')).find(
            (el) => (el.textContent || el.getAttribute('data-automation-label') || '').trim() === yearSearchStr
        );
        yearOption.click();


    } catch (e) {

        sendError('No study term found! 🥀🥀😭');
    }

    await delay(700);

    // --- STAGE 7: Select Term (Winter Term 1 / Winter Term 2 / Summer Session) ---
    const termLabels = {
        winter1: 'Winter Term 1',
        winter2: 'Winter Term 2',
        summer: 'Summer Session'
    };

    const searchText = termLabels[rawUiData.term] || rawUiData.term;

    // Find menuItem row matching term label
    try {
        const termMenuItem = Array.from(
            document.querySelectorAll('[data-automation-id="menuItem"]')
        ).find(el =>
            (el.getAttribute('aria-label') || '').includes(searchText)
        );

        // Click checkbox to select the term
        try {
            const checkbox = termMenuItem.querySelector(
                'input[data-automation-id="checkboxPanel"]'
            );
            // Only click if not already checked
            if (checkbox.getAttribute('aria-checked') !== 'true') {
                checkbox.click();
            }
        } catch (e) {

            sendError('No study term found! 🥀🥀😭');
        }
    } catch (e) {

        sendError('No study term found! 🥀🥀😭');
    }

    // --- STAGE 8: Open Level dropdown (2nd multiselect = Academic Period) ---
    try {
        const multiContainersForLevel = document.querySelectorAll('[data-automation-id="multiselectInputContainer"]');
        const periodContainer1 = multiContainersForLevel[1];

        periodContainer1.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await delay(500);

        const innerInputLevel = periodContainer1.querySelector('input[data-uxi-widget-type="selectinput"]');

        if (innerInputLevel) {
            innerInputLevel.focus();
            ['mousedown', 'mouseup', 'click'].forEach(type => {
                innerInputLevel.dispatchEvent(new MouseEvent(type, {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    buttons: 1
                }));
            });
            innerInputLevel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        } else {
            sendError("Could not find internal input field");
            return;
        }

        await delay(530);
    } catch (e) {

        sendError('Sorry bro error while doing the work for u. 👹😩😭');
    }

    // --- STAGE 9: Select Level (Graduate or Undergraduate) ---
    try {
        const levelSearchText = rawUiData.level.charAt(0).toUpperCase() + rawUiData.level.slice(1);

        const levelMenuItem = Array.from(
            document.querySelectorAll('[data-automation-id="menuItem"]')
        ).find(el =>
            (el.getAttribute('aria-label') || '')
                .toLowerCase()
                .includes(levelSearchText.toLowerCase())
        );

        if (!levelMenuItem) {
            sendError('Level option not found');
            return;
        }

        const levelCheckbox = levelMenuItem.querySelector(
            'input[data-automation-id="checkboxPanel"]'
        );

        if (!levelCheckbox) {
            sendError('Checkbox not found inside level option');
            return;
        }

        if (levelCheckbox.getAttribute('aria-checked') !== 'true') {
            levelCheckbox.click();
        }

        await delay(350);
    } catch (e) {

        sendError('No study term found! 🥀🥀😭');
    }

    // --- STAGE 10: Click OK to apply filters ---
    const okButton = document.querySelector('button[title="OK"]') ||
        document.querySelector('[data-automation-id="wd-CommandButton_uic_okButton"]');

    /**
 * Polls the DOM until a specific element exists and is visible.
 * @param {string} selector - The CSS selector to look for.
 * @param {number} timeout - Max time to wait in ms (default 10s).
 */
    async function waitForElement(selector, timeout = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            // Check if element exists and is actually visible to the user
            if (el && el.offsetParent !== null) {
                return el;
            }
            await new Promise(r => setTimeout(r, 50)); // Poll every 250ms
        }
        return null;
    }

    if (okButton) {
        okButton.click();

        // Instead of a 5s delay, we wait specifically for the header title container
        // This looks for the header that specifically contains the text "Find Course Sections"
        updatePopupStatus("Almost There ...");
        const resultsHeader = await waitForElement('[data-automation-id="viewStackHeaderTitle"] [data-automation-label="Find Course Sections"]');

        if (!resultsHeader) {
            console.log("Timed out waiting for the results page to render.");
            // Optional: sendError("Results page took too long to load.");
        } else {
            console.log("Results page rendered successfully.");
        }
    }

    console.log("Reached course search page.")

}