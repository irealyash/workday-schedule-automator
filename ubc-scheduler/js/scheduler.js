/**
 * Schedule Generation Engine
 * Uses backtracking to find optimal schedule based on preferences
 */

/** Backtracking schedule generator; conflict detection; scoring and formatSchedule. */
const ScheduleEngine = {
    /** "9:30 a.m." / "2:00 p.m." → minutes from midnight. */
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

    /** "9:30 a.m. - 11:00 a.m." → { start, end } in minutes. */
    parseTimingRange(timing) {
        if (!timing) return { start: 0, end: 0 };
        const parts = timing.split('-').map(s => s.trim());
        return {
            start: this.parseTime(parts[0]),
            end: this.parseTime(parts[1])
        };
    },

    /** Normalize day to "Mon", "Tue", etc. */
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

    /** True if same day and time ranges overlap. */
    hasConflict(section1, section2) {
        const time1 = this.parseTimingRange(section1.timing);
        const time2 = this.parseTimingRange(section2.timing);

        const days1 = (section1.days || []).map(d => this.normalizeDay(d));
        const days2 = (section2.days || []).map(d => this.normalizeDay(d));

        const sharedDays = days1.filter(d => days2.includes(d));
        if (sharedDays.length === 0) return false;

        return !(time1.end <= time2.start || time2.end <= time1.start);
    },

    /** True if section overlaps any schedule entry. */
    conflictsWithSchedule(section, schedule) {
        return schedule.some(s => this.hasConflict(section, s));
    },

    /** True if section starts before preferred time (and matches appliesTo). */
    violatesNoClassBefore(section, preferences) {
        const pref = preferences?.noClassesBefore;
        if (!pref?.time) return false;

        const [h, m] = pref.time.split(':').map(Number);
        const prefTime = h * 60 + m;
        const sectionTime = this.parseTimingRange(section.timing);

        if (sectionTime.start >= prefTime) return false;

        if (pref.appliesTo === 'all') return true;

        if (pref.appliesTo === 'specific' && pref.days?.length) {
            const sectionDays = (section.days || []).map(d => this.normalizeDay(d));
            const prefDays = pref.days.map(d => this.normalizeDay(d));
            return sectionDays.some(d => prefDays.includes(d));
        }

        return false;
    },

    /** True if section falls in forbidden window (and matches appliesTo). */
    violatesNoClassBetween(section, preferences) {
        const pref = preferences?.noClassesBetween;
        if (!pref?.startTime || !pref?.endTime) return false;

        const [sh, sm] = pref.startTime.split(':').map(Number);
        const [eh, em] = pref.endTime.split(':').map(Number);
        const prefStart = sh * 60 + sm;
        const prefEnd = eh * 60 + em;

        const sectionTime = this.parseTimingRange(section.timing);

        const overlaps = !(sectionTime.end <= prefStart || sectionTime.start >= prefEnd);
        if (!overlaps) return false;

        if (pref.appliesTo === 'all') return true;

        if (pref.appliesTo === 'specific' && pref.days?.length) {
            const sectionDays = (section.days || []).map(d => this.normalizeDay(d));
            const prefDays = pref.days.map(d => this.normalizeDay(d));
            return sectionDays.some(d => prefDays.includes(d));
        }

        return false;
    },

    /** Set of normalized days that appear in schedule. */
    getScheduleDays(schedule) {
        const days = new Set();
        schedule.forEach(section => {
            (section.days || []).forEach(d => days.add(this.normalizeDay(d)));
        });
        return days;
    },

    /** True if adding section would push unique days over maxDaysOnCampus. */
    exceedsMaxDays(section, currentSchedule, preferences) {
        const maxDays = preferences?.maxDaysOnCampus;
        if (!maxDays) return false;

        const currentDays = this.getScheduleDays(currentSchedule);
        const sectionDays = (section.days || []).map(d => this.normalizeDay(d));

        sectionDays.forEach(d => currentDays.add(d));

        return currentDays.size > maxDays;
    },

    /** Gap score: total minutes between back-to-back classes; used by scoreSchedule. */
    calculateGapScore(schedule, preferences) {
        const gapPref = preferences?.gapBetweenClasses || 'medium';
        const daySchedules = {};

        schedule.forEach(section => {
            const time = this.parseTimingRange(section.timing);
            (section.days || []).forEach(day => {
                const d = this.normalizeDay(day);
                if (!daySchedules[d]) daySchedules[d] = [];
                daySchedules[d].push({ start: time.start, end: time.end });
            });
        });

        let totalGap = 0;
        Object.values(daySchedules).forEach(classes => {
            classes.sort((a, b) => a.start - b.start);
            for (let i = 1; i < classes.length; i++) {
                totalGap += classes[i].start - classes[i - 1].end;
            }
        });

        if (gapPref === 'minimal') return totalGap;
        if (gapPref === 'spread') return -totalGap;
        return Math.abs(totalGap - 60 * Object.keys(daySchedules).length);
    },

    /** Higher = better: fewer days, preferred gaps, later start preferred. */
    scoreSchedule(schedule, preferences) {
        let score = 1000;

        const days = this.getScheduleDays(schedule);
        score -= days.size * 50;

        const gapScore = this.calculateGapScore(schedule, preferences);
        score -= gapScore / 10;

        let earliestStart = Infinity;
        schedule.forEach(section => {
            const time = this.parseTimingRange(section.timing);
            if (time.start < earliestStart) earliestStart = time.start;
        });
        if (earliestStart < 9 * 60) score -= (9 * 60 - earliestStart);

        return score;
    },

    /** True if no conflict and no preference violations. */
    isValidPlacement(section, currentSchedule, preferences) {
        if (this.conflictsWithSchedule(section, currentSchedule)) return false;
        if (this.violatesNoClassBefore(section, preferences)) return false;
        if (this.violatesNoClassBetween(section, preferences)) return false;
        if (this.exceedsMaxDays(section, currentSchedule, preferences)) return false;
        return true;
    },

    /** Backtrack over course requirements; return up to maxResults conflict-free schedules. */
    generateSchedules(courseData, preferences, maxResults = 10) {
        const courses = Object.entries(courseData);
        const results = [];

        const requirements = courses.map(([courseName, sections]) => {
            const req = { courseName, needed: [] };

            if (sections.Lecture?.length) {
                req.needed.push({ type: 'Lecture', options: sections.Lecture.map(s => ({ ...s, courseName, sectionType: 'Lecture' })) });
            }
            if (sections.Discussion?.length) {
                req.needed.push({ type: 'Discussion', options: sections.Discussion.map(s => ({ ...s, courseName, sectionType: 'Discussion' })) });
            }
            if (sections.Laboratory?.length) {
                req.needed.push({ type: 'Laboratory', options: sections.Laboratory.map(s => ({ ...s, courseName, sectionType: 'Laboratory' })) });
            }

            return req;
        });

        const flatRequirements = requirements.flatMap(r => r.needed);

        if (flatRequirements.length === 0) return [];

        const backtrack = (index, currentSchedule) => {
            if (results.length >= maxResults) return;

            if (index === flatRequirements.length) {
                results.push([...currentSchedule]);
                return;
            }

            const requirement = flatRequirements[index];

            for (const option of requirement.options) {
                if (this.isValidPlacement(option, currentSchedule, preferences)) {
                    currentSchedule.push(option);
                    backtrack(index + 1, currentSchedule);
                    currentSchedule.pop();
                }
            }
        };

        backtrack(0, []);

        return results;
    },

    /** Prefer conflict-free; else greedy min-conflict schedule + formatSchedule with conflict keys. */
    generateScheduleWithConflicts(courseData, preferences) {
        const courses = Object.entries(courseData);
        const requirements = courses.map(([courseName, sections]) => {
            const req = { courseName, needed: [] };
            if (sections.Lecture?.length) {
                req.needed.push({ type: 'Lecture', options: sections.Lecture.map(s => ({ ...s, courseName, sectionType: 'Lecture' })) });
            }
            if (sections.Discussion?.length) {
                req.needed.push({ type: 'Discussion', options: sections.Discussion.map(s => ({ ...s, courseName, sectionType: 'Discussion' })) });
            }
            if (sections.Laboratory?.length) {
                req.needed.push({ type: 'Laboratory', options: sections.Laboratory.map(s => ({ ...s, courseName, sectionType: 'Laboratory' })) });
            }
            return req;
        });

        const flatRequirements = requirements.flatMap(r => r.needed);
        if (flatRequirements.length === 0) return null;

        const conflictFree = this.generateSchedules(courseData, preferences, 1);
        if (conflictFree.length > 0) {
            return this.formatSchedule(conflictFree[0], courseData, []);
        }

        const bestSchedule = this.findMinimumConflictSchedule(flatRequirements);
        const conflicts = this.getConflictingSections(bestSchedule);
        return this.formatSchedule(bestSchedule, courseData, conflicts);
    },

    /** Greedy: for each requirement pick option that adds fewest conflicts. */
    findMinimumConflictSchedule(flatRequirements) {
        const schedule = [];

        for (const req of flatRequirements) {
            let bestOption = req.options[0];
            let minConflicts = Infinity;

            for (const option of req.options) {
                let conflictCount = 0;
                for (const existing of schedule) {
                    if (this.hasConflict(option, existing)) {
                        conflictCount++;
                    }
                }

                if (conflictCount < minConflicts) {
                    minConflicts = conflictCount;
                    bestOption = option;
                }

                if (conflictCount === 0) break;
            }

            schedule.push(bestOption);
        }

        return schedule;
    },

    /** Set of "courseName-sectionType-code" for every section in a conflicting pair. */
    getConflictingSections(schedule) {
        const conflicting = new Set();
        for (let i = 0; i < schedule.length; i++) {
            for (let j = i + 1; j < schedule.length; j++) {
                if (this.hasConflict(schedule[i], schedule[j])) {
                    conflicting.add(`${schedule[i].courseName}-${schedule[i].sectionType}-${schedule[i].code}`);
                    conflicting.add(`${schedule[j].courseName}-${schedule[j].sectionType}-${schedule[j].code}`);
                }
            }
        }
        return conflicting;
    },

    /** Generate many schedules, score them, return highest-scoring formatted. */
    generateBestSchedule(courseData, preferences) {
        const allSchedules = this.generateSchedules(courseData, preferences, 100);

        if (allSchedules.length === 0) {
            return null;
        }

        let bestSchedule = allSchedules[0];
        let bestScore = this.scoreSchedule(bestSchedule, preferences);

        for (let i = 1; i < allSchedules.length; i++) {
            const score = this.scoreSchedule(allSchedules[i], preferences);
            if (score > bestScore) {
                bestScore = score;
                bestSchedule = allSchedules[i];
            }
        }

        return this.formatSchedule(bestSchedule, courseData);
    },

    /** Turn section list into schedule object: id, name, totalCredits, sections (with hasConflict), metadata. */
    formatSchedule(sections, courseData, conflictKeys = []) {
        const totalCredits = sections.reduce((sum, s) => {
            if (s.sectionType === 'Lecture') {
                return sum + (s.credits || 0);
            }
            return sum;
        }, 0);

        const courseNames = [...new Set(sections.map(s => s.courseName))];
        const conflictSet = conflictKeys instanceof Set ? conflictKeys : new Set(conflictKeys || []);

        try {
            console.log(sections);
            console.log(courseData)

        } catch (error) {

        }


        return {
            id: crypto.randomUUID(),
            name: `Schedule ${new Date().toLocaleDateString()}`,
            totalCredits,
            sections: sections.map(s => {
                const key = `${s.courseName}-${s.sectionType}-${s.code}`;
                return {
                    id: crypto.randomUUID(),
                    courseCode: s.courseName,
                    sectionCode: s.code,
                    sectionType: s.sectionType,
                    timing: s.timing,
                    days: s.days,
                    location: s.location,
                    credits: s.credits,
                    enrolledCapacity: s.enrolledCapacity,
                    learningType: s.learningType,
                    dates: s.dates,
                    hasConflict: conflictSet.has(key)
                };
            }),
            metadata: {
                courseCount: courseNames.length,
                courses: courseNames,
                generatedAt: Date.now()
            }
        };
    },

    /** Other sections for same course + sectionType (e.g. other Lecture options). */
    getAlternatives(section, courseData) {
        const course = courseData[section.courseCode];
        if (!course) return [];

        const typeOptions = course[section.sectionType] || [];
        return typeOptions
            .filter(s => s.code !== section.sectionCode)
            .map(s => ({
                ...s,
                courseName: section.courseCode,
                sectionType: section.sectionType
            }));
    },

    /** True if replacing oldSection with newSection leaves no time conflicts. */
    canSwapSection(currentSchedule, oldSection, newSection) {
        const otherSections = currentSchedule.sections.filter(
            s => !(s.courseCode === oldSection.courseCode && s.sectionType === oldSection.sectionType)
        );

        return !this.conflictsWithSchedule(
            { timing: newSection.timing, days: newSection.days },
            otherSections.map(s => ({ timing: s.timing, days: s.days }))
        );
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ScheduleEngine };
}
