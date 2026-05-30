// =====================================================================
// ui.js — UI RENDERING AND DOM MANIPULATION
//
// This module handles everything the user sees and interacts with in
// the simulator's interface. It is imported by main.js and provides
// all the functions needed to read input, validate it, build the
// process table, render simulation results, and drive the playback view.
//
// Responsibilities:
//   - Defining the color palette assigned to each process
//   - Providing human-readable descriptions for each scheduling algorithm
//   - Reading process data from the HTML input table
//   - Validating process inputs before a simulation is run
//   - Adding, removing, and resetting rows in the process table
//   - Enforcing numeric input constraints on table fields
//   - Rendering the animated Gantt chart in Instant Mode
//   - Rendering the results metrics table with animated stat counters
//   - Rendering individual time-step frames for Playback Mode
//   - Displaying brief toast notifications for user feedback
//
// Exports:
//   showToast, algoDescriptions, readProcessesFromTable, validateProcesses,
//   cloneProcesses (re-exported from utils.js), addProcessRow, loadDefaultProcesses,
//   renderGanttChart, renderTable, enforceStrictInput, renderPlaybackStep,
//   updateProcessIDs, updateCountBadge
// =====================================================================


import { cloneProcesses } from './utils.js';

// ── Process Color Palette ─────────────────────────────────────────────
// A fixed set of ten distinct colors cycled across processes in order.
// Colors are assigned by index (index % colors.length) so they remain
// consistent regardless of how many processes are added or removed.
const colors = [
    "#ef4444", "#3b82f6", "#10b981", "#f59e0b",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
    "#06b6d4", "#84cc16"
];

// ── Simulator-Wide Constants ──────────────────────────────────────────
// Centralised magic numbers so every feature references the same source
// of truth instead of scattering literal values across files.
//   MAX_PROCESSES      — upper bound on how many rows the process table may hold.
//                        Exported so main.js can guard the Add-Process button with
//                        the same value without duplicating the literal.
//   AUTOPLAY_INTERVAL_MS — shared tick duration (ms) used by both the step-by-step
//                        auto-play timer in main.js and the stat counter animation
//                        in animateStat(). Keeping them in sync here ensures the
//                        Gantt chart and the summary numbers always finish together.
export const MAX_PROCESSES       = 10;
export const AUTOPLAY_INTERVAL_MS = 700;


// ── Algorithm Descriptions ────────────────────────────────────────────
// Maps each algorithm's dropdown key to a plain-language description
// displayed below the algorithm selector in the UI. Exported so that
// main.js can update the description text whenever the selection changes.
export const algoDescriptions = {
    "FCFS":        "Executes processes in the exact order they arrive. Simple, but can cause long wait times for small jobs behind large ones (Convoy Effect).",
    "SJF":         "Non-preemptive. Selects the waiting process with the smallest execution time. Optimal for minimizing average wait time, but cannot interrupt a running job.",
    "SRT":         "Preemptive version of SJF. If a new process arrives with a shorter remaining time than the current job, the CPU swaps immediately.",
    "RR":          "Preemptive. Each process gets a fixed time slot (quantum). If it doesn't finish, it goes back to the end of the queue. Highly responsive and fair.",
    "PRIORITY_NP": "Non-preemptive. Runs the process with the highest priority (lowest number). Once started, it runs to completion regardless of new arrivals.",
    "PRIORITY_P":  "Preemptive Priority. A higher-priority arrival immediately preempts the currently running lower-priority process.",
    "PRIORITY_RR": "Combination of priority and round-robin. Processes compete by priority first; ties within a priority level are broken by round-robin."
};


// ── Animation Timeout Registry ────────────────────────────────────────
// Stores all active setTimeout IDs created during Gantt chart animation.
// This list is cleared before each new render so that leftover timers
// from a previous simulation do not interfere with the new one.
let animationTimeouts = [];

