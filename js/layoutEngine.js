/**
 * Layout Engine for UBC Scheduler
 * Handles dynamic conflict width calculation and overlap grouping
 * Renders conflicts inside a single red container box
 */

/** Computes block positions and overlap groups for calendar; conflict blocks share width. */
const LayoutEngine = {
    /** Parse "9:30 a.m. - 11:00 a.m." → { start, end } in minutes. */
    parseTimingRange(timing) {
        if (!timing) return { start: 0, end: 0 };
        const parts = timing.split('-').map(s => s.trim());
        return {
            start: this.parseTime(parts[0]),
            end: this.parseTime(parts[1])
        };
    },

    /** Single time string → minutes from midnight. */
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

    /** Normalize to "Mon", "Tue", etc. */
    normalizeDay(day) {
        const map = {
            'MON': 'Mon', 'MONDAY': 'Mon',
            'TUE': 'Tue', 'TUESDAY': 'Tue',
            'WED': 'Wed', 'WEDNESDAY': 'Wed',
            'THU': 'Thu', 'THURSDAY': 'Thu',
            'FRI': 'Fri', 'FRIDAY': 'Fri',
            'SAT': 'Sat', 'SATURDAY': 'Sat',
            'SUN': 'Sun', 'SUNDAY': 'Sun'
        };
        return map[day.toUpperCase()] || day;
    },

    /** True if two time ranges overlap (start1 < end2 && end1 > start2). */
    timesOverlap(time1, time2) {
        return time1.start < time2.end && time1.end > time2.start;
    },

    /** Split sections into day → [{ section, _day, _startMinutes, _endMinutes }]. */
    groupSectionsByDay(sections) {
        const dayGroups = {};
        
        sections.forEach(section => {
            const time = this.parseTimingRange(section.timing);
            const days = (section.days || []).map(d => this.normalizeDay(d));
            
            days.forEach(day => {
                if (!dayGroups[day]) {
                    dayGroups[day] = [];
                }
                dayGroups[day].push({
                    ...section,
                    _day: day,
                    _startMinutes: time.start,
                    _endMinutes: time.end
                });
            });
        });
        
        return dayGroups;
    },

    /** Union-Find: group day sections that overlap in time into separate arrays. */
    findOverlapGroups(daySections) {
        if (daySections.length === 0) return [];
        if (daySections.length === 1) return [[daySections[0]]];
        
        const n = daySections.length;
        const parent = Array.from({ length: n }, (_, i) => i);
        
        const find = (x) => {
            if (parent[x] !== x) {
                parent[x] = find(parent[x]);
            }
            return parent[x];
        };
        
        const union = (x, y) => {
            const px = find(x);
            const py = find(y);
            if (px !== py) {
                parent[px] = py;
            }
        };
        
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const timeI = { start: daySections[i]._startMinutes, end: daySections[i]._endMinutes };
                const timeJ = { start: daySections[j]._startMinutes, end: daySections[j]._endMinutes };
                
                if (this.timesOverlap(timeI, timeJ)) {
                    union(i, j);
                }
            }
        }
        
        const groups = {};
        for (let i = 0; i < n; i++) {
            const root = find(i);
            if (!groups[root]) {
                groups[root] = [];
            }
            groups[root].push(daySections[i]);
        }
        
        return Object.values(groups);
    },

    /** Assign _width, _left, _overlapCount, _overlapIndex so overlapping blocks share row. */
    calculateGroupLayout(group) {
        if (group.length === 1) {
            return [{
                ...group[0],
                _width: 100,
                _left: 0,
                _overlapCount: 1,
                _overlapIndex: 0
            }];
        }
        
        group.sort((a, b) => a._startMinutes - b._startMinutes);
        
        const overlapCount = group.length;
        const widthPercent = 100 / overlapCount;
        
        return group.map((section, index) => ({
            ...section,
            _width: widthPercent,
            _left: widthPercent * index,
            _overlapCount: overlapCount,
            _overlapIndex: index
        }));
    },

    /** Full layout: sections with _day, _width, _left, etc.; conflictGroups for red container boxes. */
    computeLayout(sections) {
        if (!sections || sections.length === 0) return { sections: [], conflictGroups: [] };
        
        const dayGroups = this.groupSectionsByDay(sections);
        const layoutSections = [];
        const conflictGroups = [];
        let groupId = 0;
        
        Object.entries(dayGroups).forEach(([day, daySections]) => {
            const overlapGroups = this.findOverlapGroups(daySections);
            
            overlapGroups.forEach(group => {
                const layoutGroup = this.calculateGroupLayout(group);
                const isConflict = group.length > 1;
                
                if (isConflict) {
                    const minStart = Math.min(...group.map(s => s._startMinutes));
                    const maxEnd = Math.max(...group.map(s => s._endMinutes));
                    
                    conflictGroups.push({
                        id: `conflict-${groupId++}`,
                        day,
                        startMinutes: minStart,
                        endMinutes: maxEnd,
                        sectionIds: group.map(s => s.id)
                    });
                }
                
                layoutGroup.forEach(section => {
                    layoutSections.push({
                        ...section,
                        hasConflict: isConflict,
                        _conflictGroupId: isConflict ? `conflict-${groupId - 1}` : null
                    });
                });
            });
        });
        
        return { sections: layoutSections, conflictGroups };
    },

    /** Filter computeLayout result to one day. */
    getLayoutForDay(sections, day) {
        const { sections: allLayout } = this.computeLayout(sections);
        return allLayout.filter(s => s._day === this.normalizeDay(day));
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LayoutEngine };
}
