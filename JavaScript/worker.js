import { 
    runFCFS, runSJF_NP, runSRT, runRR, 
    runPriority_NP, runPriority_P, runPriority_RR 
} from './algorithms.js';
import { cloneProcesses } from './utils.js';

self.onmessage = function(e) {
    const { action, algo, quantum, processes } = e.data;

    if (action === "simulate") {
        let result;
        try {
            switch (algo) {
                case "FCFS":        result = runFCFS(processes); break;
                case "SJF":         result = runSJF_NP(processes); break;
                case "SRT":         result = runSRT(processes); break;
                case "RR":          result = runRR(processes, quantum); break;
                case "PRIORITY_RR": result = runPriority_RR(processes, quantum); break;
                case "PRIORITY_NP": result = runPriority_NP(processes); break;
                case "PRIORITY_P":  result = runPriority_P(processes); break;
                default:
                    throw new Error(`Unknown algorithm key: "${algo}"`);
            }

            // Add a 600ms artificial delay for the single simulation
            setTimeout(() => {
                self.postMessage({ action: "simulate", result });
            }, 600);

        } catch (err) {
            // Post the error back to the main thread so the UI can recover
            // (restore the Run button, hide the spinner, show a toast).
            // Without this, the worker silently dies and the spinner stays forever.
            self.postMessage({ action: "error", source: "simulate", message: err.message });
        }

    } else if (action === "compare") {
        try {
            const results = [
                { name: "FCFS",                                data: runFCFS(cloneProcesses(processes)) },
                { name: "SJF (Non-Preemptive)",                data: runSJF_NP(cloneProcesses(processes)) },
                { name: "SRT (Preemptive)",                    data: runSRT(cloneProcesses(processes)) },
                { name: `Round Robin (Q=${quantum})`,          data: runRR(cloneProcesses(processes), quantum) },
                { name: "Priority (Non-Preemptive)",           data: runPriority_NP(cloneProcesses(processes)) },
                { name: "Priority (Preemptive)",               data: runPriority_P(cloneProcesses(processes)) },
                { name: `Priority Round Robin (Q=${quantum})`, data: runPriority_RR(cloneProcesses(processes), quantum) }
            ];

            // Add a longer 1200ms (1.2 second) delay for the heavier comparison task
            setTimeout(() => {
                self.postMessage({ action: "compare", results });
            }, 1200);

        } catch (err) {
            self.postMessage({ action: "error", source: "compare", message: err.message });
        }
    }
};