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


// ── Imports ───────────────────────────────────────────────────────────
// Scheduling algorithm functions — each accepts a process list (and
// optional quantum) and returns { gantt, processes, totalTime }.
import { 
    runFCFS, 
    runSJF_NP, 
    runSRT, 
    runRR, 
    runPriority_NP, 
    runPriority_P, 
    runPriority_RR 
} from './algorithms.js';

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


// ── Global Simulation State ───────────────────────────────────────────
// Stores the most recent simulation result so it can be passed to the
// Excel export function when the user clicks the Export button.
// Initialized to null and updated every time a simulation is run.
let currentSimulationData = null;


// ── DOM Ready ─────────────────────────────────────────────────────────
// All DOM interaction is wrapped inside DOMContentLoaded to ensure the
// HTML elements exist before any event listeners or queries are attached.
document.addEventListener("DOMContentLoaded", () => {

    // ── DOM Element References ────────────────────────────────────────
    // Cache references to frequently used UI elements to avoid repeated
    // document.getElementById calls throughout the event handlers.
    const addProcessBtn   = document.getElementById("add-process-btn");
    const simulateBtn     = document.getElementById("simulate-btn");
    const compareBtn      = document.getElementById("compare-btn");
    const resetBtn        = document.getElementById("reset-btn");
    const exportBtn       = document.getElementById("export-btn");
    const algorithmSelect = document.getElementById("algorithm");
    const quantumContainer= document.getElementById("quantum-container");
    const quantumInput    = document.getElementById("quantum");

    // ── Playback State Object ─────────────────────────────────────────
    // Tracks all state needed to drive the step-by-step playback feature.
    //   active    — whether playback mode is currently engaged
    //   t         — the current clock tick being displayed
    //   interval  — reference to the setInterval timer for auto-play
    //   gantt     — the full Gantt chart array from the last simulation
    //   processes — the process list with computed metrics
    //   totalTime — the final clock tick; used as the stop condition
    let playbackState = { active: false, t: 0, interval: null, gantt: null, processes: null, totalTime: 0 };

    const playbackToggle  = document.getElementById("playback-toggle");
    const playbackControls= document.getElementById("playback-controls");
    const systemState     = document.getElementById("system-state");
    const stepBtn         = document.getElementById("step-btn");
    const autoPlayBtn     = document.getElementById("auto-play-btn");

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
        addProcessRow(0, 0, 0);
        if (currentRows < 10) showToast("New process added.", "success");
    });

    // ── Reset ─────────────────────────────────────────────────────────
    // Restores the process table to its default sample data, hides the
    // output and comparison sections, clears stored simulation data,
    // and scrolls the page back to the top.
    resetBtn?.addEventListener("click", () => {
        loadDefaultProcesses();
        document.getElementById("output-section").style.display = "none";
        document.getElementById("comparison-section").style.display = "none";
        currentSimulationData = null;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast("Simulator reset to default.", "success");
    });

    // ── Export ────────────────────────────────────────────────────────
    // Passes the most recent simulation result to the Excel report
    // generator. The button is only visible after a simulation has run.
    exportBtn?.addEventListener("click", () => {
        generateExcelReport(currentSimulationData);
    });


    // ── Core Simulation Logic ─────────────────────────────────────────
    // Triggered when the user clicks Run or Start Playback.
    // Steps:
    //   1. Read and validate the process table.
    //   2. Identify the selected algorithm and time quantum.
    //   3. Dispatch to the correct algorithm function in algorithms.js.
    //   4. Render the result in either Instant Mode or Playback Mode.
    simulateBtn.addEventListener("click", () => {

        // Read current process rows from the input table
        const processes = readProcessesFromTable();

        // Abort if any validation errors are found (e.g., missing fields)
        if (!validateProcesses(processes)) return;

        const algo    = algorithmSelect.value;
        const quantum = parseInt(quantumInput.value);

        // Extra guard: Round Robin algorithms require a valid time quantum
        if ((algo === "RR" || algo === "PRIORITY_RR") && (isNaN(quantum) || quantum <= 0)) {
            showToast("Time Quantum must be > 0 for Round Robin.", "error");
            return;
        }

        let result;
        
        // Dispatch the process list to the appropriate scheduling algorithm.
        // Each case calls the corresponding function from algorithms.js and
        // stores the returned { gantt, processes, totalTime } object.
        switch (algo) {
            case "FCFS":        result = runFCFS(processes);                  break;
            case "SJF":         result = runSJF_NP(processes);                break;
            case "SRT":         result = runSRT(processes);                   break;
            case "RR":          result = runRR(processes, quantum);           break;
            case "PRIORITY_RR": result = runPriority_RR(processes, quantum);  break;
            case "PRIORITY_NP": result = runPriority_NP(processes);           break;
            case "PRIORITY_P":  result = runPriority_P(processes);            break;
            default:
                showToast("Unknown algorithm selected.", "error");
                return;
        }

        if (result) {
            // Store the result globally so the Export button can access it later
            const algoName = algorithmSelect.options[algorithmSelect.selectedIndex].text;
            currentSimulationData = { algoName, result };

            // Update the algorithm name tag shown above the output section
            const tag = document.getElementById("algo-tag");
            if (tag) tag.textContent = algoName;

            // Make the output section visible
            const out = document.getElementById("output-section");
            out.style.display = "flex";
            
            // References to UI sections that are hidden during active playback
            const resultsCard = document.getElementById("results-table").closest(".out-card");
            const statsRow    = document.querySelector(".stats-row");
            const exportSec   = document.querySelector(".export-section");

            if (playbackToggle.checked) {
                // ── Playback Mode ──────────────────────────────────────
                // Resets playback state with the new simulation result and
                // renders the initial frame at t=0. Results and stats are
                // hidden until playback finishes to preserve the animation flow.
                clearInterval(playbackState.interval);
                playbackState = {
                    active: true,
                    t: 0,
                    gantt: result.gantt,
                    processes: result.processes,
                    totalTime: result.totalTime,
                    interval: null
                };
                
                playbackControls.style.display = "flex";
                systemState.style.display      = "block";
                resultsCard.style.display      = "none";
                statsRow.style.display         = "none";
                exportSec.style.display        = "none";
                
                autoPlayBtn.innerHTML = "Auto-Play ▶";
                renderPlaybackStep(result.gantt, result.processes, 0, result.totalTime);
            } else {
                // ── Instant Mode ───────────────────────────────────────
                // Renders the complete Gantt chart and metrics table
                // immediately without any step-by-step animation.
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
    });


    // ── Playback Step Function ────────────────────────────────────────
    // Advances the playback by one clock tick and re-renders the frame.
    // Called by both the Step button and the auto-play interval timer.
    // When the final tick is reached, the auto-play timer is cleared,
    // and the full results table and stats are revealed.
    function stepPlayback() {
        if (playbackState.t < playbackState.totalTime) {
            playbackState.t++;
            renderPlaybackStep(playbackState.gantt, playbackState.processes, playbackState.t, playbackState.totalTime);
        }
        
        // Check if playback has reached the end of the simulation timeline
        if (playbackState.t >= playbackState.totalTime) {
            clearInterval(playbackState.interval);
            playbackState.interval = null;
            autoPlayBtn.innerHTML = "Auto-Play ▶";
            
            // Reveal the final results and statistics once playback is complete
            document.getElementById("results-table").closest(".out-card").style.display = "block";
            document.querySelector(".stats-row").style.display  = "grid";
            document.querySelector(".export-section").style.display = "flex";
            renderTable(playbackState.processes); 
            showToast("Playback finished!", "success");
        }
    }

    // ── Step Button ───────────────────────────────────────────────────
    // Manually advances the playback by exactly one clock tick each click.
    stepBtn.addEventListener("click", stepPlayback);

    // ── Auto-Play Button ──────────────────────────────────────────────
    // Toggles automatic playback. When active, stepPlayback() is called
    // every 700ms via setInterval. Clicking again pauses the animation
    // by clearing the interval. Does nothing if playback is already done.
    autoPlayBtn.addEventListener("click", () => {
        if (playbackState.t >= playbackState.totalTime) return;
        
        if (playbackState.interval) {
            // Pause: stop the auto-play timer
            clearInterval(playbackState.interval);
            playbackState.interval = null;
            autoPlayBtn.innerHTML = "Auto-Play ▶";
        } else {
            // Play: start advancing one tick every 700 milliseconds
            autoPlayBtn.innerHTML = "Pause ⏸";
            playbackState.interval = setInterval(stepPlayback, 700);
        }
    });


    // ── Comparison Logic ──────────────────────────────────────────────
    // Runs all seven scheduling algorithms on the same process input and
    // displays their average Waiting Time and Turnaround Time side by side.
    // Each algorithm receives an independent deep clone of the process list
    // to prevent one algorithm's mutations from affecting another's run.
    // The row with the best (lowest) values is visually highlighted.
    compareBtn.addEventListener("click", () => {
        const baseProcesses = readProcessesFromTable();
        const quantum = parseInt(quantumInput.value) || 2; // Default quantum of 2 if unset

        if (!validateProcesses(baseProcesses)) return;

        // Run all algorithms on separate clones of the base process list
        const results = [
            { name: "FCFS",                                data: runFCFS(cloneProcesses(baseProcesses)) },
            { name: "SJF (Non-Preemptive)",                data: runSJF_NP(cloneProcesses(baseProcesses)) },
            { name: "SRT (Preemptive)",                    data: runSRT(cloneProcesses(baseProcesses)) },
            { name: `Round Robin (Q=${quantum})`,          data: runRR(cloneProcesses(baseProcesses), quantum) },
            { name: "Priority (Non-Preemptive)",           data: runPriority_NP(cloneProcesses(baseProcesses)) },
            { name: "Priority (Preemptive)",               data: runPriority_P(cloneProcesses(baseProcesses)) },
            { name: `Priority Round Robin (Q=${quantum})`, data: runPriority_RR(cloneProcesses(baseProcesses), quantum) }
        ];

        // Compute average Waiting Time and average Turnaround Time for each algorithm
        const computed = results.map(res => {
            let tWt = 0, tTat = 0;
            const n = res.data.processes.length;
            res.data.processes.forEach(p => { tWt += p.wt; tTat += p.tat; });
            return { name: res.name, avgWt: tWt / n, avgTat: tTat / n };
        });

        // Find the best (minimum) average values across all algorithms for highlighting
        const bestWt  = Math.min(...computed.map(r => r.avgWt));
        const bestTat = Math.min(...computed.map(r => r.avgTat));

        // Build the comparison table rows dynamically
        const tbody = document.getElementById("comparison-body");
        tbody.innerHTML = ""; // Clear any previous comparison results

        computed.forEach(res => {
            const tr = document.createElement("tr");

            // Apply CSS class to cells that hold the best (lowest) metric value
            const wtC  = res.avgWt  === bestWt  ? "best-val" : "";
            const tatC = res.avgTat === bestTat ? "best-val" : "";

            // Highlight the entire row if it has the best values for both metrics
            if (wtC && tatC) tr.classList.add("best-row");

            tr.innerHTML = `
                <td><strong>${res.name}</strong></td>
                <td class="${wtC}">${res.avgWt.toFixed(2)}</td>
                <td class="${tatC}">${res.avgTat.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });

        // Display the comparison modal overlay
        const modal = document.getElementById("comparison-modal");
        modal.classList.add("active");
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