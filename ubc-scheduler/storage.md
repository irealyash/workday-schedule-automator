# UBC Scheduler — Storage Reference

This document describes where data lives in the extension, how it flows from Workday navigation to the calendar, and how schedule edits are persisted.

All persistent data uses **`chrome.storage.local`**, except the Workday origin tab id which uses **`chrome.storage.session`** (with a local fallback). The extension does **not** use `localStorage` or `sessionStorage`.

---

## End-to-end flow: Navigation → Calendar

```
Popup submit
  → saveUiWorkspace(config)           // writes ubc_ui_workspace_draft
  → content script START_AUTOMATION
  → navigation.js scrapes Workday
  → finishNavigationAndOpenCalendar()
       → chrome.storage.local.set({ ubcCourseData, ubcExtractedCourses, scrapedCourseData })
       → storeOriginTabId()           // writes ubcOriginTabId (session/local)
       → openCalendarTab()           // background opens calendar.html
  → calendar.js
       → AppState.init()              // reads course data + form + saved schedules
       → ScheduleEngine.generateBestSchedule()
       → renders calendar grid
```

There is **no direct message** carrying course data to the calendar. The bridge is **shared storage** plus a background message to open the tab.

---

## Course data (after navigation completes)

Written by `js/navigation.js` in `finishNavigationAndOpenCalendar()` when scraping finishes.

| Storage key | API | Written by | Read by |
|---|---|---|---|
| `ubcExtractedCourses` | `chrome.storage.local` | `navigation.js` | `storage2.js` → `AppState.init()` → calendar |
| `ubcCourseData` | `chrome.storage.local` | `navigation.js` | `storage.js` (popup-side fallback) |
| `scrapedCourseData` | `chrome.storage.local` | `navigation.js` | `storage.js` (popup-side fallback) |

All three keys receive the **same object** at scrape time. The calendar reads `ubcExtractedCourses` first, then falls back to the other keys.

### Data shape

```js
{
  "CPSC_V 121": {
    "Lecture": [
      {
        code: "101",
        credits: 4,
        dates: ["Sep 2, 2025 – Dec 5, 2025"],
        timing: "9:30 a.m. - 11:00 a.m.",
        days: ["Mon", "Wed", "Fri"],
        location: "HEBB 100",
        enrolledCapacity: "120 / 150",
        learningType: "In Person"
      }
    ],
    "Discussion": [ /* same fields */ ],
    "Laboratory": [ /* same fields */ ]
  }
}
```

Top-level keys are formatted search terms (e.g. `"CPSC_V 121"`), not raw popup input.

**In-memory copy:** after load, course data lives in `AppState._state.courseData` (`js/state.js`). It is not re-read from storage until the calendar page reloads.

---

## Popup form / UI workspace

| Storage key | API | Written by | Read by |
|---|---|---|---|
| `ubc_ui_workspace_draft` | `chrome.storage.local` | `popup.js` → `saveUiWorkspace()` | `navigation.js`, `storage2.js` |
| `schedulerDraft` | `chrome.storage.local` | `popup.js` (form autosave) | `popup.js` only |

`ubc_ui_workspace_draft` holds the config used for Workday automation:

```js
{
  campus: "vancouver",
  level: "undergraduate",
  timePeriod: "future",
  term: "winter1",
  year: "2025-26",
  courseList: ["CPSC 121", "MATH 101"]
}
```

The calendar loads this via `Storage.getFormData()` in `storage2.js`. Schedule preferences (e.g. `noClassesBefore`, `maxDaysOnCampus`) would live under `formData.preferences` when added; today they default to `{}`.

---

## Saved schedules (with names)

Two storage modules exist. The **calendar** uses `storage2.js`; the **popup** uses `storage.js`.

### Calendar side (active when saving from calendar UI)

| Storage key | API | Shape | Written by | Read by |
|---|---|---|---|---|
| `ubcSchedules` | `chrome.storage.local` | **Array** of schedule objects | `storage2.js` → `saveScheduleWithValidation()` | `AppState.init()`, saved schedules screen |

Each saved schedule:

```js
{
  id: "uuid",
  name: "My Winter Schedule",
  totalCredits: 15,
  sections: [ /* see below */ ],
  metadata: { courseCount, courses, generatedAt },
  createdAt: 1710000000000,
  updatedAt: 1710000000000
}
```

Save rules (`storage2.js`):

- Duplicate names (case-insensitive) replace the existing entry.
- Same id + same name → update in place.
- Same id + new name → create new entry (preserves original).

### Popup saved schedules (same data as calendar)

Both the **calendar** saved-schedules screen and the **popup** saved-schedules screen read from **`ubcSchedules`** via `getCalendarSchedules()` in `storage.js` / `Storage.getAllSchedules()` in `storage2.js`. Shared UI logic lives in `js/savedSchedulesManager.js`.

### Legacy popup vault (unused by saved-schedules UI)

| Storage key | API | Shape | Written by | Read by |
|---|---|---|---|---|
| `ubc_compiled_schedules` | `chrome.storage.local` | **Object** keyed by schedule name/id | `storage.js` → `saveFinalSchedule()` etc. | Legacy helpers only |

---

## Pending Workday schedules (Add to Workday)

When the user selects one or more saved schedules and clicks **Add to Workday** (calendar or popup):