// ─────────────────────────────────────────────────────────────────────
// Interactive Tooltip Helper
// Creates a floating glassmorphic card to display exact block stats.
// ─────────────────────────────────────────────────────────────────────
function attachTooltip(element, block, duration) {
    element.addEventListener('mouseenter', () => {
        let tt = document.getElementById('gantt-tooltip');
        if (!tt) {
            tt = document.createElement('div');
            tt.id = 'gantt-tooltip';
            tt.className = 'glass'; 
            document.body.appendChild(tt);
        }
        
        const title = block.id === 'Idle' ? 'CPU Idle' : `Process ${block.id}`;
        const dot = block.id === 'Idle' 
            ? `<span class="color-dot" style="background: transparent; border: 1px solid var(--text-dim);"></span>` 
            : `<span class="color-dot" style="background: ${block.color};"></span>`;
        
        tt.innerHTML = `
            <div class="tooltip-header">
                ${dot}
                <span>${title}</span>
            </div>
            <div class="tooltip-body">
                <div><span>Start:</span> <span>${block.start}</span></div>
                <div><span>End:</span> <span>${block.end}</span></div>
                <div><span>Duration:</span> <span>${duration} units</span></div>
            </div>
        `;
        tt.classList.add('visible');
    });
    
    element.addEventListener('mousemove', (e) => {
        const tt = document.getElementById('gantt-tooltip');
        if (tt) {
            tt.style.left = `${e.pageX + 15}px`;
            tt.style.top = `${e.pageY + 15}px`;
        }
    });
    
    element.addEventListener('mouseleave', () => {
        const tt = document.getElementById('gantt-tooltip');
        if (tt) tt.classList.remove('visible');
    });
}

// ─────────────────────────────────────────────────────────────────────
// showToast(message, type)
//
// Displays a brief, self-dismissing notification at the corner of the
// screen to give the user feedback on their actions (e.g., "Process
// added", "Invalid input", "Simulation complete").
//
// Parameters:
//   - message : The text content to display inside the toast.
//   - type    : Either "success" (green, checkmark) or "error" (red, X).
//               Defaults to "error" if not specified.
//
// Behavior:
//   - Creates a new toast element and appends it to the toast container.
//   - Uses a double requestAnimationFrame to ensure the element is in
//     the DOM before the CSS transition that slides it into view fires.
//   - Automatically removes itself after 3 seconds (with a 500ms fade out).
// ─────────────────────────────────────────────────────────────────────
export function showToast(message, type = "error") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    // SVG icons for visual reinforcement of success vs. error state
    const successIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const errorIcon   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    // The icon half is trusted in-codebase SVG so innerHTML is safe there.
    // The message is set via textContent after the fact to prevent any
    // user-controlled content (e.g. process IDs with < or > characters)
    // from being interpreted as raw HTML.
    toast.innerHTML = `
        <div class="toast-icon">${type === 'success' ? successIcon : errorIcon}</div>
        <div class="toast-message"></div>
    `;
    toast.querySelector(".toast-message").textContent = message;

    container.appendChild(toast);
    
    // Double rAF: first frame commits the element to the DOM,
    // second frame triggers the CSS transition into the visible state.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add("show");
        });
    });

    // After 3 seconds, begin fade-out, then fully remove from the DOM
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 500); 
    }, 3000);
}


// ─────────────────────────────────────────────────────────────────────
// updateCountBadge()
//
// Reads the current number of rows in the process input table and
// updates the badge element that displays the process count label
// (e.g., "4 processes loaded" or "1 process loaded").
// Called after every row addition or deletion to keep the badge in sync.
// ─────────────────────────────────────────────────────────────────────
export function updateCountBadge() {
    const n = document.querySelectorAll("#process-body tr").length;
    const badge = document.getElementById("process-count-badge");
    if (badge) badge.textContent = `${n} process${n !== 1 ? "es" : ""} loaded`;
}


