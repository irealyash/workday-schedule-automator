/**
 * Global state management for UBC Scheduler
 * Simple reactive store pattern
 */

/** Global reactive store: screen, activeSchedule, savedSchedules, courseData, formData. */
const AppState = {
    _state: {
        currentScreen: 'calendar', // 'calendar' | 'savedSchedules'
        activeSchedule: null,
        savedSchedules: [],
        courseData: {},
        formData: {},
        preferences: {},
        dragState: {
            isDragging: false,
            draggedSection: null,
            validDropTargets: [],
            ghostElement: null
        }
    },
    
    _listeners: new Map(),
    _listenerIdCounter: 0,

    /** Shallow copy of current state. */
    getState() {
        return { ...this._state };
    },

    /** Read one state key. */
    get(key) {
        return this._state[key];
    },

    /** Merge updates into state and notify all subscribers. */
    setState(updates) {
        const prevState = { ...this._state };
        this._state = { ...this._state, ...updates };
        this._notifyListeners(prevState, this._state);
    },

    /** Merge updates into state[key] and notify. */
    setNested(key, updates) {
        const prevState = { ...this._state };
        this._state[key] = { ...this._state[key], ...updates };
        this._notifyListeners(prevState, this._state);
    },

    /** Subscribe to state changes; returns id for unsubscribe. */
    subscribe(callback) {
        const id = ++this._listenerIdCounter;
        this._listeners.set(id, callback);
        return id;
    },

    /** Remove subscription by id. */
    unsubscribe(id) {
        this._listeners.delete(id);
    },

    /** Invoke all subscribers with (newState, prevState). */
    _notifyListeners(prevState, newState) {
        this._listeners.forEach(callback => {
            try {
                callback(newState, prevState);
            } catch (e) {
                console.error('State listener error:', e);
            }
        });
    },

    /** Load courseData, formData, savedSchedules from storage into state. */
    async init() {
        const [courseData, formData, savedSchedules] = await Promise.all([
            Storage.getCourseData(),
            Storage.getFormData(),
            // STORAGE READ: loads named schedules from chrome.storage.local → key "ubcSchedules"
            Storage.getAllSchedules()
        ]);

        this.setState({
            courseData,
            formData,
            preferences: formData.preferences || {},
            savedSchedules
        });

        return this.getState();
    },

    /** Set the schedule currently shown on the calendar. */
    setActiveSchedule(schedule) {
        // In-memory only — live grid edits (including drag timing swaps) stay here until Save writes "ubcSchedules"
        this.setState({ activeSchedule: schedule });
    },

    /** Switch currentScreen ('calendar' | 'savedSchedules'). */
    navigateTo(screen) {
        this.setState({ currentScreen: screen });
    },

    /** Merge into dragState (used by legacy code). */
    setDragState(updates) {
        this.setNested('dragState', updates);
    },

    /** Clear dragState to defaults. */
    resetDragState() {
        this.setState({
            dragState: {
                isDragging: false,
                draggedSection: null,
                validDropTargets: [],
                ghostElement: null
            }
        });
    },

    /** Add or replace schedule in savedSchedules list. */
    addSavedSchedule(schedule) {
        // In-memory only — keeps UI list in sync after calendar.js handleSave() writes to "ubcSchedules"
        const schedules = [...this._state.savedSchedules];
        const existingIndex = schedules.findIndex(s => s.id === schedule.id);

        if (existingIndex >= 0) {
            schedules[existingIndex] = schedule;
        } else {
            schedules.push(schedule);
        }

        this.setState({ savedSchedules: schedules });
    },

    /** Remove schedule by id from savedSchedules. */
    removeSavedSchedule(id) {
        // In-memory only — mirrors delete from "ubcSchedules" after SavedSchedulesManager.handleDelete()
        const schedules = this._state.savedSchedules.filter(s => s.id !== id);
        this.setState({ savedSchedules: schedules });
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppState };
}
