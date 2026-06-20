/**
 * Drag Manager for UBC Scheduler
 * Custom pointer-based drag system - NO HTML5 drag/drop
 * Drags the actual block, snaps to grid on drop, recalculates conflicts
 */

const DragManager = {
    /** Current drag state: element, section, alternatives, ghost refs, original inline styles. */
    state: {
        isDragging: false,
        draggedSection: null,
        draggedElement: null,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0,
        validAlternatives: [],
        schedule: null,
        courseData: null,
        ghostPreviews: [],
        originalStyles: null
    },

    /** Grid and threshold for drag start and drop slot calculation. */
    config: {
        startHour: 7,
        hourHeight: 60,
        dragThreshold: 5,
        swapDistanceMargin: 35
    },

    /** Set by calendar: onDragStart (per block), onDrop, onCancel, recalculateLayout (global). */
    callbacks: {
        onDragStart: null,
        onDrop: null,
        onCancel: null,
        recalculateLayout: null
    },

    /** True right after pointerup so next click doesn't open modal. */
    _justFinishedDrag: false,

    /** Attach pointerdown to block; store section + callbacks; only onDragStart is overwritten on start. */
    setupBlock(block, section, callbacks) {
        block.style.cursor = 'grab';
        block.style.touchAction = 'none';
        block.style.userSelect = 'none';
        block.style.webkitUserSelect = 'none';

        const onPointerDown = (e) => this.handlePointerDown(e, block, section, callbacks);
        block.addEventListener('pointerdown', onPointerDown, { passive: false });

        block._dragCleanup = () => {
            block.removeEventListener('pointerdown', onPointerDown);
        };
    },

    /** Capture pointer, store start/offset, set onDragStart from callbacks, attach move/up on document. */
    handlePointerDown(e, block, section, callbacks) {
        if (e.button !== 0) return;
        e.preventDefault();
        block.setPointerCapture?.(e.pointerId);

        this.state.startX = e.clientX;
        this.state.startY = e.clientY;
        this.state.draggedElement = block;
        this.state.draggedSection = section;
        if (callbacks?.onDragStart) this.callbacks.onDragStart = callbacks.onDragStart;

        const rect = block.getBoundingClientRect();
        this.state.offsetX = e.clientX - rect.left;
        this.state.offsetY = e.clientY - rect.top;

        const onPointerMove = (ev) => this.handlePointerMove(ev);
        const onPointerUp = (ev) => this.handlePointerUp(ev);

        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp, { passive: false });

        this._cleanupListeners = () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        };
    },

    /** If past threshold, start drag; else update block position. */
    handlePointerMove(e) {
        const dx = e.clientX - this.state.startX;
        const dy = e.clientY - this.state.startY;

        if (!this.state.isDragging) {
            if (Math.abs(dx) > this.config.dragThreshold || Math.abs(dy) > this.config.dragThreshold) {
                this.startDrag(e);
            }
            return;
        }

        e.preventDefault();
        this.updateDragPosition(e.clientX, e.clientY);
    },

    /** Fix block position, apply dragging styles, call onDragStart for alternatives, show ghost drop zones. */
    startDrag(e) {
        this.state.isDragging = true;

        const block = this.state.draggedElement;
        const rect = block.getBoundingClientRect();

        this.state.originalStyles = {
            position: block.style.position,
            left: block.style.left,
            top: block.style.top,
            width: block.style.width,
            height: block.style.height,
            right: block.style.right
        };

        block.classList.add('dragging');
        block.style.position = 'fixed';
        block.style.left = rect.left + 'px';
        block.style.top = rect.top + 'px';
        block.style.width = rect.width + 'px';
        block.style.height = rect.height + 'px';
        block.style.zIndex = '9999';
        block.style.pointerEvents = 'none';
        block.style.transform = 'scale(1.05)';
        block.style.opacity = '0.9';
        block.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
        block.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';
        block.style.cursor = 'grabbing';

        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';

        if (this.callbacks.onDragStart) {
            const result = this.callbacks.onDragStart(this.state.draggedSection);
            this.state.validAlternatives = result.alternatives || result;
            this.state.schedule = result.schedule || null;
            this.state.courseData = result.courseData || null;
        }

        this.showValidDropZones();
    },

    /** Move fixed block by cursor minus offset. */
    updateDragPosition(clientX, clientY) {
        const block = this.state.draggedElement;
        if (!block || !this.state.isDragging) return;

        const x = clientX - this.state.offsetX;
        const y = clientY - this.state.offsetY;

        block.style.left = x + 'px';
        block.style.top = y + 'px';
    },

    /** Remove listeners; if was dragging, detectDropTarget then finishDrop or animateBack. */
    handlePointerUp(e) {
        this._cleanupListeners?.();
        this.state.draggedElement?.releasePointerCapture?.(e.pointerId);

        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';

        if (!this.state.isDragging) {
            this.resetState();
            return;
        }

        const dropResult = this.detectDropTarget(e.clientX, e.clientY);
        this.finishDrop(dropResult);
        this._justFinishedDrag = true;
    },

    /** Resolve drop: ghost under cursor → that alt; else compare distance to original slot vs alternatives. */
    detectDropTarget(clientX, clientY) {
        if (!this.state.validAlternatives.length) return null;

        const ghostUnder = document.elementFromPoint(clientX, clientY);
        if (ghostUnder?.closest?.('.ghost-preview')) {
            const ghost = ghostUnder.closest('.ghost-preview');
            const altCode = ghost?.dataset?.altCode;
            if (altCode) {
                const alt = this.state.validAlternatives.find(
                    a => String(a.section.code) === String(altCode)
                );
                if (alt) return { section: alt.section, isValid: alt.isValid };
            }
        }

        const originalSection = this.state.draggedSection;
        if (!originalSection) return null;

        const originalDist = this.getSlotDistance(clientX, clientY, originalSection);

        let bestAlt = null;
        let bestDist = Infinity;

        for (const alt of this.state.validAlternatives) {
            const dist = this.getSlotDistance(clientX, clientY, alt.section);
            if (dist < bestDist) {
                bestDist = dist;
                bestAlt = alt;
            }
        }

        if (!bestAlt) return null;

        // Only swap when drop point is clearly closer to an alternative than to the original slot
        if (bestDist + this.config.swapDistanceMargin < originalDist) {
            return { section: bestAlt.section, isValid: bestAlt.isValid };
        }

        return null;
    },

    /** Pixel distance from cursor to the center of a section's calendar slot(s). */
    getSlotDistance(clientX, clientY, section) {
        const time = this.parseTimingRange(section.timing);
        if (!time.end || time.end <= time.start) return Infinity;

        const days = (section.days || [])
            .map(d => this.normalizeDay(d))
            .filter(d => d && d.length >= 2);

        if (days.length === 0) return Infinity;

        const slotCenterMinutes = time.start + (time.end - time.start) / 2;
        let minDist = Infinity;

        for (const day of days) {
            const dayBody = document.querySelector(`.day-body[data-day="${day}"]`);
            if (!dayBody) continue;

            const rect = dayBody.getBoundingClientRect();
            const slotY = rect.top + ((slotCenterMinutes - this.config.startHour * 60) / 60) * this.config.hourHeight;
            const slotX = rect.left + rect.width / 2;
            const dx = clientX - slotX;
            const dy = clientY - slotY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) minDist = dist;
        }

        return minDist;
    },

    /** Among alternatives on this day, pick one closest to slotStartMinutes; prefer non-conflicting. */
    findMatchingSection(day, slotStartMinutes) {
        const normalizedDay = this.normalizeDay(day);
        const dayAlts = this.state.validAlternatives.filter(a => {
            const days = (a.section.days || []).map(d => this.normalizeDay(d));
            return days.includes(normalizedDay);
        });
        if (dayAlts.length === 0) return this.findNearestValidAlternative(day);

        const validAlts = dayAlts.filter(a => a.isValid);
        const pool = validAlts.length > 0 ? validAlts : dayAlts;

        let best = null;
        let bestDist = Infinity;

        for (const alt of pool) {
            const time = this.parseTimingRange(alt.section.timing);
            const dist = Math.abs(time.start - slotStartMinutes);
            if (dist < bestDist) {
                bestDist = dist;
                best = alt;
            }
        }

        return best ? { section: best.section, isValid: best.isValid } : null;
    },

    /** Return first valid alternative; if preferDay given, prefer alternative on that day. */
    findNearestValidAlternative(preferDay = null) {
        if (!this.state.validAlternatives.length) return null;

        const clean = this.state.validAlternatives.filter(a => a.isValid);
        const options = clean.length > 0 ? clean : this.state.validAlternatives;

        if (preferDay) {
            const normalized = this.normalizeDay(preferDay);
            const onDay = options.filter(a => {
                const days = (a.section.days || []).map(d => this.normalizeDay(d));
                return days.includes(normalized);
            });
            if (onDay.length > 0) return { section: onDay[0].section, isValid: onDay[0].isValid };
        }

        return { section: options[0].section, isValid: options[0].isValid };
    },

    /** Clear ghosts; if dropResult + onDrop: resolve conflict if needed, call onDrop, recalc, endDrag; else animateBack. */
    finishDrop(dropResult) {
        const section = this.state.draggedSection;

        this.clearDropZones();

        if (dropResult && this.callbacks.onDrop) {
            let finalSection = dropResult.section;
            if (!dropResult.isValid && this.state.schedule && this.state.courseData && typeof ScheduleValidator !== 'undefined') {
                const resolved = ScheduleValidator.resolveDropTarget(
                    section, this.state.schedule, this.state.courseData, dropResult.section
                );
                finalSection = resolved.section;
            }

            this.callbacks.onDrop(section, finalSection);

            if (this.callbacks.recalculateLayout) {
                this.callbacks.recalculateLayout();
            }

            this.endDrag();
            return;
        }

        this.animateBack();
    },

    /** Cancel: clear ghosts, onCancel (re-render), endDrag. */
    animateBack() {
        this.clearDropZones();
        this.callbacks.onCancel?.();
        this.endDrag();
    },

    /** Restore block styles from originalStyles, clear ghosts, reset state. */
    endDrag() {
        const block = this.state.draggedElement;
        const orig = this.state.originalStyles;

        if (block && block.isConnected && orig) {
            block.classList.remove('dragging');
            block.style.position = orig.position || '';
            block.style.left = orig.left || '';
            block.style.top = orig.top || '';
            block.style.width = orig.width || '';
            block.style.height = orig.height || '';
            block.style.right = orig.right || '';
            block.style.zIndex = '';
            block.style.pointerEvents = '';
            block.style.transform = '';
            block.style.opacity = '';
            block.style.boxShadow = '';
            block.style.transition = '';
            block.style.cursor = 'grab';
        }

        this.clearDropZones();
        this.resetState();
    },

    /** Create ghost previews for valid (or all) alternatives in day-body slots. */
    showValidDropZones() {
        const cleanAlts = this.state.validAlternatives.filter(a => a.isValid);
        const toShow = cleanAlts.length > 0 ? cleanAlts : this.state.validAlternatives;

        toShow.forEach(alt => {
            this.createGhostPreview(alt.section, alt.isValid);
        });
    },

    /** Insert one ghost div per day of section; position by timing, set data-altCode for detectDropTarget. */
    createGhostPreview(section, isValid = true) {
        const time = this.parseTimingRange(section.timing);
        const days = (section.days || []).map(d => this.normalizeDay(d));

        days.forEach(day => {
            const dayBody = document.querySelector(`.day-body[data-day="${day}"]`);
            if (!dayBody) return;

            const top = (time.start - this.config.startHour * 60) / 60 * this.config.hourHeight;
            const height = (time.end - time.start) / 60 * this.config.hourHeight;

            const ghost = document.createElement('div');
            ghost.className = 'ghost-preview valid' + (isValid ? '' : ' conflict-ghost');
            ghost.style.top = `${top}px`;
            ghost.style.height = `${Math.max(height, 30)}px`;
            ghost.style.zIndex = '50';
            ghost.dataset.altCode = String(section.code);

            this.state.ghostPreviews.push(ghost);
            dayBody.appendChild(ghost);
        });
    },

    /** Remove all ghost previews from state and DOM. */
    clearDropZones() {
        this.state.ghostPreviews?.forEach(g => g.remove?.());
        this.state.ghostPreviews = [];
        document.querySelectorAll('.ghost-preview').forEach(el => el.remove());
    },

    /** Clear drag state to initial values. */
    resetState() {
        this.state = {
            isDragging: false,
            draggedSection: null,
            draggedElement: null,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0,
            validAlternatives: [],
            schedule: null,
            courseData: null,
            ghostPreviews: [],
            originalStyles: null
        };
    },

    /** Register callback invoked on successful drop (oldSection, newSection). */
    setDropCallback(callback) {
        this.callbacks.onDrop = callback;
    },

    /** Register callback when drag is cancelled (re-render). */
    setCancelCallback(callback) {
        this.callbacks.onCancel = callback;
    },

    /** Register callback after drop to re-render calendar and stats. */
    setRecalculateLayoutCallback(callback) {
        this.callbacks.recalculateLayout = callback;
    },

    /** Alias for setDropCallback. */
    setSwapCallback(callback) {
        this.callbacks.onDrop = callback;
    },

    /** Parse "9:30 a.m. - 11:00 a.m." → { start, end } in minutes. */
    parseTimingRange(timing) {
        if (!timing) return { start: 0, end: 0 };
        const parts = timing.split('-').map(s => s.trim());
        return {
            start: this.parseTime(parts[0]),
            end: this.parseTime(parts[1])
        };
    },

    /** Parse single time string to minutes from midnight. */
    parseTime(timeStr) {
        if (!timeStr) return 0;
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)/i);
        if (!match) return 0;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const isPM = match[3].toLowerCase().startsWith('p');
        if (isPM && hours !== 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
        return hours * 60 + minutes;
    },

    /** Normalize day string to "Mon", "Tue", etc. */
    normalizeDay(day) {
        const map = {
            'MON': 'Mon', 'MONDAY': 'Mon', 'TUE': 'Tue', 'TUESDAY': 'Tue',
            'WED': 'Wed', 'WEDNESDAY': 'Wed', 'THU': 'Thu', 'THURSDAY': 'Thu',
            'FRI': 'Fri', 'FRIDAY': 'Fri', 'SAT': 'Sat', 'SATURDAY': 'Sat',
            'SUN': 'Sun', 'SUNDAY': 'Sun'
        };
        return map[String(day).toUpperCase()] || day;
    },

    /** Whether a drag is currently active. */
    isDragging() {
        return this.state.isDragging;
    },

    /** Return and clear _justFinishedDrag so modal doesn't open on same click as drop. */
    consumeJustFinishedDrag() {
        const v = this._justFinishedDrag;
        this._justFinishedDrag = false;
        return v;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DragManager };
}
