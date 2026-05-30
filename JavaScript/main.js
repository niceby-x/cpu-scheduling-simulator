// =====================================================================
// main.js — CENTRAL ORCHESTRATOR
//
// This is the top-level entry point of the CPU Scheduling Simulator.
// It is responsible for coordinating all major subsystems of the
// application by connecting user interface events to the scheduling
// algorithms and rendering logic.
//
// Responsibilities:
//   - Importing and delegating work to algorithms.js, ui.js, and export.js
//   - Listening to user interactions (button clicks, dropdown changes)
//   - Running the selected scheduling algorithm on the current process table
//   - Managing two display modes: Instant Mode and Playback Mode
//   - Driving the step-by-step playback animation and auto-play timer
//   - Running the algorithm comparison across all seven algorithms
//   - Handling modal open/close behavior for the comparison view
//   - Maintaining currentSimulationData for use by the Excel export feature
//
// Dependencies:
//   - algorithms.js : Pure scheduling logic (runFCFS, runSJF_NP, etc.)
//   - ui.js         : DOM helpers, input reading, Gantt/table rendering
//   - export.js     : Excel report generation from simulation data
// =====================================================================

const simWorker = new Worker('./JavaScript/worker.js', { type: 'module' });

// UI utility functions and helpers used throughout the application.
//   showToast          — displays brief notification messages to the user
//   algoDescriptions   — map of algorithm keys to their description strings
//   readProcessesFromTable — reads and parses the process input table into objects
//   validateProcesses  — checks for input errors before running a simulation
//   cloneProcesses     — deep-copies process data (needed for comparison runs)
//   addProcessRow      — appends a new editable row to the process input table
//   loadDefaultProcesses — resets the table to a predefined set of sample processes
//   renderGanttChart   — draws the Gantt chart from an array of execution blocks
//   renderTable        — populates the results table with computed process metrics
//   enforceStrictInput — restricts an input field to a valid numeric range
//   renderPlaybackStep — renders a single time-step frame during playback mode
import { 
    showToast, 
    algoDescriptions, 
    readProcessesFromTable, 
    validateProcesses, 
    cloneProcesses, 
    addProcessRow, 
    loadDefaultProcesses, 
    renderGanttChart, 
    renderTable,
    enforceStrictInput,
    renderPlaybackStep,
    MAX_PROCESSES,
    AUTOPLAY_INTERVAL_MS
} from './ui.js';

// Excel export function — generates and downloads a formatted .xlsx report.
import { generateExcelReport } from './export.js';


// ── Module-Wide Constants ─────────────────────────────────────────────
// AUTOPLAY_INTERVAL_MS and MAX_PROCESSES are imported from ui.js, which
// is the single source of truth for both values. Keeping them there
// ensures the auto-play timer and the stat counter animation always
// share the same duration without any duplication.
//
// SPINNER_SVG — shared loading spinner markup injected into both the
//   Run and Compare buttons while their worker tasks are in flight.
//   Defined once here so a design change only needs editing in one place.
const SPINNER_SVG = `<svg class="spinner-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`;

// ── Comparison State ──────────────────────────────────────────────────
// Stored at module level so renderComparisonRows(), renderComparisonSummary(),
// and attachSortListeners() can all read and mutate them without passing
// arguments through every call.
let _compareData = null; // { computed, bestWt, bestTat, bestResp }
let _sortState   = { col: null, dir: 'asc' };


