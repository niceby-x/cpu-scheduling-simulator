// =====================================================================
// JavaScript/main.js
// CENTRAL ORCHESTRATOR
// =====================================================================

// 1. Import everything we need from our other modules
import { 
    runFCFS, 
    runSJF_NP, 
    runSRT, 
    runRR, 
    runPriority_NP, 
    runPriority_P, 
    runPriority_RR 
} from './algorithms.js';

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

import { generateExcelReport } from './export.js';

// 2. Global state for the current simulation (replaces window.lastSimulationData)
let currentSimulationData = null;

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const addProcessBtn   = document.getElementById("add-process-btn");
    const simulateBtn     = document.getElementById("simulate-btn");
    const compareBtn      = document.getElementById("compare-btn");
    const resetBtn        = document.getElementById("reset-btn");
    const exportBtn       = document.getElementById("export-btn");
    const algorithmSelect = document.getElementById("algorithm");
    const quantumContainer= document.getElementById("quantum-container");
    const quantumInput    = document.getElementById("quantum");

    // Playback State
    let playbackState = { active: false, t: 0, interval: null, gantt: null, processes: null, totalTime: 0 };
    const playbackToggle = document.getElementById("playback-toggle");
    const playbackControls = document.getElementById("playback-controls");
    const systemState = document.getElementById("system-state");
    const stepBtn = document.getElementById("step-btn");
    const autoPlayBtn = document.getElementById("auto-play-btn");

    playbackToggle.addEventListener("change", (e) => {
        simulateBtn.innerHTML = e.target.checked 
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Playback`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Run`;
    });

    // Initialize Default State
    loadDefaultProcesses();
    document.getElementById("algo-description").textContent = algoDescriptions[algorithmSelect.value];

    // Inside main.js DOMContentLoaded block:
    enforceStrictInput(quantumInput, 1, 100);
    
    // ── UI Event Listeners ──────────────────────────────────────────────
    
    // Algorithm selection
    algorithmSelect.addEventListener("change", (e) => {
        const algo = e.target.value;
        document.getElementById("algo-description").textContent = algoDescriptions[algo];
        quantumContainer.style.display = (algo === "RR" || algo === "PRIORITY_RR") ? "flex" : "none";
    });

    // Add Process
    addProcessBtn.addEventListener("click", () => {
        const currentRows = document.querySelectorAll("#process-body tr").length;
        addProcessRow(0, 0, 0);
        if (currentRows < 10) showToast("New process added.", "success");
    });

    // Reset
    resetBtn?.addEventListener("click", () => {
        loadDefaultProcesses();
        document.getElementById("output-section").style.display = "none";
        document.getElementById("comparison-section").style.display = "none";
        currentSimulationData = null;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast("Simulator reset to default.", "success");
    });

    // Export
    exportBtn?.addEventListener("click", () => {
        generateExcelReport(currentSimulationData);
    });

    // ── Core Simulation Logic ───────────────────────────────────────────
    
    simulateBtn.addEventListener("click", () => {
        const processes = readProcessesFromTable();
        if (!validateProcesses(processes)) return;

        const algo = algorithmSelect.value;
        const quantum = parseInt(quantumInput.value);

        if ((algo === "RR" || algo === "PRIORITY_RR") && (isNaN(quantum) || quantum <= 0)) {
            showToast("Time Quantum must be > 0 for Round Robin.", "error");
            return;
        }

        let result;
        
        // Delegate math to algorithms.js
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
            const algoName = algorithmSelect.options[algorithmSelect.selectedIndex].text;
            currentSimulationData = { algoName, result };
            const tag = document.getElementById("algo-tag");
            if (tag) tag.textContent = algoName;

            const out = document.getElementById("output-section");
            out.style.display = "flex";
            
            // Elements to hide during playback
            const resultsCard = document.getElementById("results-table").closest(".out-card");
            const statsRow = document.querySelector(".stats-row");
            const exportSec = document.querySelector(".export-section");

            if (playbackToggle.checked) {
                // Setup Playback Mode
                clearInterval(playbackState.interval);
                playbackState = { active: true, t: 0, gantt: result.gantt, processes: result.processes, totalTime: result.totalTime, interval: null };
                
                playbackControls.style.display = "flex";
                systemState.style.display = "block";
                resultsCard.style.display = "none";
                statsRow.style.display = "none";
                exportSec.style.display = "none";
                
                autoPlayBtn.innerHTML = "Auto-Play ▶";
                renderPlaybackStep(result.gantt, result.processes, 0, result.totalTime);
            } else {
                // Instant Mode
                playbackControls.style.display = "none";
                systemState.style.display = "none";
                resultsCard.style.display = "block";
                statsRow.style.display = "grid";
                exportSec.style.display = "flex";

                renderGanttChart(result.gantt, result.totalTime);
                renderTable(result.processes);
            }
            
            showToast("Simulation generated!", "success");
            out.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });

    // ── Playback Logic ────────────────────────────────────────────────
    function stepPlayback() {
        if (playbackState.t < playbackState.totalTime) {
            playbackState.t++;
            renderPlaybackStep(playbackState.gantt, playbackState.processes, playbackState.t, playbackState.totalTime);
        }
        
        if (playbackState.t >= playbackState.totalTime) {
            clearInterval(playbackState.interval);
            playbackState.interval = null;
            autoPlayBtn.innerHTML = "Auto-Play ▶";
            
            // Un-hide the final stats when finished
            document.getElementById("results-table").closest(".out-card").style.display = "block";
            document.querySelector(".stats-row").style.display = "grid";
            document.querySelector(".export-section").style.display = "flex";
            renderTable(playbackState.processes); 
            showToast("Playback finished!", "success");
        }
    }

    stepBtn.addEventListener("click", stepPlayback);

    autoPlayBtn.addEventListener("click", () => {
        if (playbackState.t >= playbackState.totalTime) return;
        
        if (playbackState.interval) {
            clearInterval(playbackState.interval);
            playbackState.interval = null;
            autoPlayBtn.innerHTML = "Auto-Play ▶";
        } else {
            autoPlayBtn.innerHTML = "Pause ⏸";
            playbackState.interval = setInterval(stepPlayback, 700);
        }
    });

    // ── Comparison Logic ────────────────────────────────────────────────
    
    compareBtn.addEventListener("click", () => {
        const baseProcesses = readProcessesFromTable();
        const quantum = parseInt(quantumInput.value) || 2;

        if (!validateProcesses(baseProcesses)) return;

        // Run all algorithms on cloned data
        const results = [
            { name: "FCFS",                              data: runFCFS(cloneProcesses(baseProcesses)) },
            { name: "SJF (Non-Preemptive)",              data: runSJF_NP(cloneProcesses(baseProcesses)) },
            { name: "SRT (Preemptive)",                  data: runSRT(cloneProcesses(baseProcesses)) },
            { name: `Round Robin (Q=${quantum})`,        data: runRR(cloneProcesses(baseProcesses), quantum) },
            { name: "Priority (Non-Preemptive)",         data: runPriority_NP(cloneProcesses(baseProcesses)) },
            { name: "Priority (Preemptive)",             data: runPriority_P(cloneProcesses(baseProcesses)) },
            { name: `Priority Round Robin (Q=${quantum})`, data: runPriority_RR(cloneProcesses(baseProcesses), quantum) }
        ];

        const computed = results.map(res => {
            let tWt = 0, tTat = 0;
            const n = res.data.processes.length;
            res.data.processes.forEach(p => { tWt += p.wt; tTat += p.tat; });
            return { name: res.name, avgWt: tWt/n, avgTat: tTat/n };
        });

        const bestWt  = Math.min(...computed.map(r => r.avgWt));
        const bestTat = Math.min(...computed.map(r => r.avgTat));

        const tbody = document.getElementById("comparison-body");
        tbody.innerHTML = "";

        // Build comparison table
        computed.forEach(res => {
            const tr = document.createElement("tr");
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

        const modal = document.getElementById("comparison-modal");
        modal.classList.add("active");
    });

    // ── Modal Close Logic ────────────────────────────────────────────────
    const closeModalBtn = document.getElementById("close-modal-btn");
    const comparisonModal = document.getElementById("comparison-modal");

    // Close when clicking the 'X'
    closeModalBtn?.addEventListener("click", () => {
        comparisonModal.classList.remove("active");
    });

    // Close when clicking the blurred background overlay
    comparisonModal?.addEventListener("click", (e) => {
        if (e.target === comparisonModal) {
            comparisonModal.classList.remove("active");
        }
    });
    
    // Optional: Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && comparisonModal.classList.contains("active")) {
            comparisonModal.classList.remove("active");
        }
    });
});