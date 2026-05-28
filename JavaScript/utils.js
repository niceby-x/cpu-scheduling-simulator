// =====================================================================
// utils.js — SHARED UTILITY HELPERS
//
// This module contains pure utility functions that are needed by more
// than one file in the project. Centralising them here avoids duplication
// and gives future shared helpers a clean, obvious home.
//
// Both ui.js and worker.js import from this module, which is why none of
// these helpers can live in either of those two files — the worker cannot
// import from ui.js (different execution context), and duplicating the
// same one-liner across both files creates a maintenance hazard.
//
// Exports:
//   cloneProcesses
// =====================================================================


// ─────────────────────────────────────────────────────────────────────
// cloneProcesses(processes)
//
// Returns a shallow copy of each process object in the array using the
// spread operator. Used by the comparison feature to give each algorithm
// its own independent copy of the process list, preventing one algorithm's
// mutations (e.g., remTime changes) from corrupting the input data for
// the algorithms that run after it.
//
// A shallow copy is sufficient here because all process properties
// (id, at, bt, priority, remTime, etc.) are primitive values — there
// are no nested objects or arrays that would require a deep clone.
// ─────────────────────────────────────────────────────────────────────
export function cloneProcesses(processes) {
    return processes.map(p => ({ ...p }));
}