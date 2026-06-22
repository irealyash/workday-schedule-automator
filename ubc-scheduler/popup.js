/**
 * UBC Scheduler - Premium Extension Logic
 * Controls DOM manipulation, persistence, and state management.
 */



document.addEventListener('DOMContentLoaded', () => {
    // === DOM Elements Cache ===
    const courseInputsContainer = document.getElementById('courseInputsContainer');
    const yearOptionsContainer = document.getElementById('year-options');
    const addCourseBtn = document.getElementById('addCourseBtn');
    const submitBtn = document.getElementById('submit-btn');
    const validationErrorEl = document.getElementById('validation-error');
    const popupForm = document.getElementById('schedulerForm');
    const saveSchedulePopupBtn = document.getElementById('saveSchedulePopupBtn');
    const savedSchedulesScreen = document.getElementById('saved-schedules-screen');
    const backToMainBtn = document.getElementById('backToMainBtn');
    const savedSchedulesListPopup = document.getElementById('savedSchedulesListPopup');
    const noSavedPopup = document.getElementById('noSavedPopup');
    const addToWorkdayBtnPopup = document.getElementById('addToWorkdayBtnPopup');
    console.log('popup.js: DOMContentLoaded');



    // === Core Configuration Constants ===
    const MAX_COURSES = 15; // Locks layout threshold to prevent extension viewport clipping

    // ==========================================
    // 1. SESSION PERSISTENCE (Save & Load State)
    // ==========================================

    /**
     * Serializes the entire popup form state and saves it to local extension storage.
     */


    function saveFormState() {
        const state = {
            campus: document.querySelector('input[name="campus"]:checked')?.value || '',
            level: document.querySelector('input[name="level"]:checked')?.value || '',
            timePeriod: document.querySelector('input[name="timePeriod"]:checked')?.value || 'future',
            term: document.querySelector('input[name="term"]:checked')?.value || '',
            year: document.querySelector('input[name="year"]:checked')?.value || '',
            courses: []
        };

        // Collect all active course text strings
        const inputs = courseInputsContainer.querySelectorAll('.course-input');
        inputs.forEach(input => {
            if (input.value.trim() !== '') {
                state.courses.push(input.value.trim());
            }
        });

        // Commit to Chrome's isolated storage framework
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ schedulerDraft: state });
        }
    }

    /**
     * Restores the visual layout states from chrome storage on popup launch.
     */
    function loadFormState() {
        generateAcademicYearOptions(document.querySelector('input[name="timePeriod"]:checked')?.value || 'future');

        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get(['schedulerDraft'], (result) => {
            const data = result.schedulerDraft;
            if (!data) {
                return;
            }

            // Restore active radio bubble option states
            if (data.campus) {
                const target = document.querySelector(`input[name="campus"][value="${data.campus}"]`);
                if (target) target.checked = true;
            }
            if (data.level) {
                const target = document.querySelector(`input[name="level"][value="${data.level}"]`);
                if (target) target.checked = true;
            }
            if (data.timePeriod) {
                const target = document.querySelector(`input[name="timePeriod"][value="${data.timePeriod}"]`);
                if (target) target.checked = true;
            }

            generateAcademicYearOptions(
                data.timePeriod || document.querySelector('input[name="timePeriod"]:checked')?.value || 'future',
                data.year || ''
            );

            if (data.term) {
                const target = document.querySelector(`input[name="term"][value="${data.term}"]`);
                if (target) target.checked = true;
            }

            // Restore course rows if any saved strings exist
            if (data.courses && data.courses.length > 0) {
                // Clear initial static rows to rebuild clean state
                courseInputsContainer.innerHTML = '';
                data.courses.forEach(courseCode => {
                    createNewCourseRow(courseCode);
                });
            }

            toggleAddButtonVisibility();
        });
    }

    function getCurrentAcademicStartYear() {
        const now = new Date();
        const month = now.getMonth();
        return month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    }

    function formatAcademicYear(startYear) {
        return `${startYear}-${String(startYear + 1).slice(-2)}`;
    }

    function generateAcademicYearOptions(_timePeriod = 'future', preferredYear = '') {
        if (!yearOptionsContainer) return;

        const baseYear = getCurrentAcademicStartYear();
        const startYears = [baseYear, baseYear + 1];

        yearOptionsContainer.innerHTML = '';

        startYears.forEach((startYear, index) => {
            const label = document.createElement('label');
            label.className = 'bubble-option';

            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'year';
            input.value = formatAcademicYear(startYear);
            input.required = true;

            const bubble = document.createElement('span');
            bubble.className = 'bubble-btn';
            bubble.textContent = input.value;

            label.appendChild(input);
            label.appendChild(bubble);
            yearOptionsContainer.appendChild(label);

            const shouldCheck = preferredYear
                ? preferredYear === input.value
                : index === 0;

            if (shouldCheck) {
                input.checked = true;
            }
        });

        const checked = yearOptionsContainer.querySelector('input[name="year"]:checked');
        if (!checked) {
            const first = yearOptionsContainer.querySelector('input[name="year"]');
            if (first) first.checked = true;
        }
    }

    function setValidationError(message = '') {
        if (!validationErrorEl) return;

        if (message) {
            validationErrorEl.textContent = message;
            validationErrorEl.hidden = false;
        } else {
            validationErrorEl.textContent = '';
            validationErrorEl.hidden = true;
        }
    }

    function getValidationMessage(coursesCount) {
        const campusValue = document.querySelector('input[name="campus"]:checked')?.value;
        const levelValue = document.querySelector('input[name="level"]:checked')?.value;
        const timePeriodValue = document.querySelector('input[name="timePeriod"]:checked')?.value;
        const termValue = document.querySelector('input[name="term"]:checked')?.value;
        const yearValue = document.querySelector('input[name="year"]:checked')?.value;

        const hasMissingRequiredField = !campusValue || !levelValue || !timePeriodValue || !termValue || !yearValue;
        const hasNoCourses = coursesCount === 0;

        if (hasMissingRequiredField) {
            return 'Please answer all fields.';
        }

        if (hasNoCourses) {
            return 'At least one course should be added.';
        }

        return '';
    }

    // ==========================================
    // 2. DYNAMIC ROW ACTIONS (DOM Management)
    // ==========================================

    /**
     * Injects a standard premium course row block into the UI wrapper with live preview capability.
     * @param {string} initialValue - Prefilled course string if building from cache.
     */
    function createNewCourseRow(initialValue = '') {
        const rowCount = courseInputsContainer.querySelectorAll('.course-row').length;
        if (rowCount >= MAX_COURSES) return;

        // Generate the structural course row skeleton with a live preview container
        const rowDiv = document.createElement('div');
        rowDiv.className = 'course-row';
        rowDiv.innerHTML = `
            <input type="text" class="course-input" placeholder="e.g., CPSC 121" value="${initialValue}" autocomplete="off">
            <span class="course-preview">${initialValue ? formatCourseCode(initialValue) : ''}</span>
            <button type="button" class="remove-course-btn" title="Remove course">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        courseInputsContainer.appendChild(rowDiv);

        if (!initialValue) {
            rowDiv.querySelector('.course-input').focus();
        }

        toggleAddButtonVisibility();
    }

    /**
     * Helper function to parse raw text string (e.g., "cpsc121") into beautiful spaced code ("CPSC 121")
     */
    /**
  * Helper function to instantly separate the alphabetical course code from the numbers with a space
  */
    function formatCourseCode(text) {
        // Strip any existing accidental spaces and make it uppercase
        const cleaned = text.toUpperCase().replace(/\s+/g, '');

        // Captures all letters in group 1, and the first number plus anything after it in group 2
        const match = cleaned.match(/^([A-Z]+)(\d+.*)$/);

        if (match) {
            return `${match[1]} ${match[2]}`;
        }

        // Just returns the letters (like "CPSC") while they are still typing the subject name
        return cleaned;
    }

    function toggleAddButtonVisibility() {
        const currentRows = courseInputsContainer.querySelectorAll('.course-row').length;
        if (currentRows >= MAX_COURSES) {
            addCourseBtn.style.display = 'none';
        } else {
            addCourseBtn.style.display = 'flex';
        }
    }

    // ==========================================
    // 3. LISTENERS & DELEGATION (Updated for Live Preview)
    // ==========================================

    addCourseBtn.addEventListener('click', () => {
        createNewCourseRow();
        saveFormState();
    });

    if (popupForm) {
        popupForm.addEventListener('change', (event) => {
            if (event.target.name === 'timePeriod') {
                generateAcademicYearOptions(event.target.value);
            }

            saveFormState();
        });
    }

    courseInputsContainer.addEventListener('click', (event) => {
        const removeBtn = event.target.closest('.remove-course-btn');
        if (removeBtn) {
            const targetRow = removeBtn.closest('.course-row');
            if (targetRow) {
                targetRow.remove();
                toggleAddButtonVisibility();
                saveFormState();
            }
        }
    });

    // Monitors changes live to format input and instantly render the preview element
    courseInputsContainer.addEventListener('input', (event) => {


        if (event.target.classList.contains('course-input')) {
            const inputEl = event.target;
            const targetRow = inputEl.closest('.course-row');
            const previewEl = targetRow.querySelector('.course-preview');

            // Force dynamic capitalize rules inline safely without breaking the user cursor tracking
            const cursorPosition = inputEl.selectionStart;
            inputEl.value = inputEl.value.toUpperCase();
            inputEl.setSelectionRange(cursorPosition, cursorPosition);

            // Instantly calculate formatting logic and push to our UI element frame
            if (previewEl) {
                previewEl.textContent = formatCourseCode(inputEl.value);
            }

            saveFormState();
        }
    });

    courseInputsContainer.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.classList.contains('course-input')) {
            if (event.repeat) return; // Fixes the rapid multi-row bug

            event.preventDefault();

            const currentRows = courseInputsContainer.querySelectorAll('.course-row').length;
            if (currentRows < MAX_COURSES) {
                createNewCourseRow();
                saveFormState();
            }
        }
    });

    // ==========================================
    // 4. FORM SUBMISSION & VALIDATION
    // ==========================================

    async function findWorkdayTab() {
        const workdayTabs = await chrome.tabs.query({ url: '*://*.myworkday.com/*' });
        if (workdayTabs.length > 0) {
            return workdayTabs.find(tab => tab.active) || workdayTabs[0];
        }

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.url?.includes('myworkday.com')) {
            return activeTab;
        }

        return null;
    }

    async function pingContentScript(tabId) {
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { action: 'PING' }, (response) => {
                if (chrome.runtime.lastError || !response?.ok) {
                    resolve(false);
                    return;
                }
                resolve(true);
            });
        });
    }

    async function ensureNavigationScript(tabId) {
        if (await pingContentScript(tabId)) {
            return;
        }

        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['js/navigation.js']
        });

        for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (await pingContentScript(tabId)) {
                return;
            }
        }

        throw new Error('Could not connect to Workday. Refresh the page and try again.');
    }

    async function sendStartAutomation(tabId) {
        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, { action: 'START_AUTOMATION' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(response);
            });
        });
    }

    async function startAutomationFromPopup(config) {
        const saved = await saveUiWorkspace(config);
        if (!saved) {
            throw new Error('Failed to save your selections. Please try again.');
        }

        const mainContent = document.getElementById('main-content');
        const workingState = document.getElementById('working-state');
        mainContent.hidden = true;
        workingState.hidden = false;

        const tab = await findWorkdayTab();
        if (!tab?.id) {
            mainContent.hidden = false;
            workingState.hidden = true;
            throw new Error('Open your UBC Workday page first, then click Generate Schedules.');
        }

        await ensureNavigationScript(tab.id);
        await sendStartAutomation(tab.id);
    }

    if (popupForm) {
        popupForm.addEventListener("submit", async (event) => {
            console.log('popup.js: submit event fired');
            event.preventDefault(); // Lock browser frame tracking

            // Compile validated target payload values
            const campusValue = document.querySelector('input[name="campus"]:checked')?.value;
            const levelValue = document.querySelector('input[name="level"]:checked')?.value;
            const timePeriodValue = document.querySelector('input[name="timePeriod"]:checked')?.value;
            const termValue = document.querySelector('input[name="term"]:checked')?.value;
            const yearValue = document.querySelector('input[name="year"]:checked')?.value;

            const courses = [];
            courseInputsContainer.querySelectorAll('.course-input').forEach(input => {
                if (input.value.trim() !== '') {
                    courses.push(input.value.trim());
                }
            });

            const validationMessage = getValidationMessage(courses.length);
            if (validationMessage) {
                setValidationError(validationMessage);
                submitBtn.classList.add('shake');

                // Clear the shake element context frame after animation ends
                setTimeout(() => {
                    submitBtn.classList.remove('shake');
                }, 400);
                return;
            }

            setValidationError('');

            // Output prepared payload configuration object
            const runtimePayload = {
                action: "START_SCHEDULE_GENERATION",
                config: {
                    campus: campusValue,
                    level: levelValue,
                    timePeriod: timePeriodValue,
                    term: termValue,
                    year: yearValue,
                    courseList: courses
                }
            };

            try {
                await startAutomationFromPopup(runtimePayload.config);
                console.log('Automation started successfully.');
            } catch (err) {
                console.error('Automation start failed:', err);
                setValidationError(err.message || 'Could not start automation. Refresh Workday and try again.');
            }
        });
    }


    // ==========================================
    // 5. SAVED SCHEDULES SCREEN
    // ==========================================

    function showPopupToast(message) {
        const existing = document.querySelector('.toast-popup.saved-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast-popup saved-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    SavedSchedulesManager.init({
        variant: 'popup',
        listContainer: savedSchedulesListPopup,
        emptyContainer: noSavedPopup,
        addToWorkdayBtn: addToWorkdayBtnPopup,
        getSchedules: () => getCalendarSchedules(),
        deleteSchedule: (id) => deleteCalendarSchedule(id),
        setPendingWorkdaySchedules: (schedules) => setPendingWorkdaySchedules(schedules),
        setScheduleToLoad: (id) => setScheduleToLoad(id),
        showToast: showPopupToast
    });

    async function openSavedSchedulesScreen() {
        document.getElementById('main-content').hidden = true;
        savedSchedulesScreen.hidden = false;
        await SavedSchedulesManager.renderList();
    }

    function closeSavedSchedulesScreen() {
        savedSchedulesScreen.hidden = true;
        document.getElementById('main-content').hidden = false;
    }

    if (saveSchedulePopupBtn) {
        saveSchedulePopupBtn.addEventListener('click', () => {
            // We open the tab with a specific 'trigger' parameter
            chrome.tabs.create({ url: "calendar.html?trigger=savedSchedules" });
        });
    }

    if (backToMainBtn) {
        backToMainBtn.addEventListener('click', () => {
            closeSavedSchedulesScreen();
        });
    }

    if (addToWorkdayBtnPopup) {
        addToWorkdayBtnPopup.addEventListener('click', () => {
            SavedSchedulesManager.handleAddToWorkday();
        });
    }

    // Initialize extension frame data state instantly upon launch
    loadFormState();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SHOW_TOAST') {
        const toast = document.createElement('div');
        toast.className = 'toast-popup';
        toast.textContent = request.message;
        document.body.appendChild(toast);

        // 1. Reset UI to initial state
        document.getElementById('main-content').hidden = false;
        document.getElementById('working-state').hidden = true;
        document.body.classList.remove('working');

        // 2. Remove toast after 3 seconds
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
});

// In popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'UPDATE_WORKING_TEXT') {
        const workingTextEl = document.querySelector('.working-text');
        if (workingTextEl) {
            // Update the text content, keeping the emoji if needed
            workingTextEl.innerHTML = `${request.newText} <span class="working-emoji">😁😄</span>`;
        }
    }
});