// ─────────────────────────────────────────────────────────────────────
// updateProcessIDs()
//
// Re-numbers all process ID inputs and re-assigns color dots after any
// change to the table (add or delete). This ensures IDs always read
// P1, P2, P3... in order and each row's dot color matches its palette
// index, even after rows are removed from the middle.
//
// Also calls updateCountBadge() to keep the count label accurate.
// ─────────────────────────────────────────────────────────────────────
export function updateProcessIDs() {
    const rows = document.querySelectorAll("#process-body tr");
    rows.forEach((row, index) => {
        // Re-label each ID input sequentially (P1, P2, P3, ...)
        const idInput = row.querySelector(".p-id");
        if (idInput) idInput.value = `P${index + 1}`;

        // Re-assign the color dot to match this row's new index position
        const dot = row.querySelector(".color-dot");
        if (dot) dot.style.background = colors[index % colors.length];
    });
    updateCountBadge();
}


// ─────────────────────────────────────────────────────────────────────
// readProcessesFromTable()
//
// Reads all rows from the process input table and converts them into
// an array of process objects ready to be passed to any scheduling
// algorithm in algorithms.js.
//
// Each returned process object contains:
//   - id            : Process label read from the read-only ID field
//   - at            : Arrival Time (parsed as integer)
//   - bt            : Burst Time (parsed as integer)
//   - priority      : Priority value (parsed as integer)
//   - color         : Color from the palette at this row's index
//   - remTime       : Set equal to bt; decremented by preemptive algorithms
//   - originalIndex : Row position — used as a stable tie-breaker in sorts
//   - firstStart    : Initialized to -1; set when the process first runs
//   - ct, tat, wt, respTime : Metric fields initialized to 0; filled post-run
// ─────────────────────────────────────────────────────────────────────
export function readProcessesFromTable() {
    const rows = document.querySelectorAll("#process-body tr");
    return Array.from(rows).map((row, index) => ({
        id:            row.querySelector(".p-id").value,
        at:            parseInt(row.querySelector(".p-at").value),
        bt:            parseInt(row.querySelector(".p-bt").value),
        priority:      parseInt(row.querySelector(".p-priority").value),
        color:         colors[index % colors.length],
        remTime:       parseInt(row.querySelector(".p-bt").value), // Starts equal to bt
        originalIndex: index,
        firstStart:    -1,   // -1 signals "not yet started"
        ct: 0, tat: 0, wt: 0, respTime: 0
    }));
}


// ─────────────────────────────────────────────────────────────────────
// cloneProcesses — imported from utils.js and re-exported so that
// main.js can keep its single import point (ui.js) unchanged.
// The implementation lives in utils.js because worker.js also needs
// it and cannot import from ui.js (different execution context).
// ─────────────────────────────────────────────────────────────────────
export { cloneProcesses };


// ─────────────────────────────────────────────────────────────────────
// validateProcesses(processes)
//
// Checks the process list for input errors before a simulation is run.
// Iterates through every process and verifies:
//   - Arrival Time (at) is a valid number and is ≥ 0
//   - Burst Time (bt) is a valid number and is > 0
//   - Priority is a valid number (any integer is acceptable)
//
// If a violation is found, a descriptive error toast is shown and the
// function returns false, signaling to main.js to abort the simulation.
// Returns true if all processes pass validation.
// ─────────────────────────────────────────────────────────────────────
export function validateProcesses(processes) {
    for (let p of processes) {
        if (isNaN(p.at) || p.at < 0 || isNaN(p.bt) || p.bt <= 0 || isNaN(p.priority)) {
            showToast(`Invalid input for ${p.id}. Arrival ≥ 0 and Burst > 0 required.`, "error");
            return false;
        }
    }
    return true;
}