```
User selects schedules (multi-select checkboxes)
  → SavedSchedulesManager.handleAddToWorkday()
  → chrome.storage.local.set({ ubcPendingWorkdaySchedules })
  → background.js FOCUS_WORKDAY_TAB
  → Workday tab focused
  → navigation.js receives PENDING_SCHEDULES_READY
  → reads ubcPendingWorkdaySchedules from storage
```

| Storage key | API | Written by | Read by |
|---|---|---|---|
| `ubcPendingWorkdaySchedules` | `chrome.storage.local` | `SavedSchedulesManager` via `setPendingWorkdaySchedules()` | `navigation.js` → `handlePendingWorkdaySchedules()` |

Payload shape:

```js
{
  scheduleIds: ["uuid-1", "uuid-2"],
  schedules: [ /* full schedule objects from ubcSchedules */ ],
  queuedAt: 1710000000000
}
```

Enrollment automation on Workday will consume this payload in a future step. Until then, `navigation.js` logs the pending schedules when the Workday tab is focused.

---

## Schedule to load (popup/calendar Load button)

When the user clicks **Load** on a saved schedule (popup opens calendar; calendar loads inline):

| Storage key | API | Written by | Read by |
|---|---|---|---|
| `ubcScheduleToLoad` | `chrome.storage.local` | `setScheduleToLoad(id)` | `calendar.js` on init → `Storage.getScheduleToLoad()` |

After the calendar loads the schedule, it clears this key via `Storage.clearScheduleToLoad()`.

---

## Active schedule in the calendar (live editing)

The schedule currently shown on the grid is **not** stored in `chrome.storage` until the user clicks **Save**.

| Location | What it holds |
|---|---|
| `AppState._state.activeSchedule` | Full schedule object shown on the calendar |
| `#scheduleNameInput` | Display name (may differ from saved name until Save) |

`activeSchedule.sections[]` entry:

```js
{
  id: "uuid",
  courseCode: "CPSC_V 121",
  sectionCode: "101",
  sectionType: "Lecture",
  timing: "9:30 a.m. - 11:00 a.m.",
  days: ["Mon", "Wed", "Fri"],
  location: "HEBB 100",
  credits: 4,
  enrolledCapacity: "120 / 150",
  learningType: "In Person",
  dates: ["Sep 2, 2025 – Dec 5, 2025"],
  hasConflict: false
}
```

---

## How live timing changes work (drag-and-drop)

Drag changes are **in-memory only** until Save.

1. User drags a class block (`js/dragmanager.js`).
2. On drag start, `ScheduleValidator.getValidatedAlternatives()` finds other sections for the same course + type.
3. On drop, `calendar.js` → `handleSectionSwap()` updates the matching section in `AppState.activeSchedule`:
   - `sectionCode`, `timing`, `days`, `location`, and related fields are replaced.
4. `LayoutEngine.computeLayout()` recalculates block positions and conflict groups.
5. The grid re-renders from `AppState.activeSchedule` (not from storage).

**Nothing is written to `chrome.storage.local` during drag.** Persistence happens only when the user clicks **Save**, which calls `Storage.saveScheduleWithValidation()` → `ubcSchedules`.

---

## Origin tab (return to Workday)

| Storage key | API | Written by | Read by |
|---|---|---|---|
| `ubcOriginTabId` | `chrome.storage.session` (fallback: `local`) | `navigation.js` → `storeOriginTabId()` | `navigation2.js` → `Navigation.goBack()` |

Stores the Workday tab id so **Add to Workday** can focus the correct tab via `background.js` → `FOCUS_WORKDAY_TAB`.

---

## Quick lookup

| Question | Answer |
|---|---|
| Where is scraped course data stored? | `chrome.storage.local` → `ubcExtractedCourses` (and two duplicate keys) |
| Where does the calendar read it? | `calendar.js` → `AppState.init()` → `Storage.getCourseData()` |
| Where are named saved schedules? | `chrome.storage.local` → `ubcSchedules` (array) |
| Where does popup list saved schedules? | Same key → `getCalendarSchedules()` in `storage.js` |
| Where is the schedule being edited? | `AppState.activeSchedule` (memory) |
| When do drag timing changes persist? | Only after clicking **Save** → `ubcSchedules` |
| Where is popup form config? | `chrome.storage.local` → `ubc_ui_workspace_draft` |
| Where are checked schedules sent for Workday? | `chrome.storage.local` → `ubcPendingWorkdaySchedules` |
| How does calendar know which schedule to open? | `chrome.storage.local` → `ubcScheduleToLoad` (cleared after load) |

---

## Files involved

| File | Role |
|---|---|
| `js/navigation.js` | Scrapes Workday; writes course data + origin tab; reads pending Workday schedules |
| `js/background.js` | Opens/focuses calendar; focuses Workday tab for Add to Workday |
| `js/savedSchedulesManager.js` | Shared saved-schedules list UI (calendar + popup) |
| `calendar.js` | Loads storage, generates schedule, renders UI, handles save/drag |
| `popup.js` | Popup saved-schedules screen wired to same manager |
| `js/storage2.js` | Calendar-side read/write API |
| `js/storage.js` | Popup-side read/write API (`getCalendarSchedules`, pending workday helpers) |
| `js/state.js` | In-memory reactive store (`activeSchedule`, `courseData`, etc.) |
| `js/dragmanager.js` | Pointer drag; calls back into `calendar.js` on drop |
| `js/layoutengine.js` | Block positioning and conflict layout |
| `js/scheduler.js` | Initial schedule generation from course data |
