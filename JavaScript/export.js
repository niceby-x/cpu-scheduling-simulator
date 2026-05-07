// =====================================================================
// export.js — EXCEL EXPORT LOGIC
//
// This module handles the generation and download of a formatted
// multi-sheet Excel (.xlsx) report from the most recent simulation
// result. It is called by main.js when the user clicks the Export button.
//
// The generated workbook contains two worksheets:
//   1. Simulation Data  — A formatted table of per-process metrics
//                         (AT, BT, Priority, CT, WT, TAT) with average
//                         summary rows for WT and TAT.
//   2. Gantt Timeline   — A cell-by-cell visual recreation of the Gantt
//                         chart where each column represents one time unit,
//                         colored to match the process that ran during it.
//
// Dependencies:
//   - ExcelJS (loaded globally via CDN as window.ExcelJS)
//   - ui.js   (showToast — for user feedback on success or failure)
//
// Parameters received (simulationData):
//   - algoName : Display name of the algorithm used (e.g., "Round Robin")
//   - result   : The simulation result object containing:
//       - gantt      : Array of execution blocks { id, start, end, color }
//       - processes  : Array of process objects with computed ct, wt, tat
//       - totalTime  : Total simulation duration in time units
// =====================================================================

import { showToast } from './ui.js';


// ─────────────────────────────────────────────────────────────────────
// generateExcelReport(simulationData)
//
// Builds a styled two-sheet Excel workbook from the given simulation
// data and triggers an automatic file download in the browser.
//
// The function is async because ExcelJS's workbook.xlsx.writeBuffer()
// is a Promise-based operation that must be awaited before the file
// blob can be constructed and downloaded.
//
// Guard conditions (returns early with an error toast if):
//   - simulationData is null (no simulation has been run yet)
//   - window.ExcelJS is undefined (the CDN library has not loaded yet)
// ─────────────────────────────────────────────────────────────────────
export async function generateExcelReport(simulationData) {

    // Abort if no simulation has been run — there is nothing to export
    if (!simulationData) {
        showToast("Please run a simulation first.", "error");
        return;
    }

    // Abort if the ExcelJS library has not finished loading from CDN
    if (typeof window.ExcelJS === "undefined") {
        showToast("ExcelJS library is loading, please try again in a second.", "error");
        return;
    }

    const { algoName, result } = simulationData;

    // Create a new ExcelJS workbook to hold both output sheets
    const workbook = new window.ExcelJS.Workbook();
    
    // Add two worksheets with gridlines hidden for a cleaner document appearance
    const dataSheet  = workbook.addWorksheet('Simulation Data', { views: [{ showGridLines: false }] });
    const ganttSheet = workbook.addWorksheet('Gantt Timeline',  { views: [{ showGridLines: false }] });

    // ── Color Palette ─────────────────────────────────────────────────
    // ARGB hex values used for cell fills and font colors throughout
    // both sheets. The 'FF' prefix indicates full opacity in ARGB format.
    const palette = {
        lavender: 'FFC4B5FD', // Header row background (purple tint)
        mint:     'FFBBF7D0', // Averages row background (green tint)
        textMain: 'FF1E1433', // Primary dark text color
        textSub:  'FF5A4F82', // Secondary muted text color
        border:   'FFE2E8F0'  // Subtle cell border color
    };

    // Converts a CSS hex color (e.g., "#ef4444") to ExcelJS ARGB format ("FFEF4444")
    const hexToArgb = (hex) => 'FF' + hex.replace('#', '').toUpperCase();


    // =====================================================================
    // SHEET 1: SIMULATION DATA
    // Displays a structured report with a title block, simulation metadata,
    // a formatted per-process metrics table, and an averages summary row.
    // =====================================================================

    // ── Title Row ─────────────────────────────────────────────────────
    dataSheet.getRow(1).height = 30;
    const titleCell = dataSheet.getCell('B1');
    titleCell.value = "CPU Scheduling Simulation Report";
    titleCell.font  = { name: 'Segoe UI', size: 16, bold: true, color: { argb: palette.textMain } };
    
    // ── Metadata Block (rows 3–5) ─────────────────────────────────────
    // Shows the algorithm name, total simulation time, and export date
    // as labeled key-value pairs above the main data table.
    dataSheet.getCell('B3').value = "Algorithm:";
    dataSheet.getCell('C3').value = algoName;
    dataSheet.getCell('C3').font  = { bold: true };
    
    dataSheet.getCell('B4').value = "Total Time:";
    dataSheet.getCell('C4').value = `${result.totalTime} ms`;
    
    dataSheet.getCell('B5').value = "Export Date:";
    dataSheet.getCell('C5').value = new Date().toLocaleDateString();

    // Apply muted label styling to the left-column metadata keys
    ['B3', 'B4', 'B5'].forEach(cell => {
        dataSheet.getCell(cell).font = { name: 'Segoe UI', color: { argb: palette.textSub } };
    });

    // ── Table Header Row (row 8) ──────────────────────────────────────
    // Renders the column headers for the per-process metrics table with
    // a lavender background, centered alignment, and a medium bottom border.
    let currentRow = 8;
    const headers  = ["Process", "Arrival Time", "Burst Time", "Priority", "Completion Time", "Waiting Time", "Turnaround Time"];
    
    dataSheet.getRow(currentRow).height = 25;
    headers.forEach((h, i) => {
        const cell = dataSheet.getCell(currentRow, i + 2); // Start at column B (index 2)
        cell.value     = h;
        cell.font      = { name: 'Segoe UI', bold: true, color: { argb: palette.textMain } };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.lavender } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border    = { bottom: { style: 'medium', color: { argb: palette.border } } };
    });
    currentRow++;

    // ── Per-Process Data Rows ─────────────────────────────────────────
    // Sorts processes by their numeric ID (P1, P2, P3...) before writing
    // so the table always appears in sequential process order.
    // The Priority column shows "-" for non-priority algorithms where
    // all priorities are 0, to avoid displaying meaningless zeroes.
    const sortedProcesses = [...result.processes].sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));

    sortedProcesses.forEach((p) => {
        dataSheet.getRow(currentRow).height = 20;

        // Show priority value only if the algorithm is priority-based or priority > 0
        const prio    = (algoName.includes("Priority") || p.priority > 0) ? p.priority : "-";
        const rowData = [p.id, p.at, p.bt, prio, p.ct, p.wt, p.tat];
        
        rowData.forEach((val, i) => {
            const cell     = dataSheet.getCell(currentRow, i + 2);
            cell.value     = val;
            cell.font      = { name: 'Segoe UI', color: { argb: palette.textMain } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border    = { bottom: { style: 'thin', color: { argb: palette.border } } };
        });
        currentRow++;
    });

    // ── Averages Summary Row ──────────────────────────────────────────
    // Spans columns B–F with an "Averages" label, then places the
    // Average WT and Average TAT values in the final two columns.
    // Values are read from the DOM to ensure the Excel exactly matches
    // what is displayed in the UI's stat cards.
    dataSheet.getRow(currentRow).height = 25;
    dataSheet.mergeCells(`B${currentRow}:F${currentRow}`);
    
    const avgLabelCell     = dataSheet.getCell(`B${currentRow}`);
    avgLabelCell.value     = "Averages";
    avgLabelCell.font      = { name: 'Segoe UI', bold: true, color: { argb: palette.textMain } };
    avgLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };
    avgLabelCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.mint } };

    // Read average values directly from the UI stat elements
    const avgWtCell  = dataSheet.getCell(currentRow, 7);
    avgWtCell.value  = parseFloat(document.getElementById("avg-wt").textContent);
    
    const avgTatCell = dataSheet.getCell(currentRow, 8);
    avgTatCell.value = parseFloat(document.getElementById("avg-tat").textContent);

    // Apply mint fill and bold styling to both average value cells
    [7, 8].forEach(col => {
        const cell     = dataSheet.getCell(currentRow, col);
        cell.font      = { name: 'Segoe UI', bold: true, color: { argb: palette.textMain } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.mint } };
    });

    // ── Column Widths (Sheet 1) ───────────────────────────────────────
    // Manually set widths to ensure each column comfortably fits its
    // content. Column 1 (A) is a narrow left margin spacer.
    dataSheet.getColumn(1).width = 4;   // A — left margin spacer
    dataSheet.getColumn(2).width = 14;  // B — Process ID
    dataSheet.getColumn(3).width = 14;  // C — Arrival Time
    dataSheet.getColumn(4).width = 14;  // D — Burst Time
    dataSheet.getColumn(5).width = 14;  // E — Priority
    dataSheet.getColumn(6).width = 16;  // F — Completion Time
    dataSheet.getColumn(7).width = 16;  // G — Waiting Time
    dataSheet.getColumn(8).width = 18;  // H — Turnaround Time


    // =====================================================================
    // SHEET 2: GANTT CHART TIMELINE
    // Recreates the Gantt chart as a grid of colored cells where each
    // column represents exactly one time unit of the simulation. Process
    // cells are filled with the process's color; idle cells are light grey.
    // A row of time markers below the chart labels each column boundary.
    // =====================================================================

    // ── Sheet Title ───────────────────────────────────────────────────
    ganttSheet.getRow(1).height = 30;
    const ganttTitle = ganttSheet.getCell('B1');
    ganttTitle.value = `${algoName} - Execution Timeline`;
    ganttTitle.font  = { name: 'Segoe UI', size: 16, bold: true, color: { argb: palette.textMain } };
    
    // Subtitle explaining the time unit scale used in the grid
    ganttSheet.getCell('B2').value = "Each cell represents 1 unit of time.";
    ganttSheet.getCell('B2').font  = { name: 'Segoe UI', size: 10, italic: true, color: { argb: palette.textSub } };

    // ── Gantt Grid Construction ───────────────────────────────────────
    // gRow     — the row index where the colored Gantt blocks are drawn
    // startCol — the current column index being written (advances per time unit)
    // currentTimeline — tracks the running clock value for the time marker row
    let gRow            = 5;
    let startCol        = 2;  // Start at column B
    let currentTimeline = 0;

    // Write the initial "0" time marker at the leftmost position
    ganttSheet.getCell(gRow + 1, startCol).value = 0;
    ganttSheet.getCell(gRow + 1, startCol).font  = { name: 'Segoe UI', size: 9, color: { argb: palette.textSub } };

    // Iterate over each Gantt block and fill one cell per time unit
    result.gantt.forEach((block) => {
        const duration   = block.end - block.start;

        // Determine cell fill color: process color for active blocks, light grey for Idle
        const blockColor = block.id === 'Idle' ? 'FFF1F5F9' : hexToArgb(block.color);

        // Determine font color: white text on colored process cells, muted on idle cells
        const fontColor  = block.id === 'Idle' ? palette.textSub : 'FFFFFFFF';

        // Fill one column per time unit for the full duration of this block
        for (let i = 0; i < duration; i++) {
            const cell     = ganttSheet.getCell(gRow, startCol);
            cell.value     = block.id === 'Idle' ? '' : block.id; // No label on idle cells
            cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: blockColor } };
            cell.font      = { name: 'Segoe UI', bold: true, color: { argb: fontColor } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border    = {
                // White internal borders visually separate individual time unit cells
                left:  { style: 'thin', color: { argb: 'FFFFFFFF' } },
                right: { style: 'thin', color: { argb: 'FFFFFFFF' } }
            };
            
            startCol++;        // Advance to the next column
            currentTimeline++; // Increment the running clock counter
            
            // Write the time marker at the right edge of each time unit cell
            const timeCell     = ganttSheet.getCell(gRow + 1, startCol);
            timeCell.value     = currentTimeline;
            timeCell.font      = { name: 'Segoe UI', size: 9, color: { argb: palette.textSub } };
            timeCell.alignment = { horizontal: 'left' };
        }
    });

    // ── Column Widths (Sheet 2) ───────────────────────────────────────
    // Column 1 (A) is a narrow spacer. All Gantt timeline columns are
    // set to a narrow fixed width so the cell grid looks like a chart.
    ganttSheet.getColumn(1).width = 4; // A — left margin spacer
    for (let c = 2; c <= startCol; c++) {
        ganttSheet.getColumn(c).width = 4.5; // Narrow uniform width per time unit
    }


    // =====================================================================
    // DOWNLOAD LOGIC
    // Serializes the completed workbook to a binary buffer, wraps it in
    // a Blob, creates a temporary object URL, and programmatically clicks
    // a hidden <a> element to trigger the browser's file download dialog.
    // The object URL is revoked immediately after the click to free memory.
    // =====================================================================

    // Serialize the workbook to an ArrayBuffer using ExcelJS's async writer
    const buffer = await workbook.xlsx.writeBuffer();

    // Wrap the buffer in a Blob with the correct MIME type for .xlsx files
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Create a temporary object URL pointing to the Blob in memory
    const url = URL.createObjectURL(blob);

    // Build a hidden <a> element, set its download filename, and click it
    const a      = document.createElement('a');
    a.href       = url;
    a.download   = `CPU_Scheduling_${algoName.replace(/\s+/g, '_')}.xlsx`; // e.g., CPU_Scheduling_Round_Robin.xlsx
    document.body.appendChild(a);
    a.click();

    // Clean up: remove the element and release the object URL from memory
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast("Multi-sheet Report generated!", "success");
}