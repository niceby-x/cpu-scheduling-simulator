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
    renderPlaybackStep
} from './ui.js';

// Excel export function — generates and downloads a formatted .xlsx report.
import { generateExcelReport } from './export.js';


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
                interval: setInterval(() => this.stepPlayback(), 700) 
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
            handleWorkerError(e.data.source, e.data.message);
            // Clear whichever context was active so stale state doesn't linger
            simulateContext = null;
            compareContext  = null;
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
            let tWt = 0, tTat = 0;
            const n = res.data.processes.length;
            res.data.processes.forEach(p => { tWt += p.wt; tTat += p.tat; });
            return { name: res.name, avgWt: tWt / n, avgTat: tTat / n };
        });

        const bestWt  = Math.min(...computed.map(r => r.avgWt));
        const bestTat = Math.min(...computed.map(r => r.avgTat));

        const tbody = document.getElementById("comparison-body");
        tbody.innerHTML = "";

        computed.forEach(res => {
            const tr   = document.createElement("tr");
            const wtC  = res.avgWt  === bestWt  ? "best-val" : "";
            const tatC = res.avgTat === bestTat ? "best-val" : "";

            if (wtC && tatC) tr.classList.add("best-row");

            tr.innerHTML = `
                <td><strong>${res.name}</strong></td>
                <td class="${wtC}">${res.avgWt.toFixed(2)}</td>
                <td class="${tatC}">${res.avgTat.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById("comparison-modal").classList.add("active");
    }

    // ── handleWorkerError ─────────────────────────────────────────────
    // Called when the worker posts { action: "error", source, message }.
    // Restores whichever button was active and shows an error toast so the
    // UI never stays frozen with a stuck spinner after a worker failure.
    function handleWorkerError(source, message) {
        if (source === "simulate") {
            simulateBtn.innerHTML = playbackToggle.checked
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Playback`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Run`;
            simulateBtn.classList.remove("is-loading");
            simulateBtn.disabled = false;
        } else if (source === "compare") {
            compareBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg> Compare All`;
            compareBtn.classList.remove("is-loading");
            compareBtn.disabled = false;
        }
        showToast(`Simulation error: ${message}`, "error");
        console.error(`[Worker error] source=${source}:`, message);
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
    // Shows a success toast if under the 10-process display limit.
    addProcessBtn.addEventListener("click", () => {
        const currentRows = document.querySelectorAll("#process-body tr").length;
        addProcessRow();
        if (currentRows < 10) showToast("New process added.", "success");
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
        document.getElementById("comparison-section").style.display = "none";
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
        
        // Crisp SVG Spinner
        const spinnerSVG = `<svg class="spinner-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`;
        
        simulateBtn.innerHTML = `${spinnerSVG} Simulating...`;
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
    // every 700ms via setInterval. Clicking again pauses the animation
    // by clearing the interval. Does nothing if playback is already done.
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
        
        // Crisp SVG Spinner
        const spinnerSVG = `<svg class="spinner-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`;
        
        compareBtn.innerHTML = `${spinnerSVG} Running...`;
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