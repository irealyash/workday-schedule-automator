/**
 * UBC Scheduler - Calendar Entry Point
 * Loads scraped course data from storage, generates a schedule, and wires the calendar UI.
 */

const CalendarApp = {
    START_HOUR: 7,
    END_HOUR: 22,
    HOUR_HEIGHT: 60,
    DAYS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],

    editingScheduleId: null,
    originalScheduleName: null,
    gridBuilt: false,
    savedSchedulesManager: null,
    skippedSections: [],
    alertsAutoShown: false,

    dom: {},

    async init() {
        // calendar.js
        window.addEventListener('load', () => {
            const params = new URLSearchParams(window.location.search);

            // If the popup told us to open the saved schedules
            if (params.get('trigger') === 'savedSchedules') {
                const targetBtn = document.getElementById('savedSchedulesBtn');

                if (targetBtn) {
                    // We use a small delay to ensure the UI is fully rendered 
                    // before the "click" happens.
                    setTimeout(() => {
                        targetBtn.click();
                    }, 200);
                } else {
                    console.error("Button #savedSchedulesBtn not found on calendar page!");
                }
            }
        });
        this.cacheDom();
        await Navigation.init();
        await AppState.init();

        this.setupGlobalDragCallbacks();
        this.setupSavedSchedulesManager();
        this.setupEventListeners();
        this.setupStorageListener();
        this.buildCalendarGrid();

        const scheduleToLoadId = await Storage.getScheduleToLoad();
        if (scheduleToLoadId) {
            const saved = await Storage.getScheduleById(scheduleToLoadId);
            // STORAGE WRITE: clears one-time load pointer after reading → key "ubcScheduleToLoad"
            await Storage.clearScheduleToLoad();
            if (saved) {
                this.applyLoadedSchedule(saved);
                return;
            }
        }

        const { courseData, preferences } = AppState.getState();
        const courseCount = Object.keys(courseData || {}).length;

        if (courseCount === 0) {
            this.showNoSchedule('No course data found. Run schedule generation from the extension popup first.');
            return;
        }

        let schedule = null;
        let skippedSections = [];

        const bestResult = ScheduleEngine.generateBestSchedule(courseData, preferences);
        schedule = bestResult.schedule;
        skippedSections = bestResult.skippedSections || [];

        if (!schedule) {
            const conflictResult = ScheduleEngine.generateScheduleWithConflicts(courseData, preferences);
            schedule = conflictResult?.schedule;
            skippedSections = conflictResult?.skippedSections || skippedSections;
        }

        if (!schedule) {
            this.skippedSections = skippedSections;
            this.setupScheduleAlerts();
            this.showNoSchedule();
            return;
        }

        this.skippedSections = skippedSections;
        this.setupScheduleAlerts(true);
        AppState.setActiveSchedule(schedule);
        this.dom.scheduleNameInput.value = schedule.name;
        this.originalScheduleName = schedule.name;
        this.render();
    },

    cacheDom() {
        this.dom = {
            calendarScreen: document.getElementById('calendarScreen'),
            savedSchedulesScreen: document.getElementById('savedSchedulesScreen'),
            calendarGrid: document.getElementById('calendarGrid'),
            noScheduleMessage: document.getElementById('noScheduleMessage'),
            scheduleNameInput: document.getElementById('scheduleNameInput'),
            saveScheduleBtn: document.getElementById('saveScheduleBtn'),
            savedSchedulesBtn: document.getElementById('savedSchedulesBtn'),
            backToCalendarBtn: document.getElementById('backToCalendarBtn'),
            savedSchedulesList: document.getElementById('savedSchedulesList'),
            noSavedSchedules: document.getElementById('noSavedSchedules'),
            addToWorkdayBtn: document.getElementById('addToWorkdayBtn'),
            statCourses: document.getElementById('statCourses'),
            statCredits: document.getElementById('statCredits'),
            statDays: document.getElementById('statDays'),
            classModal: document.getElementById('classModal'),
            modalCloseBtn: document.getElementById('modalCloseBtn'),
            modalTitle: document.getElementById('modalTitle'),
            modalBadge: document.getElementById('modalBadge'),
            modalSection: document.getElementById('modalSection'),
            modalCredits: document.getElementById('modalCredits'),
            modalCapacity: document.getElementById('modalCapacity'),
            modalLocation: document.getElementById('modalLocation'),
            modalTimes: document.getElementById('modalTimes'),
            modalDates: document.getElementById('modalDates'),
            modalFormat: document.getElementById('modalFormat'),
            scheduleAlertsBtn: document.getElementById('scheduleAlertsBtn'),
            scheduleAlertsBadge: document.getElementById('scheduleAlertsBadge'),
            scheduleAlertsModal: document.getElementById('scheduleAlertsModal'),
            scheduleAlertsCloseBtn: document.getElementById('scheduleAlertsCloseBtn'),
            scheduleAlertsList: document.getElementById('scheduleAlertsList')
        };
    },

    setupScheduleAlerts(autoOpen = false) {
        const alerts = this.skippedSections || [];
        const btn = this.dom.scheduleAlertsBtn;
        const badge = this.dom.scheduleAlertsBadge;

        if (!btn || !badge) return;

        if (alerts.length === 0) {
            btn.hidden = true;
            btn.classList.remove('has-alerts');
            return;
        }

        btn.hidden = false;
        btn.classList.add('has-alerts');
        badge.textContent = String(alerts.length);

        if (autoOpen && !this.alertsAutoShown) {
            this.alertsAutoShown = true;
            this.openScheduleAlertsModal();
        }
    },



    openScheduleAlertsModal() {
        const list = this.dom.scheduleAlertsList;
        if (!list) return;

        list.innerHTML = '';
        (this.skippedSections || []).forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${this.escapeHtml(item.courseCode)}</strong> — ${this.escapeHtml(item.sectionType)}<br><span>${this.escapeHtml(item.reason || 'No valid timing/days')}</span>`;
            list.appendChild(li);
        });

        this.dom.scheduleAlertsModal.hidden = false;
    },

    closeScheduleAlertsModal() {
        this.dom.scheduleAlertsModal.hidden = true;
    },

    setupSavedSchedulesManager() {
        SavedSchedulesManager.init({
            variant: 'calendar',
            listContainer: this.dom.savedSchedulesList,
            emptyContainer: this.dom.noSavedSchedules,
            addToWorkdayBtn: this.dom.addToWorkdayBtn,
            getSchedules: () => Storage.getAllSchedules(),
            // STORAGE WRITE: removes one schedule from chrome.storage.local → key "ubcSchedules"
            deleteSchedule: (id) => Storage.deleteSchedule(id),
            // STORAGE WRITE: queues checked schedules for Workday → key "ubcPendingWorkdaySchedules"
            setPendingWorkdaySchedules: (schedules) => Storage.setPendingWorkdaySchedules(schedules),
            // STORAGE WRITE: tells calendar which saved schedule to open → key "ubcScheduleToLoad"
            setScheduleToLoad: (id) => Storage.setScheduleToLoad(id),
            showToast: (msg) => this.showToast(msg),
            onLoad: (schedule) => {
                this.applyLoadedSchedule(schedule);
            },
            onDelete: (id) => {
                // In-memory only — storage delete already ran via deleteSchedule callback above
                AppState.removeSavedSchedule(id);
                if (this.editingScheduleId === id) {
                    this.editingScheduleId = null;
                }
            }
        });
        this.savedSchedulesManager = SavedSchedulesManager;
    },

    setupEventListeners() {
        this.dom.saveScheduleBtn.addEventListener('click', () => this.handleSave());
        this.dom.savedSchedulesBtn.addEventListener('click', () => this.toggleSavedSchedulesScreen());
        this.dom.backToCalendarBtn.addEventListener('click', () => {
            AppState.navigateTo('calendar');
            this.showScreen('calendar');
        });
        this.dom.modalCloseBtn.addEventListener('click', () => this.closeClassModal());
        this.dom.classModal.addEventListener('click', (e) => {
            if (e.target === this.dom.classModal) this.closeClassModal();
        });
        // Triggers SavedSchedulesManager.handleAddToWorkday() → writes "ubcPendingWorkdaySchedules" then focuses Workday tab
        this.dom.addToWorkdayBtn.addEventListener('click', () => {
            this.savedSchedulesManager.handleAddToWorkday();
        });
        this.dom.scheduleAlertsBtn.addEventListener('click', () => this.openScheduleAlertsModal());
        this.dom.scheduleAlertsCloseBtn.addEventListener('click', () => this.closeScheduleAlertsModal());
        this.dom.scheduleAlertsModal.addEventListener('click', (e) => {
            if (e.target === this.dom.scheduleAlertsModal) this.closeScheduleAlertsModal();
        });
    },

    setupStorageListener() {
        // Reacts when another surface (e.g. popup Load) writes "ubcScheduleToLoad" while calendar tab is already open
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.ubcScheduleToLoad?.newValue) return;
            this.loadScheduleFromStorage(changes.ubcScheduleToLoad.newValue);
        });
    },

    async loadScheduleFromStorage(id) {
        const saved = await Storage.getScheduleById(id);
        // STORAGE WRITE: clears one-time load pointer from chrome.storage.local → key "ubcScheduleToLoad"
        await Storage.clearScheduleToLoad();
        if (saved) {
            this.applyLoadedSchedule(saved);
        }
    },

    setupGlobalDragCallbacks() {
        DragManager.setDropCallback((oldSection, newSection) => {
            this.handleSectionSwap(oldSection, newSection);
        });

        DragManager.setCancelCallback(() => {
            this.renderClassBlocks();
        });

        DragManager.setRecalculateLayoutCallback(() => {
            this.render();
        });
    },

    buildCalendarGrid() {
        if (this.gridBuilt) return;

        const timeColumn = this.dom.calendarGrid.querySelector('.time-column');
        const existingSlots = timeColumn.querySelectorAll('.time-slot');
        existingSlots.forEach(el => el.remove());

        for (let hour = this.START_HOUR; hour < this.END_HOUR; hour++) {
            const slot = document.createElement('div');
            slot.className = 'time-slot';
            const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
            const ampm = hour >= 12 ? 'PM' : 'AM';
            slot.textContent = `${displayHour} ${ampm}`;
            timeColumn.appendChild(slot);
        }

        this.dom.calendarGrid.querySelectorAll('.day-column').forEach(col => col.remove());

        this.DAYS.forEach(day => {
            const col = document.createElement('div');
            col.className = 'day-column';
            col.dataset.day = day;

            const header = document.createElement('div');
            header.className = 'day-header';
            header.textContent = day;

            const body = document.createElement('div');
            body.className = 'day-body';
            body.dataset.day = day;

            for (let hour = this.START_HOUR; hour < this.END_HOUR; hour++) {
                const line = document.createElement('div');
                line.className = 'hour-line';
                line.style.top = `${(hour - this.START_HOUR) * this.HOUR_HEIGHT}px`;
                body.appendChild(line);
            }

            col.appendChild(header);
            col.appendChild(body);
            this.dom.calendarGrid.appendChild(col);
        });

        this.gridBuilt = true;
    },

    render() {
        const schedule = AppState.get('activeSchedule');
        if (!schedule) {
            this.showNoSchedule();
            return;
        }

        this.hideNoSchedule();
        this.updateStats(schedule);
        this.renderClassBlocks();
    },

    renderClassBlocks() {
        const schedule = AppState.get('activeSchedule');
        if (!schedule) return;

        document.querySelectorAll('.day-body').forEach(body => {
            body.querySelectorAll('.class-block, .conflict-container').forEach(el => {
                if (el._dragCleanup) el._dragCleanup();
                el.remove();
            });
        });

        const { sections: layoutSections, conflictGroups } = LayoutEngine.computeLayout(schedule.sections);
        const courseData = AppState.get('courseData');

        conflictGroups.forEach(group => {
            const dayBody = document.querySelector(`.day-body[data-day="${group.day}"]`);
            if (!dayBody) return;

            const top = (group.startMinutes - this.START_HOUR * 60) / 60 * this.HOUR_HEIGHT;
            const height = (group.endMinutes - group.startMinutes) / 60 * this.HOUR_HEIGHT;

            const container = document.createElement('div');
            container.className = 'conflict-container';
            container.style.top = `${top}px`;
            container.style.height = `${Math.max(height, 30)}px`;
            dayBody.appendChild(container);
        });

        layoutSections.forEach(section => {
            const dayBody = document.querySelector(`.day-body[data-day="${section._day}"]`);
            if (!dayBody) return;

            const time = LayoutEngine.parseTimingRange(section.timing);
            const top = (time.start - this.START_HOUR * 60) / 60 * this.HOUR_HEIGHT;
            const height = (time.end - time.start) / 60 * this.HOUR_HEIGHT;

            const block = document.createElement('div');
            block.className = `class-block ${(section.sectionType || '').toLowerCase()}`;
            if (section.hasConflict) block.classList.add('has-conflict');

            block.style.top = `${top}px`;
            block.style.height = `${Math.max(height, 30)}px`;
            block.style.left = `calc(${section._left}% + 4px)`;
            block.style.width = `calc(${section._width}% - 8px)`;
            block.style.right = 'auto';

            block.innerHTML = `
                <div class="class-block-title">${this.escapeHtml(section.courseCode)}</div>
                <div class="class-block-subtitle">${this.escapeHtml(section.sectionType)} ${this.escapeHtml(section.sectionCode)}</div>
                <div class="class-block-time">${this.escapeHtml(section.timing || '')}</div>
            `;

            block.addEventListener('click', () => {
                if (DragManager.isDragging() || DragManager.consumeJustFinishedDrag()) return;
                this.openClassModal(section);
            });

            DragManager.setupBlock(block, section, {
                onDragStart: (draggedSection) => {
                    const currentSchedule = AppState.get('activeSchedule');
                    const alternatives = ScheduleValidator.getValidatedAlternatives(
                        draggedSection,
                        currentSchedule,
                        courseData
                    );
                    return { alternatives, schedule: currentSchedule, courseData };
                }
            });

            dayBody.appendChild(block);
        });
    },

    handleSectionSwap(oldSection, newSection) {
        const schedule = AppState.get('activeSchedule');
        if (!schedule) return;

        // In-memory only — timing/section changes from drag are NOT written to chrome.storage until handleSave()
        const updatedSections = schedule.sections.map(s => {
            if (s.id !== oldSection.id) return s;
            return {
                ...s,
                sectionCode: newSection.code,
                timing: newSection.timing,
                days: newSection.days,
                location: newSection.location,
                credits: newSection.credits,
                enrolledCapacity: newSection.enrolledCapacity,
                learningType: newSection.learningType,
                dates: newSection.dates
            };
        });

        AppState.setActiveSchedule({
            ...schedule,
            sections: updatedSections
        });
    },

    updateStats(schedule) {
        const uniqueCourses = new Set(schedule.sections.map(s => s.courseCode));
        const uniqueDays = new Set();
        schedule.sections.forEach(s => {
            (s.days || []).forEach(d => uniqueDays.add(LayoutEngine.normalizeDay(d)));
        });

        this.dom.statCourses.textContent = uniqueCourses.size;
        this.dom.statCredits.textContent = schedule.totalCredits || 0;
        this.dom.statDays.textContent = uniqueDays.size;
    },

    async handleSave() {
        const schedule = AppState.get('activeSchedule');
        if (!schedule) return;

        const name = this.dom.scheduleNameInput.value.trim() || 'Untitled Schedule';

        try {
            // STORAGE WRITE: persists named schedule to chrome.storage.local → key "ubcSchedules" (via storage2.js)
            const result = await Storage.saveScheduleWithValidation(
                { ...schedule, name },
                this.editingScheduleId,
                this.originalScheduleName
            );

            if (!result.success) {
                this.showToast(result.error || 'Failed to save schedule.');
                return;
            }

            // In-memory only: mirrors the schedule just written to "ubcSchedules" for UI re-render (not a second storage write)
            AppState.addSavedSchedule(result.schedule);
            this.editingScheduleId = result.schedule.id;
            this.originalScheduleName = result.schedule.name;
            this.dom.scheduleNameInput.value = result.schedule.name;
            this.showToast(result.isUpdate ? 'Schedule updated!' : 'Schedule saved!');
        } catch (err) {
            console.error('Save failed:', err);
            this.showToast('Failed to save schedule.');
        }
    },

    toggleSavedSchedulesScreen() {
        const current = AppState.get('currentScreen');
        if (current === 'savedSchedules') {
            AppState.navigateTo('calendar');
            this.showScreen('calendar');
        } else {
            AppState.navigateTo('savedSchedules');
            this.renderSavedSchedulesList();
            this.showScreen('savedSchedules');
        }
    },

    showScreen(screen) {
        this.dom.calendarScreen.hidden = screen !== 'calendar';
        this.dom.savedSchedulesScreen.hidden = screen !== 'savedSchedules';
    },

    async renderSavedSchedulesList() {
        await this.savedSchedulesManager.renderList();
    },

    applyLoadedSchedule(schedule) {
        AppState.setActiveSchedule(schedule);
        this.skippedSections = schedule.metadata?.skippedSections || [];
        this.setupScheduleAlerts();
        this.editingScheduleId = schedule.id;
        this.originalScheduleName = schedule.name;
        this.dom.scheduleNameInput.value = schedule.name;
        AppState.navigateTo('calendar');
        this.showScreen('calendar');
        this.render();
    },

    openClassModal(section) {
        this.dom.modalTitle.textContent = section.courseCode;
        this.dom.modalBadge.textContent = section.sectionType || 'Section';
        this.dom.modalBadge.className = `modal-badge ${(section.sectionType || '').toLowerCase()}`;
        this.dom.modalSection.textContent = section.sectionCode || '-';
        this.dom.modalCredits.textContent = section.credits ?? '-';
        this.dom.modalCapacity.textContent = section.enrolledCapacity || '-';
        this.dom.modalLocation.textContent = section.location || '-';
        this.dom.modalTimes.textContent = `${(section.days || []).join(', ')} · ${section.timing || '-'}`;
        this.dom.modalDates.textContent = Array.isArray(section.dates)
            ? section.dates.join('; ')
            : (section.dates || '-');
        this.dom.modalFormat.textContent = section.learningType || '-';
        this.dom.classModal.hidden = false;
    },

    closeClassModal() {
        this.dom.classModal.hidden = true;
    },

    showNoSchedule(message) {
        this.dom.noScheduleMessage.hidden = false;
        if (message) {
            const p = this.dom.noScheduleMessage.querySelector('p');
            if (p) p.textContent = message;
        }
        this.dom.calendarGrid.style.visibility = 'hidden';
    },

    hideNoSchedule() {
        this.dom.noScheduleMessage.hidden = true;
        this.dom.calendarGrid.style.visibility = 'visible';
    },

    showToast(message) {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            background: #1e3a5f;
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 8px;
            color: #f8fafc;
            font-size: 0.9rem;
            z-index: 1000;
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    CalendarApp.init().catch(err => {
        console.error('Calendar initialization failed:', err);
    });
});
