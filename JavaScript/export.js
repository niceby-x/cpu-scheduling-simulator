// =====================================================================
// JavaScript/export.js
// EXCEL EXPORT LOGIC
// =====================================================================

import { showToast } from './ui.js';

export async function generateExcelReport(simulationData) {
    if (!simulationData) {
        showToast("Please run a simulation first.", "error");
        return;
    }

    if (typeof window.ExcelJS === "undefined") {
        showToast("ExcelJS library is loading, please try again in a second.", "error");
        return;
    }

    const { algoName, result } = simulationData;
    const workbook = new window.ExcelJS.Workbook();
    
    // Create two separate sheets without gridlines
    const dataSheet = workbook.addWorksheet('Simulation Data', { views: [{ showGridLines: false }] });
    const ganttSheet = workbook.addWorksheet('Gantt Timeline', { views: [{ showGridLines: false }] });

    // Soft pastel palette
    const palette = {
        lavender: 'FFC4B5FD',
        mint: 'FFBBF7D0',
        textMain: 'FF1E1433',
        textSub: 'FF5A4F82',
        border: 'FFE2E8F0'
    };

    const hexToArgb = (hex) => 'FF' + hex.replace('#', '').toUpperCase();

    // ==========================================
    // SHEET 1: SIMULATION DATA
    // ==========================================

    dataSheet.getRow(1).height = 30;
    const titleCell = dataSheet.getCell('B1');
    titleCell.value = "CPU Scheduling Simulation Report";
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: palette.textMain } };
    
    dataSheet.getCell('B3').value = "Algorithm:";
    dataSheet.getCell('C3').value = algoName;
    dataSheet.getCell('C3').font = { bold: true };
    
    dataSheet.getCell('B4').value = "Total Time:";
    dataSheet.getCell('C4').value = `${result.totalTime} ms`;
    
    dataSheet.getCell('B5').value = "Export Date:";
    dataSheet.getCell('C5').value = new Date().toLocaleDateString();

    ['B3', 'B4', 'B5'].forEach(cell => {
        dataSheet.getCell(cell).font = { name: 'Segoe UI', color: { argb: palette.textSub } };
    });

    let currentRow = 8;
    const headers = ["Process", "Arrival Time", "Burst Time", "Priority", "Completion Time", "Waiting Time", "Turnaround Time"];
    
    dataSheet.getRow(currentRow).height = 25;
    headers.forEach((h, i) => {
        const cell = dataSheet.getCell(currentRow, i + 2); 
        cell.value = h;
        cell.font = { name: 'Segoe UI', bold: true, color: { argb: palette.textMain } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.lavender } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'medium', color: { argb: palette.border } } };
    });
    currentRow++;

    const sortedProcesses = [...result.processes].sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));

    sortedProcesses.forEach((p) => {
        dataSheet.getRow(currentRow).height = 20;
        const prio = (algoName.includes("Priority") || p.priority > 0) ? p.priority : "-";
        const rowData = [p.id, p.at, p.bt, prio, p.ct, p.wt, p.tat];
        
        rowData.forEach((val, i) => {
            const cell = dataSheet.getCell(currentRow, i + 2);
            cell.value = val;
            cell.font = { name: 'Segoe UI', color: { argb: palette.textMain } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { bottom: { style: 'thin', color: { argb: palette.border } } };
        });
        currentRow++;
    });

    dataSheet.getRow(currentRow).height = 25;
    dataSheet.mergeCells(`B${currentRow}:F${currentRow}`);
    
    const avgLabelCell = dataSheet.getCell(`B${currentRow}`);
    avgLabelCell.value = "Averages";
    avgLabelCell.font = { name: 'Segoe UI', bold: true, color: { argb: palette.textMain } };
    avgLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };
    avgLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.mint } };

    // Reading from the DOM here ensures the Excel matches the UI exactly
    const avgWtCell = dataSheet.getCell(currentRow, 7); 
    avgWtCell.value = parseFloat(document.getElementById("avg-wt").textContent);
    
    const avgTatCell = dataSheet.getCell(currentRow, 8); 
    avgTatCell.value = parseFloat(document.getElementById("avg-tat").textContent);

    [7, 8].forEach(col => {
        const cell = dataSheet.getCell(currentRow, col);
        cell.font = { name: 'Segoe UI', bold: true, color: { argb: palette.textMain } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.mint } };
    });

    dataSheet.getColumn(1).width = 4;  
    dataSheet.getColumn(2).width = 14; 
    dataSheet.getColumn(3).width = 14; 
    dataSheet.getColumn(4).width = 14; 
    dataSheet.getColumn(5).width = 14; 
    dataSheet.getColumn(6).width = 16; 
    dataSheet.getColumn(7).width = 16; 
    dataSheet.getColumn(8).width = 18; 

    // ==========================================
    // SHEET 2: GANTT CHART
    // ==========================================

    ganttSheet.getRow(1).height = 30;
    const ganttTitle = ganttSheet.getCell('B1');
    ganttTitle.value = `${algoName} - Execution Timeline`;
    ganttTitle.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: palette.textMain } };
    
    ganttSheet.getCell('B2').value = "Each cell represents 1 unit of time.";
    ganttSheet.getCell('B2').font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: palette.textSub } };

    let gRow = 5;
    let startCol = 2; 
    let currentTimeline = 0;

    ganttSheet.getCell(gRow + 1, startCol).value = 0;
    ganttSheet.getCell(gRow + 1, startCol).font = { name: 'Segoe UI', size: 9, color: { argb: palette.textSub } };

    result.gantt.forEach((block) => {
        const duration = block.end - block.start;
        const blockColor = block.id === 'Idle' ? 'FFF1F5F9' : hexToArgb(block.color);
        const fontColor = block.id === 'Idle' ? palette.textSub : 'FFFFFFFF'; 

        for (let i = 0; i < duration; i++) {
            const cell = ganttSheet.getCell(gRow, startCol);
            cell.value = block.id === 'Idle' ? '' : block.id;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blockColor } };
            cell.font = { name: 'Segoe UI', bold: true, color: { argb: fontColor } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { 
                left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
                right: { style: 'thin', color: { argb: 'FFFFFFFF' } }
            };
            
            startCol++;
            currentTimeline++;
            
            const timeCell = ganttSheet.getCell(gRow + 1, startCol);
            timeCell.value = currentTimeline;
            timeCell.font = { name: 'Segoe UI', size: 9, color: { argb: palette.textSub } };
            timeCell.alignment = { horizontal: 'left' };
        }
    });

    ganttSheet.getColumn(1).width = 4;
    for (let c = 2; c <= startCol; c++) {
        ganttSheet.getColumn(c).width = 4.5; 
    }

    // ==========================================
    // DOWNLOAD LOGIC
    // ==========================================

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CPU_Scheduling_${algoName.replace(/\s+/g, '_')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast("Multi-sheet Report generated!", "success");
}