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
    renderTable 
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

    // Initialize Default State
    loadDefaultProcesses();
    document.getElementById("algo-description").textContent = algoDescriptions[algorithmSelect.value];

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
            // Save state for exporting
            const algoName = algorithmSelect.options[algorithmSelect.selectedIndex].text;
            currentSimulationData = { algoName, result };
            
            // Delegate rendering to ui.js
            const tag = document.getElementById("algo-tag");
            if (tag) tag.textContent = algoName;

            const out = document.getElementById("output-section");
            out.style.display = "flex";
            
            renderGanttChart(result.gantt, result.totalTime);
            renderTable(result.processes);
            
            showToast("Simulation complete!", "success");
            out.scrollIntoView({ behavior: "smooth", block: "start" });
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

        const section = document.getElementById("comparison-section");
        section.style.display = "block";
        section.scrollIntoView({ behavior: "smooth" });
    });
});