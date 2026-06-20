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
    selectedSavedScheduleId: null,
    gridBuilt: false,

    dom: {},

    async init() {
        this.cacheDom();
        await Navigation.init();
        await AppState.init();

        this.setupGlobalDragCallbacks();
        this.setupEventListeners();
        this.buildCalendarGrid();

        const { courseData, preferences } = AppState.getState();
        const courseCount = Object.keys(courseData || {}).length;

        if (courseCount === 0) {
            this.showNoSchedule('No course data found. Run schedule generation from the extension popup first.');
            return;
        }

        let schedule = ScheduleEngine.generateBestSchedule(courseData, preferences);
        if (!schedule) {
            schedule = ScheduleEngine.generateScheduleWithConflicts(courseData, preferences);
        }

        if (!schedule) {
            this.showNoSchedule();
            return;
        }

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
            backToExtensionBtn: document.getElementById('backToExtensionBtn'),
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
            modalFormat: document.getElementById('modalFormat')
        };
    },

    setupEventListeners() {
        this.dom.saveScheduleBtn.addEventListener('click', () => this.handleSave());
        this.dom.savedSchedulesBtn.addEventListener('click', () => this.toggleSavedSchedulesScreen());
        this.dom.backToExtensionBtn.addEventListener('click', () => Navigation.goBack());
        this.dom.modalCloseBtn.addEventListener('click', () => this.closeClassModal());
        this.dom.classModal.addEventListener('click', (e) => {
            if (e.target === this.dom.classModal) this.closeClassModal();
        });
        this.dom.addToWorkdayBtn.addEventListener('click', () => {
            this.showToast('Add to Workday is not yet implemented.');
        });
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
            const result = await Storage.saveScheduleWithValidation(
                { ...schedule, name },
                this.editingScheduleId,
                this.originalScheduleName
            );

            if (!result.success) {
                this.showToast(result.error || 'Failed to save schedule.');
                return;
            }

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

    renderSavedSchedulesList() {
        const schedules = AppState.get('savedSchedules') || [];
        this.dom.savedSchedulesList.innerHTML = '';

        if (schedules.length === 0) {
            this.dom.noSavedSchedules.hidden = false;
            this.dom.addToWorkdayBtn.disabled = true;
            return;
        }

        this.dom.noSavedSchedules.hidden = true;

        schedules.forEach(schedule => {
            const card = document.createElement('div');
            card.className = 'schedule-card';
            if (schedule.id === this.selectedSavedScheduleId) {
                card.classList.add('selected');
            }

            const courseCount = schedule.metadata?.courseCount
                || new Set((schedule.sections || []).map(s => s.courseCode)).size;

            card.innerHTML = `
                <div class="schedule-card-checkbox">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20,6 9,17 4,12"/>
                    </svg>
                </div>
                <div class="schedule-card-info">
                    <div class="schedule-card-name">${this.escapeHtml(schedule.name)}</div>
                    <div class="schedule-card-meta">${courseCount} courses · ${schedule.totalCredits || 0} credits</div>
                </div>
                <div class="schedule-card-actions">
                    <button type="button" class="schedule-card-btn load-btn">Load</button>
                    <button type="button" class="schedule-card-btn delete-btn">Delete</button>
                </div>
            `;

            card.querySelector('.load-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadSavedSchedule(schedule);
            });

            card.querySelector('.delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.deleteSavedSchedule(schedule.id);
            });

            card.addEventListener('click', () => {
                this.selectedSavedScheduleId = schedule.id;
                this.dom.addToWorkdayBtn.disabled = false;
                this.renderSavedSchedulesList();
            });

            this.dom.savedSchedulesList.appendChild(card);
        });
    },

    loadSavedSchedule(schedule) {
        AppState.setActiveSchedule(schedule);
        this.editingScheduleId = schedule.id;
        this.originalScheduleName = schedule.name;
        this.dom.scheduleNameInput.value = schedule.name;
        AppState.navigateTo('calendar');
        this.showScreen('calendar');
        this.render();
    },

    async deleteSavedSchedule(id) {
        const deleted = await Storage.deleteSchedule(id);
        if (!deleted) {
            this.showToast('Could not delete schedule.');
            return;
        }

        AppState.removeSavedSchedule(id);
        if (this.selectedSavedScheduleId === id) {
            this.selectedSavedScheduleId = null;
            this.dom.addToWorkdayBtn.disabled = true;
        }
        if (this.editingScheduleId === id) {
            this.editingScheduleId = null;
        }
        this.renderSavedSchedulesList();
        this.showToast('Schedule deleted.');
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
