/**
 * Shared saved-schedules list UI for calendar and popup.
 * Multi-select checkboxes, delete, load, and add-to-workday.
 */

const SavedSchedulesManager = {
    selectedIds: new Set(),
    _config: null,

    init(config) {
        this.selectedIds = new Set();
        this._config = config;
    },

    _classes() {
        const v = this._config?.variant || 'calendar';
        if (v === 'popup') {
            return {
                card: 'schedule-card-popup',
                checkbox: 'schedule-card-checkbox-popup',
                info: 'schedule-card-info-popup',
                name: 'schedule-card-name-popup',
                meta: 'schedule-card-meta-popup',
                actions: 'schedule-card-actions-popup',
                btn: 'schedule-card-btn-popup'
            };
        }
        return {
            card: 'schedule-card',
            checkbox: 'schedule-card-checkbox',
            info: 'schedule-card-info',
            name: 'schedule-card-name',
            meta: 'schedule-card-meta',
            actions: 'schedule-card-actions',
            btn: 'schedule-card-btn'
        };
    },

    toggleSelection(id) {
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
        this.updateAddToWorkdayButton();
        return this.selectedIds.has(id);
    },

    hasSelection() {
        return this.selectedIds.size > 0;
    },

    updateAddToWorkdayButton() {
        const btn = this._config?.addToWorkdayBtn;
        if (btn) {
            btn.disabled = !this.hasSelection();
        }
        this._config?.onSelectionChange?.(this.selectedIds);
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    },

    async renderList() {
        const { listContainer, emptyContainer, getSchedules } = this._config;
        if (!listContainer) return [];

        const schedules = await getSchedules();
        listContainer.innerHTML = '';

        if (emptyContainer) {
            emptyContainer.hidden = schedules.length > 0;
        }

        if (schedules.length === 0) {
            this.selectedIds.clear();
            this.updateAddToWorkdayButton();
            return schedules;
        }

        const cls = this._classes();

        schedules.forEach(schedule => {
            const courseCount = schedule.metadata?.courseCount
                || new Set((schedule.sections || []).map(s => s.courseCode)).size;

            const card = document.createElement('div');
            card.className = cls.card;
            if (this.selectedIds.has(schedule.id)) {
                card.classList.add('selected');
            }

            card.innerHTML = `
                <div class="${cls.checkbox}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20,6 9,17 4,12"/>
                    </svg>
                </div>
                <div class="${cls.info}">
                    <div class="${cls.name}">${this.escapeHtml(schedule.name)}</div>
                    <div class="${cls.meta}">${courseCount} courses · ${schedule.totalCredits || 0} credits</div>
                </div>
                <div class="${cls.actions}">
                    <button type="button" class="${cls.btn} load-btn">Load</button>
                    <button type="button" class="${cls.btn} delete-btn">Delete</button>
                </div>
            `;

            card.querySelector('.load-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleLoad(schedule);
            });

            card.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleDelete(schedule.id);
            });

            card.addEventListener('click', () => {
                this.toggleSelection(schedule.id);
                this.renderList();
            });

            listContainer.appendChild(card);
        });

        this.updateAddToWorkdayButton();
        return schedules;
    },

    async handleDelete(id) {
        const { deleteSchedule, showToast } = this._config;
        // STORAGE WRITE: delegates to Storage.deleteSchedule / deleteCalendarSchedule → updates "ubcSchedules"
        const deleted = await deleteSchedule(id);
        if (!deleted) {
            showToast?.('Could not delete schedule.');
            return;
        }

        this.selectedIds.delete(id);
        this._config?.onDelete?.(id);
        await this.renderList();
        showToast?.('Schedule deleted.');
    },

    async handleLoad(schedule) {
        if (this._config?.onLoad) {
            await this._config.onLoad(schedule);
            return;
        }
        await this.loadSchedule(schedule.id);
    },

    async loadSchedule(scheduleId) {
        const { setScheduleToLoad, showToast } = this._config;
        if (setScheduleToLoad) {
            // STORAGE WRITE: sets "ubcScheduleToLoad" so calendar knows which saved schedule to display
            await setScheduleToLoad(scheduleId);
        }

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'OPEN_OR_FOCUS_CALENDAR' }, (response) => {
                if (chrome.runtime.lastError) {
                    showToast?.('Could not open calendar.');
                    resolve(false);
                    return;
                }
                resolve(response?.success ?? true);
            });
        });
    },

    getSelectedSchedules(allSchedules) {
        return allSchedules.filter(s => this.selectedIds.has(s.id));
    },

    async handleAddToWorkday() {
        const { getSchedules, setPendingWorkdaySchedules, showToast } = this._config;
        const schedules = await getSchedules();
        const selected = this.getSelectedSchedules(schedules);

        if (selected.length === 0) {
            showToast?.('Select at least one schedule.');
            return false;
        }

        if (setPendingWorkdaySchedules) {
            // STORAGE WRITE: persists checked schedules to "ubcPendingWorkdaySchedules" before focusing Workday tab
            await setPendingWorkdaySchedules(selected);
        }

        const retrieveCommand = 'SavedSchedulesManager.getSelectedSchedules(await getSchedules()) — filters by this.selectedIds Set';
        console.log('[Add to Workday] Retrieve command:', retrieveCommand);
        console.log('[Add to Workday] Selected schedule IDs:', [...this.selectedIds]);
        console.log('[Add to Workday] Selected saved schedules array:', selected);

        async function saveFinalData(dataToSave) {
            try {
                console.log("storing");
                await chrome.storage.local.set({ finaldata: dataToSave });
                console.log('✅ successfully saved to "finaldata":', dataToSave);
                return true;
            } catch (error) {
                console.error('❌ Error saving to chrome.storage.local:', error);
                return false;
            }
        }
        saveFinalData(selected);

        return new Promise((resolve) => {
            // Tab switch only — navigation.js reads "ubcPendingWorkdaySchedules" on the Workday content script
            chrome.runtime.sendMessage({ action: 'FOCUS_WORKDAY_TAB' }, (response) => {
                if (chrome.runtime.lastError) {
                    showToast?.('Could not switch to Workday tab.');
                    resolve(false);
                    return;
                }
                if (response?.success) {
                    showToast?.(`Sent ${selected.length} schedule(s) to Workday.`);
                } else {
                    showToast?.(response?.error || 'No Workday tab found.');
                }
                resolve(response?.success ?? false);
            });
        });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SavedSchedulesManager };
}