// ─────────────────────────────────────────────────────────────────────
// enforceStrictInput(inputElement, minValue, maxValue)
//
// Attaches two event listeners to a numeric input field to prevent
// invalid values from being entered or retained.
//
// Parameters:
//   - inputElement : The <input> DOM element to protect.
//   - minValue     : The minimum allowed integer value.
//   - maxValue     : The maximum allowed integer value (default: 9999).
//
// Behavior:
//   1. keydown — Blocks non-numeric keys (e, E, -, +, .) before they
//      can be typed, preventing browser-native number input quirks.
//   2. change  — After the user commits a value (blur or Enter), clamps
//      it to the allowed range and shows a corrective toast if needed.
// ─────────────────────────────────────────────────────────────────────
export function enforceStrictInput(inputElement, minValue, maxValue = 9999) {
    // Block disallowed characters at the keystroke level
    inputElement.addEventListener('keydown', (e) => {
        if (['e', 'E', '-', '+', '.'].includes(e.key)) {
            e.preventDefault();
        }
    });
    
    // Clamp the committed value to [minValue, maxValue] on change.
    // FIX: Use "success" (blue) instead of "error" (red) for auto-correction
    // toasts. A clamped value is a helpful correction, not a user error —
    // showing a red toast was semantically misleading and unnecessarily alarming.
    inputElement.addEventListener('change', () => {
        let val = parseInt(inputElement.value);
        
        if (isNaN(val) || val < minValue) {
            inputElement.value = minValue;
            showToast(`Value auto-corrected to minimum (${minValue}).`, "success");
        } else if (val > maxValue) {
            inputElement.value = maxValue;
            showToast(`Value capped at maximum limit (${maxValue}).`, "success");
        }
    });
}