// ── UI State Management (Mini-Store) ──────────────────────────────────
// A lightweight reactive store that holds the application's state. 
// Enforces a strict one-way data flow: UI events update the store, 
// and the store notifies subscribers to reactively re-render the DOM.
const store = {
    state: {
        simulationData: null,
        playback: { active: false, t: 0, interval: null, gantt: null, processes: null, totalTime: 0, finishedNotified: false }
    },
    listeners: [],
    
    subscribe(listener) { this.listeners.push(listener); },
    notify() { this.listeners.forEach(fn => fn(this.state)); },

    setSimulationData(algoName, result) {
        // simulationData is completely replaced, which is safe
        this.state.simulationData = { algoName, result };
    },

    startPlayback(gantt, processes, totalTime) {
        this.stopAutoPlay();
        // Replaces the entire playback object with a new reference
        this.state.playback = { active: true, t: 0, interval: null, gantt, processes, totalTime, finishedNotified: false };
        this.notify();
    },

    stepPlayback() {
        const pb = this.state.playback;
        if (pb.t < pb.totalTime) {
            // IMMUTABLE UPDATE: Create a new object with the incremented 't'
            this.state.playback = { ...pb, t: pb.t + 1 };
            this.notify();
        }
        
        // Evaluate against the newly updated state, not the old 'pb' reference
        if (this.state.playback.t >= this.state.playback.totalTime) {
            this.stopAutoPlay();
        }
    },

    toggleAutoPlay() {
        const pb = this.state.playback;
        if (pb.t >= pb.totalTime) return;
        
        if (pb.interval) {
            this.stopAutoPlay();
        } else {
            // IMMUTABLE UPDATE: Safely update the interval ID
            this.state.playback = { 
                ...pb, 
                interval: setInterval(() => this.stepPlayback(), AUTOPLAY_INTERVAL_MS) 
            };
            this.notify();
        }
    },

    stopAutoPlay() {
        const pb = this.state.playback;
        if (pb.interval) {
            clearInterval(pb.interval);
            // IMMUTABLE UPDATE: Clear the interval safely
            this.state.playback = { ...pb, interval: null };
            this.notify();
        }
    },

    reset() {
        this.stopAutoPlay();
        this.state.simulationData = null;
        // IMMUTABLE UPDATE: Update the active flag safely
        this.state.playback = { ...this.state.playback, active: false };
        // Notify subscribers so any UI tied to the active flag (e.g. the
        // auto-play button label) updates immediately — consistent with all
        // other store methods that mutate state and then call notify().
        this.notify();
    }
};


