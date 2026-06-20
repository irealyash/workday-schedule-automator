/**
 * Schedule Validator for UBC Scheduler
 * Validates section placements against time conflicts
 * Handles smart alternative selection with clean slot priority
 */

/** Validates section placements and picks best alternative for drops. */
const ScheduleValidator = {
    /** Same course+type alternatives with isValid flag; sorted valid first. */
    getValidatedAlternatives(currentSection, schedule, courseData) {
        const course = courseData[currentSection.courseCode];
        if (!course) {
            console.log('ScheduleValidator: No course data for', currentSection.courseCode);
            return [];
        }

        const typeOptions = course[currentSection.sectionType] || [];
        
        const otherSections = schedule.sections.filter(
            s => !(s.courseCode === currentSection.courseCode && s.sectionType === currentSection.sectionType)
        );

        const alternatives = typeOptions
            .filter(s => s.code !== currentSection.sectionCode)
            .map(section => {
                const sectionWithMeta = {
                    ...section,
                    courseName: currentSection.courseCode,
                    sectionType: currentSection.sectionType
                };

                const isValid = this.isValidPlacement(sectionWithMeta, otherSections);

                return {
                    section: sectionWithMeta,
                    isValid
                };
            });
        
        alternatives.sort((a, b) => (b.isValid ? 1 : 0) - (a.isValid ? 1 : 0));
        
        return alternatives;
    },

    /** True if section does not conflict with any of otherSections. */
    isValidPlacement(section, otherSections) {
        return !this.hasConflictWithSections(section, otherSections);
    },

    /** True if section overlaps in time on any shared day with any of otherSections. */
    hasConflictWithSections(section, otherSections) {
        const time1 = this.parseTimingRange(section.timing);
        const days1 = (section.days || []).map(d => this.normalizeDay(d));

        return otherSections.some(other => {
            const time2 = this.parseTimingRange(other.timing);
            const days2 = (other.days || []).map(d => this.normalizeDay(d));

            const sharedDays = days1.filter(d => days2.includes(d));
            if (sharedDays.length === 0) return false;

            return time1.start < time2.end && time1.end > time2.start;
        });
    },

    /** Best non-conflicting alternative on targetDay, or first valid; null if none. */
    findBestCleanAlternative(currentSection, schedule, courseData, targetDay) {
        const alternatives = this.getValidatedAlternatives(currentSection, schedule, courseData);
        const cleanAlternatives = alternatives.filter(alt => alt.isValid);
        
        if (cleanAlternatives.length === 0) {
            return null;
        }
        
        const normalizedTarget = this.normalizeDay(targetDay);
        const onTargetDay = cleanAlternatives.filter(alt => {
            const days = (alt.section.days || []).map(d => this.normalizeDay(d));
            return days.includes(normalizedTarget);
        });
        
        if (onTargetDay.length > 0) {
            return onTargetDay[0].section;
        }
        
        return cleanAlternatives[0].section;
    },

    /** If target is conflict-free use it; else try findBestCleanAlternative; else keep target (with conflict). */
    resolveDropTarget(currentSection, schedule, courseData, targetAlternative) {
        const otherSections = schedule.sections.filter(
            s => !(s.courseCode === currentSection.courseCode && s.sectionType === currentSection.sectionType)
        );
        
        const targetIsClean = this.isValidPlacement(targetAlternative, otherSections);
        
        if (targetIsClean) {
            return { section: targetAlternative, hasConflict: false };
        }
        
        const targetDays = (targetAlternative.days || []).map(d => this.normalizeDay(d));
        const targetDay = targetDays[0] || 'Mon';
        
        const cleanAlt = this.findBestCleanAlternative(currentSection, schedule, courseData, targetDay);
        
        if (cleanAlt) {
            return { section: cleanAlt, hasConflict: false };
        }
        
        return { section: targetAlternative, hasConflict: true };
    },

    /** True if at least one alternative has no time conflict with current schedule. */
    hasAnyCleanSlot(currentSection, schedule, courseData) {
        const alternatives = this.getValidatedAlternatives(currentSection, schedule, courseData);
        return alternatives.some(alt => alt.isValid);
    },

    /** "9:30 a.m. - 11:00 a.m." → { start, end } in minutes. */
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
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ScheduleValidator };
}