// ─────────────────────────────────────────────────────────────────────
// addProcessRow(at, bt, priority)
//
// Appends a new editable row to the process input table with the given
// default field values. Enforces a maximum of MAX_PROCESSES rows — shows an
// error toast and returns early if the limit is already reached.
//
// Parameters:
//   - at       : Default Arrival Time for the new row (default: 0).
//   - bt       : Default Burst Time for the new row (default: 1).
//   - priority : Default Priority for the new row (default: 1).
//
// Each new row includes:
//   - A read-only, auto-assigned process ID (managed by updateProcessIDs)
//   - A color indicator dot matching this row's palette color
//   - Numeric input fields for AT, BT, and Priority with enforced ranges
//   - A delete button that removes the row (minimum of 3 rows enforced)
//   - Auto-select behavior on focus for convenient re-entry of values
// ─────────────────────────────────────────────────────────────────────
export function addProcessRow(at = 0, bt = 1, priority = 1) {
    const processBody = document.getElementById("process-body");
    const currentRows = document.querySelectorAll("#process-body tr").length;
    
    // Enforce the process-count maximum
    if (currentRows >= MAX_PROCESSES) {
        showToast(`Maximum of ${MAX_PROCESSES} processes allowed.`, "error");
        return;
    }

    const idx   = currentRows;
    const color = colors[idx % colors.length];

    // Build the table row with all input fields and the delete button
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>
            <div class="pid-cell">
                <span class="color-dot" style="background:${color};"></span>
                <input type="text" class="p-id" readonly>
            </div>
        </td>
        <td><input type="number" class="p-at"       value="${at}"       min="0"></td>
        <td><input type="number" class="p-bt"       value="${bt}"       min="1"></td>
        <td><input type="number" class="p-priority" value="${priority}" min="0"></td>
        <td><button class="delete-btn" title="Remove">✕</button></td>
    `;

    // Select all text in a numeric field when focused — improves usability
    tr.querySelectorAll('input[type="number"]').forEach(inp =>
        inp.addEventListener('focus', function () { this.select(); })
    );

    // Apply range constraints to each numeric field in this row
    enforceStrictInput(tr.querySelector('.p-at'),       0,  999);
    enforceStrictInput(tr.querySelector('.p-bt'),       1,  999);
    enforceStrictInput(tr.querySelector('.p-priority'), 0,   99);

    // Delete button: removes the row only if at least 3 rows will remain
    tr.querySelector(".delete-btn").addEventListener("click", () => {
        if (document.querySelectorAll("#process-body tr").length > 3) {
            tr.remove();
            updateProcessIDs(); // Re-sequence all IDs and colors after removal
            showToast("Process removed.", "success");
        } else {
            showToast("You need at least 3 processes.", "error");
        }
    });

    processBody.appendChild(tr);
    updateProcessIDs(); // Assign the correct ID and color to the new row
}


// ─────────────────────────────────────────────────────────────────────
// loadDefaultProcesses()
//
// Clears the process table and populates it with a predefined set of
// five sample processes used as the default state of the simulator.
// Called on initial page load and whenever the Reset button is clicked.
// ─────────────────────────────────────────────────────────────────────
export function loadDefaultProcesses() {
    const processBody = document.getElementById("process-body");
    processBody.innerHTML = ""; // Clear all existing rows first

    // Default processes use staggered arrival times so the simulator demonstrates
    // idle gaps and arrival-driven scheduling from the very first run.
    // P1 and P2 finish at time 3. P3 doesn't arrive until time 5, creating an Idle gap!
    // Preemptive algorithms will also show mid-run context switches when P4 arrives.
    // Arguments: addProcessRow(arrivalTime, burstTime, priority)
    addProcessRow(0, 2, 2); // P1: arrives at 0, burst 2, Priority 2
    addProcessRow(0, 1, 1); // P2: arrives at 0, burst 1, Priority 1 (CPU finishes at tick 3)
    addProcessRow(5, 8, 4); // P3: arrives at 5, burst 8, Priority 4 (Idle gap from 3 to 5!)
    addProcessRow(7, 3, 3); // P4: arrives at 7, burst 3, Priority 3 (Preempts P3 in SRT!)
    addProcessRow(12, 4, 2); // P5: arrives at 12, burst 4, Priority 2
}

// ─────────────────────────────────────────────────────────────────────
// animateStat(id, targetValue)  [Internal — not exported]
//
// Animates a numeric statistic element from its current displayed value
// to a new target value using an ease-out cubic interpolation over
// 416 milliseconds. Used to animate the Average WT and Average TAT
// summary stats after a simulation completes. Duration is driven by
// AUTOPLAY_INTERVAL_MS so the counter always matches the playback speed.
//
// Parameters:
//   - id          : The DOM element ID whose text content will be animated.
//   - targetValue : The final numeric value to count up (or down) to.
//
// Easing: Uses a cubic ease-out curve (1 - (1-p)^3) so the counter
// decelerates smoothly as it approaches the final value.
//
// Cancellation: A module-level Map stores the active rAF ID for each
// element. If animateStat is called again before the previous animation
// finishes (e.g. the user clicks Run multiple times quickly), the old
// loop is cancelled via cancelAnimationFrame before a new one starts.
// Without this, multiple rAF loops running on the same element cause
// the counter to flicker or land on the wrong final value.
// ─────────────────────────────────────────────────────────────────────

// Registry: maps element ID → active requestAnimationFrame ID.
// Stored outside animateStat so it persists across calls.
const _statRafIds = new Map();

function animateStat(id, targetValue) {
    const el = document.getElementById(id);
    if (!el) return;

    // Cancel any in-progress animation on this element before starting a new one
    if (_statRafIds.has(id)) {
        cancelAnimationFrame(_statRafIds.get(id));
        _statRafIds.delete(id);
    }

    const start = parseFloat(el.textContent) || 0; // Current displayed value
    const end   = parseFloat(targetValue);
    const dur   = AUTOPLAY_INTERVAL_MS; // Matches the auto-play tick so animations finish together
    const t0    = performance.now();

    function step(now) {
        const p    = Math.min((now - t0) / dur, 1);      // Normalized progress [0, 1]
        const ease = 1 - Math.pow(1 - p, 3);             // Cubic ease-out
        el.textContent = (start + (end - start) * ease).toFixed(2);

        if (p < 1) {
            // Store the new rAF ID so it can be cancelled if needed
            _statRafIds.set(id, requestAnimationFrame(step));
        } else {
            // Animation complete — clean up the registry entry
            _statRafIds.delete(id);
        }
    }

    _statRafIds.set(id, requestAnimationFrame(step));
}


// ─────────────────────────────────────────────────────────────────────
// renderGanttChart(gantt, totalTime)
//
// Builds and renders the animated Gantt chart in Instant Mode from a
// completed simulation's gantt array. Each block expands into view one
// after another using staggered setTimeout calls and CSS flex-grow
// transitions for a smooth left-to-right reveal animation.
//
// Parameters:
//   - gantt     : Array of execution blocks { id, start, end, color }
//                 as returned by any algorithm in algorithms.js.
//   - totalTime : Total simulation duration; used as a guard to skip
//                 rendering if no simulation has been run (totalTime = 0).
//
// Behavior:
//   1. Clears previous chart content and cancels any pending animation timers.
//   2. Merges consecutive blocks with the same process ID to simplify display.
//   3. For each block, creates a Gantt bar div and a matching timeline label div.
//   4. Both elements start at zero width and expand to their proportional
//      flex-grow value via a staggered delay of 110ms × block index.
//   5. The first block additionally receives a start time label on the left.
// ─────────────────────────────────────────────────────────────────────
export function renderGanttChart(gantt, totalTime) {
    if (totalTime === 0) return;

    const container = document.getElementById("gantt-chart");
    const timeline  = document.getElementById("gantt-timeline");
    container.innerHTML = "";
    timeline.innerHTML  = "";

    // Cancel any in-progress animation timers from the previous simulation
    animationTimeouts.forEach(clearTimeout);
    animationTimeouts = [];

    // Merge consecutive blocks with the same ID into a single visual bar
    let opt = [];
    gantt.forEach(b => {
        if (opt.length && opt[opt.length - 1].id === b.id) opt[opt.length - 1].end = b.end;
        else opt.push({ ...b });
    });

    opt.forEach((block, i) => {
        const duration = block.end - block.start;
        
        // ── Gantt Block ───────────────────────────────────────────────
        // Create the colored bar. Idle blocks have no label and no color.
        const div = document.createElement("div");
        div.className = `gantt-block ${block.id === 'Idle' ? 'idle' : ''}`;
        div.style.backgroundColor = block.color;
        div.textContent = block.id === 'Idle' ? '' : block.id;
        
        attachTooltip(div, block, duration);

        // Start collapsed (zero width) so the flex-grow expansion is visible
        div.style.flexGrow   = '0';
        div.style.flexBasis  = '0px';
        div.style.minWidth   = '0px';
        div.style.padding    = '0';
        container.appendChild(div);

        // ── Timeline Label ────────────────────────────────────────────
        // Create the matching time marker below the Gantt bar.
        const tDiv = document.createElement("div");
        tDiv.className = "time-block";
        
        // Also starts collapsed to animate in sync with the Gantt block
        tDiv.style.flexGrow  = '0';
        tDiv.style.flexBasis = '0px';
        tDiv.style.minWidth  = '0px';
        
        // Show the end time on the right; the first block also shows its start time
        let timeHTML = `<span class="time-marker">${block.end}</span>`;
        if (i === 0) {
            timeHTML = `<span class="time-marker start-marker">${block.start}</span>` + timeHTML;
        }
        tDiv.innerHTML = timeHTML;
        timeline.appendChild(tDiv);

        // ── Staggered Animation ───────────────────────────────────────
        // Each block expands 110ms after the previous one, creating a
        // sequential left-to-right animation across the full chart.
        const tid = setTimeout(() => { 
            div.style.flexGrow  = duration;
            div.style.minWidth  = '40px';
            div.style.padding   = '0 4px';
            
            tDiv.style.flexGrow = duration;
            tDiv.style.minWidth = '40px';
        }, i * 110);

        // Register this timer so it can be cancelled on the next render
        animationTimeouts.push(tid);
    });
}


// ─────────────────────────────────────────────────────────────────────
// renderTable(processes)
//
// Populates the results metrics table with each process's computed
// Waiting Time (WT) and Turnaround Time (TAT) after a simulation runs.
// Also triggers animated counters for the Average WT and Average TAT
// summary stats displayed below the table.
//
// Parameters:
//   - processes : The updated process array returned by an algorithm,
//                 containing computed ct, tat, wt, and respTime values.
//
// Behavior:
//   - Sorts processes by their numeric ID (P1, P2, P3...) before rendering
//     so the table always displays in sequential process order regardless
//     of the order in which processes completed.
//   - Accumulates total WT and TAT to compute averages for the stat cards.
//   - Calls animateStat() to smoothly count up the average value displays.
// ─────────────────────────────────────────────────────────────────────
export function renderTable(processes) {
    const tbody = document.getElementById("results-body");
    tbody.innerHTML = "";
    let tWt = 0, tTat = 0, tResp = 0;

    // Sort by process number so results always appear in P1, P2, P3... order
    const list = [...processes].sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));

    list.forEach(p => {
        tWt   += p.wt;
        tTat  += p.tat;
        tResp += p.respTime;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div class="pid-cell">
                    <span class="color-dot" style="background:${p.color};"></span>
                    <strong style="font-family:var(--f-mono); font-size:0.8rem;">${p.id}</strong>
                </div>
            </td>
            <td>${p.at}</td>
            <td>${p.bt}</td>
            <td>${p.ct}</td>
            <td>${p.respTime}</td>
            <td>${p.wt}</td>
            <td>${p.tat}</td>
        `;
        tbody.appendChild(tr);
    });

    // Animate the average stat cards from their previous value to the new one
    const n = processes.length;
    animateStat("avg-wt",   (tWt   / n).toFixed(2));
    animateStat("avg-tat",  (tTat  / n).toFixed(2));
    animateStat("avg-resp", (tResp / n).toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────
// renderPlaybackStep(gantt, processes, t, totalTime)
//
// Renders a single frame of the step-by-step playback visualization at
// a given clock tick 't'. Called by the Step and Auto-Play controls in
// main.js every time the simulation advances by one time unit.
//
// Unlike renderGanttChart (which animates all blocks at once), this
// function instantly draws only the portion of the Gantt chart that has
// elapsed by time 't', then adds an invisible spacer to preserve the
// chart's total width so the scale does not shift between frames.
//
// Parameters:
//   - gantt     : The full Gantt array from the simulation result.
//   - processes : The process list with computed metrics and properties.
//   - t         : The current clock tick to render up to.
//   - totalTime : The total simulation duration (used for the spacer).
//
// Behavior:
//   1. Filters and trims Gantt blocks to only show what has happened by time t.
//   2. Renders those blocks without CSS transitions (instant snap per step).
//   3. Appends an invisible flex spacer representing the remaining future time.
//   4. Updates the CPU State indicator (running process or Idle).
//   5. Rebuilds the Ready Queue display showing which processes are waiting.
// ─────────────────────────────────────────────────────────────────────
export function renderPlaybackStep(gantt, processes, t, totalTime) {
    if (totalTime === 0) return;

    const container = document.getElementById("gantt-chart");
    const timeline  = document.getElementById("gantt-timeline");
    container.innerHTML = "";
    timeline.innerHTML  = "";
    
    // ── Step 1: Build the visible block list up to time t ─────────────
    // For each Gantt block that has started before t, include it (clipped
    // to t if it extends beyond the current tick).
    let blocksUpToT = [];
    for (let block of gantt) {
        if (block.start >= t) break;  // Stop when we hit future blocks
        let displayEnd = Math.min(block.end, t);
        blocksUpToT.push({ ...block, end: displayEnd, duration: displayEnd - block.start });
    }

    // ── Step 2: Render the elapsed blocks ────────────────────────────
    blocksUpToT.forEach((block, i) => {
        const div = document.createElement("div");
        div.className = `gantt-block ${block.id === 'Idle' ? 'idle' : ''}`;
        div.style.backgroundColor = block.color;
        div.textContent = block.id === 'Idle' ? '' : block.id;
        div.style.flexGrow  = block.duration;
        div.style.minWidth  = '40px';
        div.style.padding   = '0 4px';
        div.style.transition = 'none'; // No CSS transition — snaps instantly per step
        
        attachTooltip(div, block, block.duration);
        
        container.appendChild(div);

        const tDiv = document.createElement("div");
        tDiv.className = "time-block";
        tDiv.style.flexGrow   = block.duration;
        tDiv.style.minWidth   = '40px';
        tDiv.style.transition = 'none';
        
        let timeHTML = `<span class="time-marker">${block.end}</span>`;
        if (i === 0) timeHTML = `<span class="time-marker start-marker">${block.start}</span>` + timeHTML;
        tDiv.innerHTML = timeHTML;
        timeline.appendChild(tDiv);
    });

    // ── Step 3: Add invisible future spacer ───────────────────────────
    // Fills the remaining chart width with a transparent placeholder so
    // the proportional scale of elapsed blocks stays consistent at every
    // step of the playback, preventing layout shifts as time advances.
    let futureDuration = totalTime - t;
    if (futureDuration > 0) {
        const fDiv = document.createElement("div");
        fDiv.style.flexGrow = futureDuration;
        fDiv.style.minWidth = '0px';
        container.appendChild(fDiv);

        const fTDiv = document.createElement("div");
        fTDiv.style.flexGrow = futureDuration;
        fTDiv.style.minWidth = '0px';
        timeline.appendChild(fTDiv);
    }

    // ── Step 4: Update the CPU State display ──────────────────────────
    // Shows which process is scheduled to run in the exact window [t, t+1).
    document.getElementById("current-t").textContent = t;
    
    // Scan the full original gantt chart to find the active block at tick t.
    // If t >= totalTime, the simulation is complete, so nothing is active.
    const activeBlock = t < totalTime ? gantt.find(b => b.start <= t && b.end > t) : null;
    
    const cpuState    = document.getElementById("cpu-state");
    
    if (!activeBlock || activeBlock.id === 'Idle') {
        cpuState.textContent       = "Idle";
        cpuState.style.background  = "var(--input-bg)";
        cpuState.style.color       = "var(--text-sub)";
    } else {
        cpuState.textContent      = activeBlock.id;
        cpuState.style.background = activeBlock.color;
        cpuState.style.color      = "#fff";
    }

    // ── Step 5: Rebuild the Ready Queue display ───────────────────────
    // Computes how much CPU time each process has received strictly BEFORE time t.
    
    let execTimes = {};
    processes.forEach(p => execTimes[p.id] = 0);
    
    // Tally executed time from the original gantt chart up to time t
    gantt.forEach(b => {
        if (b.id !== 'Idle' && b.start < t) {
            execTimes[b.id] += Math.min(b.end, t) - b.start;
        }
    });

    const readyQueueContainer = document.getElementById("ready-queue");
    readyQueueContainer.innerHTML = "";
    let inQueue = 0;
    
    // Sort by arrival time for a consistent display order in the queue
    [...processes].sort((a, b) => a.at - b.at).forEach(p => {
        const isActive = activeBlock && activeBlock.id === p.id;

        // A process belongs in the ready queue if:
        //   - It has arrived (at <= t)
        //   - It still has remaining burst time (execTimes < bt)
        //   - It is not the one currently executing on the CPU
        if (p.at <= t && execTimes[p.id] < p.bt && !isActive) {
            const badge = document.createElement("span");
            badge.className        = "algo-pill";
            badge.style.background = `rgba(255,255,255,0.08)`;
            badge.style.border     = `1px solid ${p.color}`;
            badge.style.color      = p.color;
            badge.textContent      = p.id;
            readyQueueContainer.appendChild(badge);
            inQueue++;
        }
    });
    
    // If no processes are waiting, show a placeholder message
    if (inQueue === 0) {
        readyQueueContainer.innerHTML = "<span style='color: var(--text-dim); font-size: 0.8rem; padding-top: 4px;'>Queue Empty</span>";
    }
}