
const REGISTRY_KEYS2 = {
    UI_WORKSPACE2: 'ubc_ui_workspace_draft', // Key for Function 1 (UI draft preferences)
    FINAL_SCHEDULES2: 'ubc_compiled_schedules', // Key for saved schedules
    COURSE_DATA2: 'ubcCourseData',
    EXTRACTED_COURSES2: 'ubcExtractedCourses',
    SCRAPED_COURSE_DATA2: 'scrapedCourseData',
    ORIGIN_TAB_ID2: 'ubcOriginTabId'
};
/**
 * Normalizes UI inputs into the strict string format required by the automation.
 * @param {Object} rawData - The raw data from your UI selection.
 * @returns {Object} A clean, standardized object ready for Workday navigation.
 */
function normalizeOptions(rawData) {
    return {
        campus: mapCampus(rawData.campus),
        level: mapLevel(rawData.level),
        year: mapYear(rawData.year), // Assuming this is already in "YYYY-YYYY" format
        term: mapTerm(rawData.term)
    };
}
/**
 * Scrolls a Workday result container to the bottom until no more items load,
 * then resets the scroll position back to the top.
 * @param {string} itemSelector - The selector for the items (e.g., '[data-automation-id="compositeContainer"]')
 */
/**
 * Alternately scrolls a Workday container to the bottom until no more items load,
 * then instantly snaps back to the top frame.
 * @param {string} itemSelector - The selector for items (e.g., '[data-automation-id="compositeContainer"]')
 */
/**
 * Alternately scrolls a Workday container to the bottom until no more items load,
 * then instantly breaks and jumps back to the top frame.
 * @param {string} itemSelector - The selector for items (e.g., '[data-automation-id="compositeContainer"]')
 */
const autoScrollToLoadAll = async (itemSelector) => {
    const scrollContainer = document.querySelector('[data-automation-id="scrollableContainer"]') || document.documentElement;

    let lastHeight = scrollContainer.scrollHeight;
    let lastCount = document.querySelectorAll(itemSelector).length;
    let keepScrolling = true;
    let stableAttempts = 0;

    console.log("Starting high-speed scroll check...");

    while (keepScrolling) {
        // 1. Force structural scroll displacement down
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        window.scrollTo(0, document.body.scrollHeight);

        // 2. High-speed poll: wait 350ms instead of 1000ms
        await delay(350);

        const currentHeight = scrollContainer.scrollHeight;
        const currentCount = document.querySelectorAll(itemSelector).length;

        // 3. Check if either the content height OR the item count grew
        if (currentHeight > lastHeight || currentCount > lastCount) {
            lastHeight = currentHeight;
            lastCount = currentCount;
            stableAttempts = 0; // Reset since new items are still rendering
        } else {
            stableAttempts++;
        }

        // 4. CRITICAL: If nothing changed over two checks (~0.7 seconds total), we are done!
        if (stableAttempts >= 2) {
            keepScrolling = false;
        }
    }

    console.log("Bottom confirmed. Executing instant snap-to-top...");

    // 5. Zero-delay instant jump up (bypasses smooth scroll lag)
    if (scrollContainer.scrollTo) {
        scrollContainer.scrollTo({ top: 0, behavior: 'ausmoothto' });
    } else {
        scrollContainer.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Minimal stabilization pause so Workday frame updates before next keystroke
    await delay(150);
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const formatCourseList = (courseList, variable) => {
    console.log(courseList, variable);
    return courseList.map(course => {
        // Updated Regex: Added \s* to handle an optional or mandatory space
        const match = course.match(/^([A-Za-z]+)\s*(\d+)$/);

        if (match) {
            const dept = match[1]; // e.g., "CPSC"
            const num = match[2];  // e.g., "121"
            return `${dept}${variable} ${num}`;
        }

        // Return original if it doesn't match the expected format
        return course;
    });
};


// --- Helper Mappers ---

/**
 * Updates the text displayed in the popup working-state
 * @param {string} text - The new status message to show
 */
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

function sendError(msg) {
    try {
        chrome.runtime.sendMessage({ type: 'SHOW_TOAST', message: msg });
        console.error("Automation Error:", msg);
    } catch (e) {
        console.error("Critical error sending toast:", e);
    }
};

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
async function getUiWorkspace2() {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return resolve(null);

        chrome.storage.local.get([REGISTRY_KEYS2.UI_WORKSPACE2], (result) => {
            const uiData = result[REGISTRY_KEYS2.UI_WORKSPACE2];
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

async function openCalendarTab() {
    try {
        chrome.runtime.sendMessage({ action: 'OPEN_CALENDAR_PAGE' });
    } catch (error) {
        console.error('Failed to request calendar tab open:', error);
    }
}

async function storeOriginTabId() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const originTabId = tabs?.[0]?.id || null;
            if (!originTabId) {
                resolve(null);
                return;
            }

            chrome.storage.session?.set
                ? chrome.storage.session.set({ [REGISTRY_KEYS2.ORIGIN_TAB_ID2]: originTabId }, () => resolve(originTabId))
                : chrome.storage.local.set({ [REGISTRY_KEYS2.ORIGIN_TAB_ID2]: originTabId }, () => resolve(originTabId));
        });
    });
}
/////Normalizing function to ensure consistent formatting of user inputs before processing. This is crucial for the automation to correctly interpret the selections and navigate Workday without errors.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_AUTOMATION") {
        console.log("Message received, starting automation...");

        // NOW this will work because 'document' is the Workday page!
        navigateTillCourseSearch();
    }
});