// ── DOM Ready ─────────────────────────────────────────────────────────
// All DOM interaction is wrapped inside DOMContentLoaded to ensure the
// HTML elements exist before any event listeners or queries are attached.
document.addEventListener("DOMContentLoaded", () => {

    // ── DOM Element References ────────────────────────────────────────
    // Cache references to frequently used UI elements to avoid repeated
    // document.getElementById calls throughout the event handlers.
    const addProcessBtn    = document.getElementById("add-process-btn");
    const simulateBtn      = document.getElementById("simulate-btn");
    const compareBtn       = document.getElementById("compare-btn");
    const resetBtn         = document.getElementById("reset-btn");
    const exportBtn        = document.getElementById("export-btn");
    const algorithmSelect  = document.getElementById("algorithm");
    const quantumContainer = document.getElementById("quantum-container");
    const quantumInput     = document.getElementById("quantum");
    
    // Moved up: Initialize all playback-related DOM references BEFORE using them
    const playbackToggle   = document.getElementById("playback-toggle");
    const playbackControls = document.getElementById("playback-controls");
    const systemState      = document.getElementById("system-state");
    const stepBtn          = document.getElementById("step-btn");
    const autoPlayBtn      = document.getElementById("auto-play-btn");

    // ── Stale Data Warning Helper ──
    const staleWarning = document.getElementById("stale-warning");
    const markStale = () => {
        // Only show the warning if there is actively displayed simulation data
        if (store.state.simulationData || store.state.playback.active) {
            staleWarning.style.display = "flex";
        }
    };

    // Listen for ANY edits inside the table (typing or clicking delete)
    document.getElementById("process-body").addEventListener("input", markStale);
    document.getElementById("process-body").addEventListener("click", (e) => {
        if (e.target.closest(".delete-btn")) markStale();
    });
    
    // Listen for config panel changes
    algorithmSelect.addEventListener("change", markStale);
    quantumInput.addEventListener("input", markStale);
    document.getElementById("quantum-container").addEventListener("click", markStale);

    // ── Playback State Object ─────────────────────────────────────────
    // Tracks all state needed to drive the step-by-step playback feature.
    //   active    — whether playback mode is currently engaged
    //   t         — the current clock tick being displayed
    //   interval  — reference to the setInterval timer for auto-play
    //   gantt     — the full Gantt chart array from the last simulation
    //   processes — the process list with computed metrics
    //   totalTime — the final clock tick; used as the stop condition

    // ── Store Subscriber (Reactive UI Updates) ────────────────────────
    // Automatically handles rendering the step-by-step frames and button 
    // states whenever the playback state changes.
    // SAFE: autoPlayBtn and other references are now guaranteed to be initialized.
    store.subscribe((state) => {
        const pb = state.playback;
        if (!pb.active) return; // Only react if playback is currently active

        // 1. Render the current frame
        renderPlaybackStep(pb.gantt, pb.processes, pb.t, pb.totalTime);
        
        // 2. Reactively update the play/pause button text
        autoPlayBtn.innerHTML = pb.interval ? "Pause ⏸" : "Auto-Play ▶";

        // 3. Check for completion and reveal results
        if (pb.t > 0 && pb.t >= pb.totalTime) {
            document.getElementById("results-table").closest(".out-card").style.display = "block";
            document.querySelector(".stats-row").style.display  = "grid";
            document.querySelector(".export-section").style.display = "flex";
            renderTable(pb.processes);
            
            // Prevent the success toast from spamming if state triggers again
            if (!pb.finishedNotified) {
                showToast("Playback finished!", "success");
                pb.finishedNotified = true; 
            }
        }
    });

    // ── Worker Message Dispatcher ─────────────────────────────────────
    // A single persistent listener for ALL messages from the worker.
    // Context objects are set by each button's click handler just before
    // postMessage() is called, so the dispatcher always has the closure
    // variables (originalText, algoName, quantum) it needs.
    // This replaces the previous pattern of assigning simWorker.onmessage
    // inside simulateBtn's click (which could be silently overwritten) and
    // adding/removing a separate addEventListener inside compareBtn's click
    // (which could accumulate stale listeners on rapid clicks).
    let simulateContext = null;
    let compareContext  = null;

    simWorker.addEventListener("message", (e) => {
        if (e.data.action === "simulate" && simulateContext) {
            handleSimulateResult(e.data.result, simulateContext);
            simulateContext = null;
        } else if (e.data.action === "compare" && compareContext) {
            handleCompareResult(e.data.results, compareContext);
            compareContext = null;
        } else if (e.data.action === "error") {
            // Restore whichever button was spinning so the UI doesn't lock up
            if (simulateContext) {
                simulateBtn.innerHTML = simulateContext.originalText;
                simulateBtn.classList.remove("is-loading");
                simulateBtn.disabled = false;
                simulateContext = null;
            }
            if (compareContext) {
                compareBtn.innerHTML = compareContext.originalText;
                compareBtn.classList.remove("is-loading");
                compareBtn.disabled = false;
                compareContext = null;
            }
            showToast(`Simulation error: ${e.data.message}`, "error");
        }
    });

    // ── handleSimulateResult ──────────────────────────────────────────
    // Processes the result of a single simulation sent back from the worker.
    // Restores the Run button, renders the output (Instant or Playback mode),
    // and scrolls to the output section.
    function handleSimulateResult(result, ctx) {
        simulateBtn.innerHTML = ctx.originalText;
        simulateBtn.classList.remove("is-loading");
        simulateBtn.disabled = false;

        if (staleWarning) staleWarning.style.display = "none";

        if (result) {
            store.setSimulationData(ctx.algoName, result);

            const tag = document.getElementById("algo-tag");
            if (tag) tag.textContent = ctx.algoName;

            const out = document.getElementById("output-section");
            out.style.display = "flex";

            const resultsCard = document.getElementById("results-table").closest(".out-card");
            const statsRow    = document.querySelector(".stats-row");
            const exportSec   = document.querySelector(".export-section");

            if (playbackToggle.checked) {
                playbackControls.style.display = "flex";
                systemState.style.display      = "block";
                resultsCard.style.display      = "none";
                statsRow.style.display         = "none";
                exportSec.style.display        = "none";

                store.startPlayback(result.gantt, result.processes, result.totalTime);
            } else {
                store.reset();
                // Re-set simulationData after reset() clears it.
                // markStale() checks store.state.simulationData to decide
                // whether to show the stale warning; without this line,
                // simulationData is always null in instant mode and the
                // warning never appears when the user edits inputs.
                store.setSimulationData(ctx.algoName, result);
                playbackControls.style.display = "none";
                systemState.style.display      = "none";
                resultsCard.style.display      = "block";
                statsRow.style.display         = "grid";
                exportSec.style.display        = "flex";

                renderGanttChart(result.gantt, result.totalTime);
                renderTable(result.processes);
            }

            showToast("Simulation generated!", "success");
            out.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    // ── renderComparisonRows ──────────────────────────────────────────
    // Reads _compareData and _sortState, then rebuilds the tbody from
    // scratch. Called on first render and again on every column-header
    // click so the sort is always applied to the latest data.
    function renderComparisonRows() {
        if (!_compareData) return;
        const { computed, bestWt, bestTat, bestResp } = _compareData;

        const rows = [...computed];
        if (_sortState.col) {
            rows.sort((a, b) => {
                const va = a[_sortState.col], vb = b[_sortState.col];
                return _sortState.dir === 'asc' ? va - vb : vb - va;
            });
        }

        const tbody = document.getElementById("comparison-body");
        tbody.innerHTML = "";

        rows.forEach(res => {
            const tr         = document.createElement("tr");
            const isWtBest   = res.avgWt   === bestWt;
            const isTatBest  = res.avgTat  === bestTat;
            const isRespBest = res.avgResp === bestResp;
            const wtC        = isWtBest   ? "best-val" : "";
            const tatC       = isTatBest  ? "best-val" : "";
            const respC      = isRespBest ? "best-val" : "";

            // Count how many of the 3 metrics this algorithm wins and
            // show a pill badge so the user doesn't need to count stars.
            const wins = [isWtBest, isTatBest, isRespBest].filter(Boolean).length;
            const winsBadge = wins > 0
                ? `<span class="wins-badge wins-badge--${wins}">${wins}/3</span>`
                : "";

            if (isWtBest)   tr.classList.add("best-wt-row");
            if (isTatBest)  tr.classList.add("best-tat-row");
            if (isRespBest) tr.classList.add("best-rt-row");

            tr.innerHTML = `
                <td><strong>${res.name}</strong>${winsBadge}</td>
                <td class="${wtC}">${res.avgWt.toFixed(2)}</td>
                <td class="${tatC}">${res.avgTat.toFixed(2)}</td>
                <td class="${respC}">${res.avgResp.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ── renderComparisonSummary ───────────────────────────────────────
    // Generates one plain-English sentence below the table that names
    // the winner(s) so the user doesn't have to read every cell.
    function renderComparisonSummary() {
        const el = document.getElementById("comparison-summary");
        if (!el || !_compareData) return;

        const { computed, bestWt, bestTat, bestResp } = _compareData;
        const champion = computed.find(
            r => r.avgWt === bestWt && r.avgTat === bestTat && r.avgResp === bestResp
        );

        if (champion) {
            el.innerHTML = `<span class="summary-champion">${champion.name}</span> dominates — best in all 3 metrics.`;
        } else {
            const wtWinner = computed.find(r => r.avgWt   === bestWt);
            const rtWinner = computed.find(r => r.avgResp === bestResp);
            el.innerHTML =
                `<span class="summary-winner">${wtWinner.name}</span> wins WT + TAT. ` +
                `<span class="summary-winner">${rtWinner.name}</span> wins response time.`;
        }
    }

    // ── attachSortListeners ───────────────────────────────────────────
    // Wires click handlers onto every <th class="sortable"> in the
    // comparison table. Toggles asc/desc on repeated clicks and updates
    // the sort-icon class so CSS can swap the arrow glyph.
    function attachSortListeners() {
        document.querySelectorAll("#comparison-table thead th.sortable").forEach(th => {
            th.addEventListener("click", () => {
                const col = th.dataset.col;
                if (_sortState.col === col) {
                    _sortState.dir = _sortState.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    _sortState.col = col;
                    _sortState.dir = 'asc';
                }
                document.querySelectorAll("#comparison-table thead th.sortable").forEach(t => {
                    t.classList.remove("sort-asc", "sort-desc");
                });
                th.classList.add(_sortState.dir === 'asc' ? "sort-asc" : "sort-desc");
                renderComparisonRows();
            });
        });
    }

    // ── handleCompareResult ───────────────────────────────────────────
    // Processes the results of a full algorithm comparison sent back from
    // the worker. Restores the Compare button, builds the results table,
    // and opens the comparison modal.
    function handleCompareResult(results, ctx) {
        compareBtn.innerHTML = ctx.originalText;
        compareBtn.classList.remove("is-loading");
        compareBtn.disabled = false;

        const modalHeaderLabel = document.querySelector("#comparison-section .panel-label");
        if (modalHeaderLabel) {
            modalHeaderLabel.textContent = `Algorithm Comparison (Time Quantum = ${ctx.quantum})`;
        }

        const computed = results.map(res => {
            let tWt = 0, tTat = 0, tResp = 0;
            const n = res.data.processes.length;
            res.data.processes.forEach(p => { tWt += p.wt; tTat += p.tat; tResp += p.respTime; });
            return { name: res.name, avgWt: tWt / n, avgTat: tTat / n, avgResp: tResp / n };
        });

        // Store results and reset sort so every new comparison starts unsorted.
        _compareData = {
            computed,
            bestWt:   Math.min(...computed.map(r => r.avgWt)),
            bestTat:  Math.min(...computed.map(r => r.avgTat)),
            bestResp: Math.min(...computed.map(r => r.avgResp))
        };
        _sortState = { col: null, dir: 'asc' };

        // Clear any stale sort classes from a previous run.
        document.querySelectorAll("#comparison-table thead th.sortable").forEach(t => {
            t.classList.remove("sort-asc", "sort-desc");
        });

        renderComparisonRows();
        renderComparisonSummary();
        attachSortListeners();

        document.getElementById("comparison-modal").classList.add("active");
    }

    // ── Playback Toggle Label ─────────────────────────────────────────
    // Updates the Run button's label when the user switches between
    // Instant Mode and Playback Mode using the toggle switch.
    playbackToggle.addEventListener("change", (e) => {
        simulateBtn.innerHTML = e.target.checked 
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Playback`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Run`;
    });

    // ── Initialization ────────────────────────────────────────────────
    // Populate the process table with default sample data on first load,
    // display the description for the initially selected algorithm,
    // and apply input validation constraints to the quantum field.
    loadDefaultProcesses();
    document.getElementById("algo-description").textContent = algoDescriptions[algorithmSelect.value];
    enforceStrictInput(quantumInput, 1, 100); // Quantum must be between 1 and 100


    // ── Algorithm Selection ───────────────────────────────────────────
    // When the user changes the algorithm dropdown:
    //   1. Update the description text below the selector.
    //   2. Show or hide the Time Quantum input — only RR and Priority RR need it.
    algorithmSelect.addEventListener("change", (e) => {
        const algo = e.target.value;
        document.getElementById("algo-description").textContent = algoDescriptions[algo];
        quantumContainer.style.display = (algo === "RR" || algo === "PRIORITY_RR") ? "flex" : "none";
    });

    // ── Add Process ───────────────────────────────────────────────────
    // Appends a new blank row to the process input table.
    // Shows a success toast if under the MAX_PROCESSES display limit.
    addProcessBtn.addEventListener("click", () => {
        const currentRows = document.querySelectorAll("#process-body tr").length;
        addProcessRow();
        if (currentRows < MAX_PROCESSES) showToast("New process added.", "success");
        markStale();
    });

    // ── Reset ─────────────────────────────────────────────────────────
    // Restores the process table to its default sample data, hides the
    // output and comparison sections, clears stored simulation data,
    // and scrolls the page back to the top.
    resetBtn?.addEventListener("click", () => {
        store.reset();
        loadDefaultProcesses();
        document.getElementById("output-section").style.display = "none";
        // FIX: The comparison modal is shown/hidden via the "active" class on
        // #comparison-modal (the full overlay), not via display:none on the inner
        // #comparison-section. Using display:none on the inner element hid the
        // content but left the darkened backdrop overlay blocking the UI.
        document.getElementById("comparison-modal").classList.remove("active");
        if (staleWarning) staleWarning.style.display = "none";
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast("Simulator reset to default.", "success");
    });

    exportBtn?.addEventListener("click", () => {
        generateExcelReport(store.state.simulationData);
    });


    // ── Core Simulation Logic ─────────────────────────────────────────
    // Triggered when the user clicks Run or Start Playback.
    // Steps:
    //   1. Read and validate the process table.
    //   2. Identify the selected algorithm and time quantum.
    //   3. Dispatch to the correct algorithm function in algorithms.js.
    //   4. Render the result in either Instant Mode or Playback Mode.
    simulateBtn.addEventListener("click", () => {
        const processes = readProcessesFromTable();
        if (!validateProcesses(processes)) return;

        const algo = algorithmSelect.value;
        const quantum = parseInt(quantumInput.value);

        if ((algo === "RR" || algo === "PRIORITY_RR") && (isNaN(quantum) || quantum <= 0)) {
            showToast("Time Quantum must be > 0 for Round Robin.", "error");
            return;
        }

        // Set UI to highly visible loading state
        const originalText = simulateBtn.innerHTML;
        
        simulateBtn.innerHTML = `${SPINNER_SVG} Simulating...`;
        simulateBtn.classList.add("is-loading"); // <--- Adds the pulsing glow
        simulateBtn.disabled = true;

        // Capture the context the handler will need when the worker responds.
        // The persistent dispatcher (set up above) reads this when the result arrives.
        simulateContext = { originalText, algoName: algorithmSelect.options[algorithmSelect.selectedIndex].text };

        // Send the task to the worker
        simWorker.postMessage({ 
            action: "simulate", 
            algo, 
            quantum, 
            processes 
        });
    });

    // ── Step Button ───────────────────────────────────────────────────
    // Manually advances the playback by exactly one clock tick each click.
    stepBtn.addEventListener("click", () => store.stepPlayback());

    // ── Auto-Play Button ──────────────────────────────────────────────
    // Toggles automatic playback. When active, stepPlayback() is called
    // every AUTOPLAY_INTERVAL_MS via setInterval. Clicking again pauses
    // the animation by clearing the interval. Does nothing if playback
    // is already done.
    autoPlayBtn.addEventListener("click", () => store.toggleAutoPlay());

    // ── Keyboard Shortcuts (Playback Mode) ────────────────────────────
    // Spacebar: Toggle Auto-Play (Play/Pause)
    // Right Arrow: Step Forward
    document.addEventListener("keydown", (e) => {
        const pb = store.state.playback;
        
        // Only listen for shortcuts if Playback Mode is currently active
        if (!pb.active) return;
        
        // Prevent shortcuts from firing if the user is somehow focused on an input field
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

        if (e.code === "Space") {
            e.preventDefault(); // Prevents the page from scrolling down
            store.toggleAutoPlay();
        } else if (e.code === "ArrowRight") {
            e.preventDefault();
            store.stepPlayback();
        }
    });

    // ── Comparison Logic ──────────────────────────────────────────────
    // Runs all seven scheduling algorithms on the same process input and
    // displays their average Waiting Time and Turnaround Time side by side.
    // Each algorithm receives an independent deep clone of the process list
    // to prevent one algorithm's mutations from affecting another's run.
    // The row with the best (lowest) values is visually highlighted.
    compareBtn.addEventListener("click", () => {
        const processes = readProcessesFromTable();
        const quantum = parseInt(quantumInput.value) || 2; 

        if (!validateProcesses(processes)) return;

        // Set UI to loading state
        const originalText = compareBtn.innerHTML;
        
        compareBtn.innerHTML = `${SPINNER_SVG} Running...`;
        compareBtn.classList.add("is-loading"); // <--- Adds the pulsing glow
        compareBtn.disabled = true;

        // Capture context the handler needs when the worker responds.
        compareContext = { originalText, quantum };

        // Send the task to the worker
        simWorker.postMessage({ 
            action: "compare", 
            quantum, 
            processes 
        });
    });


    // ── Modal Close Logic ─────────────────────────────────────────────
    // The comparison results are shown inside a modal dialog. It can be
    // dismissed in three ways: clicking the X button, clicking outside
    // the modal on the backdrop overlay, or pressing the Escape key.
    const closeModalBtn   = document.getElementById("close-modal-btn");
    const comparisonModal = document.getElementById("comparison-modal");

    // Close when the user clicks the 'X' button inside the modal
    closeModalBtn?.addEventListener("click", () => {
        comparisonModal.classList.remove("active");
    });

    // Close when the user clicks the dimmed backdrop outside the modal
    comparisonModal?.addEventListener("click", (e) => {
        if (e.target === comparisonModal) {
            comparisonModal.classList.remove("active");
        }
    });
    
    // Close when the user presses the Escape key while the modal is open
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && comparisonModal.classList.contains("active")) {
            comparisonModal.classList.remove("active");
        }
    });

});