async function navigateTillCourseSearch() {
    const rawUiData = await getUiWorkspace2();
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

    cousreDataExtraction(); // Start the next phase of the automation (data extraction) immediately after reaching the course search page   
}



async function cousreDataExtraction() {
    const rawUiData = await getUiWorkspace2();
    updatePopupStatus("Extracting Course Data...");
    // Placeholder for the next phase of the automation, which would extract course data from the search results page and save it to storage.
    console.log("Course data extraction phase would start now...");

    const campusSuffix = rawUiData.campus === 'vancouver' ? '_V' : '_O';

    const newCourseList = await formatCourseList(rawUiData.courseList, campusSuffix);
    console.log("Formatted course list for search:", newCourseList);

    const allCourseData = {};

    // === HELPER: Parse subheader text to extract section type and status ===
    // e.g. "Lecture   |   Open   |   In Person Learning   |   4 Credits   |   Enrolled/Capacity: 204/216"
    const parseSubHeader = (text) => {
        const parts = text.split('|').map(p => p.trim());
        return {
            sectionType: parts[0] || '',                    // "Lecture", "Laboratory", "Discussion", etc.
            status: parts[1] || '',                         // "Open", "Closed", "Waitlisted"
            learningType: parts[2] || '',                   // "In Person Learning", "Remote", etc.
            credits: parseInt((parts[3] || '').match(/\d+/)?.[0]) || 0,
            enrolledCapacity: parts[4] || '',               // "Enrolled/Capacity: 204/216"
            extras: parts.slice(5)                          // Any remaining info
        };
    };

    // === HELPER: Parse section detail text to extract timing info ===
    // e.g. "UBCV | Gordon B. Shrum Building (SHRM) | Floor: -1 | Room: B1001 | Tue Thu | 9:30 a.m. - 11:00 a.m. | 2026-01-06 - 2026-02-12"
    const parseSectionDetail = (text) => {
        const parts = text.split('|').map(p => p.trim());
        // Format: campus | building | floor | room | days | time | dates
        return {
            campus: parts[0] || '',
            building: parts[1] || '',
            floor: parts[2] || '',
            room: parts[3] || '',
            days: (parts[4] || '').split(/\s+/).map(d => d.toUpperCase()),
            timing: parts[5] || '',
            dateRange: parts[6] || ''
        };
    };

    // === HELPER: Extract section code from course title ===
    // "CPSC_V 121-201 - Models of Computation" -> "201"
    // "CPSC_V 121-L22 - Models of Computation" -> "L22"
    const extractSectionCode = (title) => {
        const match = title.match(/\d+-([A-Z0-9]+)\s*-/i);
        return match ? match[1] : '';
    };


    // === MAIN EXTRACTION LOOP: Process each course ===
    for (let courseIdx = 0; courseIdx < newCourseList.length; courseIdx++) {
        const searchTerm = newCourseList[courseIdx];

        // --- STEP 1: Focus on search input box ---
        try {

            let searchInput = null;
            let retries = 0;

            // Try to find the input up to 20 times (giving the page 4 seconds to load)
            while (!searchInput && retries < 20) {
                searchInput = document.querySelector('[data-automation-id="textInputBox"]');
                if (!searchInput) {
                    await delay(200); // Wait 200ms before retrying
                    retries++;
                }
            }

            if (!searchInput) {
                sendError(`Search input not found for ${searchTerm}`);
                continue; // Skip this course and try the next one
            }


            searchInput.focus();
            searchInput.value = '';
            console.log(searchTerm);
            await delay(200);

            // --- STEP 2: Type the course code ---
            searchInput.value = searchTerm;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            await delay(300);
        } catch (e) {
            sendError(`Search input not found for ${searchTerm}`);
        }


        // --- STEP 3: Click the Search button ---
        try {
            const searchButton = document.querySelector('[data-automation-id="advancedSearchButton"]');
            searchButton.click();
        } catch (e) {
            sendError(`Search button not found for ${searchTerm}`);

        }

        await delay(1100); // Wait for search results to load

        // --- STEP 4: Click the first expand chevron to see full details ---
        // This is needed to get complete date info for all sections
        const firstChevron = document.querySelector('[data-automation-id="compositeToggleIcon"]');
        if (firstChevron && firstChevron.getAttribute('aria-expanded') !== 'true') {
            firstChevron.click();
            await delay(800); // Wait for details to expand
        }

        // --- STEP 4.5: FORCE LOAD ALL ITEMS (The Scroll Fix) ---
        await autoScrollToLoadAll('[data-automation-id="compositeContainer"]');

        // --- STEP 5: Get all section containers for this course ---

        const sectionContainers = document.querySelectorAll('[data-automation-id="compositeContainer"]');

        if (sectionContainers.length === 0) {
            sendError('No course section found');
            return; // Stop all clicks, show error on popup
        }

        // Initialize CourseStruc for this course
        const courseStruc = {};

        // Get expanded section details from first item for date reference
        let referenceDetails = [];
        const expandedDetailSection = document.querySelector('[data-automation-id="compositeDetail"]');
        if (expandedDetailSection) {
            // Get all detail items from expanded section
            const detailItems = expandedDetailSection.querySelectorAll('[data-automation-id="promptOption"]');
            detailItems.forEach(item => {
                const label = item.getAttribute('data-automation-label') || item.textContent || '';
                if (label.includes('|')) {
                    referenceDetails.push(parseSectionDetail(label));
                }
            });
        }

        // --- STEP 6: Iterate over all section <li> tags and extract data ---
        sectionContainers.forEach((container, idx) => {
            // Get section title/name element
            const titleEl = container.querySelector('[data-automation-id="promptOption"]');
            const title = titleEl?.getAttribute('data-automation-label') || titleEl?.textContent || '';

            // Get subheader with section type, status, credits, etc.
            const subHeaderEl = container.querySelector('[data-automation-id="compositeSubHeaderOne"]');
            const subHeaderText = subHeaderEl?.getAttribute('title') || subHeaderEl?.textContent || '';

            const parsed = parseSubHeader(subHeaderText);

            // Skip closed sections - only process "Open" ones
            if (parsed.status.toLowerCase() !== 'open') {
                return; // Continue to next section
            }

            const sectionType = parsed.sectionType; // "Lecture", "Laboratory", "Discussion", etc.
            const sectionCode = extractSectionCode(title);

            // Get preview detail (visible without expanding)
            const previewDetail = container.querySelector('[data-automation-id="compositeDetailPreview"] [data-automation-id="promptOption"]');
            const previewText = previewDetail?.getAttribute('data-automation-label') || previewDetail?.textContent || '';
            const previewParsed = parseSectionDetail(previewText);

            // Build section object
            const sectionData = {
                code: sectionCode,
                credits: parsed.credits,
                dates: [],              // Will hold multiple date ranges if applicable
                timing: previewParsed.timing,
                days: previewParsed.days,
                location: `${previewParsed.campus} | ${previewParsed.building} | ${previewParsed.floor} | ${previewParsed.room}`,
                enrolledCapacity: parsed.enrolledCapacity,
                learningType: parsed.learningType
            };

            // For dates: use reference details from expanded first section
            // This captures multiple date ranges (e.g., before and after break)
            if (idx === 0 && referenceDetails.length > 0) {
                // First section - use expanded details
                sectionData.dates = referenceDetails.map(d => d.dateRange);
            } else if (previewParsed.dateRange) {
                // Other sections - use preview date
                sectionData.dates = [previewParsed.dateRange];
            }

            // Initialize section type array if needed
            if (!courseStruc[sectionType]) {
                courseStruc[sectionType] = [];
            }

            // Add this section to appropriate type
            courseStruc[sectionType].push(sectionData);
        });

        // Store course data
        allCourseData[searchTerm] = courseStruc;

        // Small delay before next course search
        await delay(500);
    }


    console.log(allCourseData)

    const finishNavigationAndOpenCalendar = async (allCourseData) => {
    console.log("Scraping complete! Routing to background handler...");

    // 1. Use chrome.storage.local so both scripts can safely access it
    chrome.storage.local.set(
        {
            [REGISTRY_KEYS2.COURSE_DATA2]: allCourseData,
            [REGISTRY_KEYS2.EXTRACTED_COURSES2]: allCourseData,
            [REGISTRY_KEYS2.SCRAPED_COURSE_DATA2]: allCourseData
        },
        async () => {
            await storeOriginTabId();
            await openCalendarTab();
        }
    );
};



finishNavigationAndOpenCalendar(allCourseData); // Pass the extracted course data to the next phase (calendar rendering)


}


