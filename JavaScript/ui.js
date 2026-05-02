// =====================================================================
// JavaScript/ui.js
// UI RENDERING AND DOM MANIPULATION
// =====================================================================

const colors = [
    "#ef4444", "#3b82f6", "#10b981", "#f59e0b",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
    "#06b6d4", "#84cc16"
];

export const algoDescriptions = {
    "FCFS":        "Executes processes in the exact order they arrive. Simple, but can cause long wait times for small jobs behind large ones (Convoy Effect).",
    "SJF":         "Non-preemptive. Selects the waiting process with the smallest execution time. Optimal for minimizing average wait time, but cannot interrupt a running job.",
    "SRT":         "Preemptive version of SJF. If a new process arrives with a shorter remaining time than the current job, the CPU swaps immediately.",
    "RR":          "Preemptive. Each process gets a fixed time slot (quantum). If it doesn't finish, it goes back to the end of the queue. Highly responsive and fair.",
    "PRIORITY_NP": "Non-preemptive. Runs the process with the highest priority (lowest number). Once started, it runs to completion regardless of new arrivals.",
    "PRIORITY_P":  "Preemptive Priority. A higher-priority arrival immediately preempts the currently running lower-priority process.",
    "PRIORITY_RR": "Combination of priority and round-robin. Processes compete by priority first; ties within a priority level are broken by round-robin."
};

let animationTimeouts = [];

// ── Toast Notification ─────────────────────────────────────────
export function showToast(message, type = "error") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const successIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const errorIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    toast.innerHTML = `
        <div class="toast-icon">${type === 'success' ? successIcon : errorIcon}</div>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add("show");
        });
    });

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 500); 
    }, 3000);
}

// ── Table Management ───────────────────────────────────────────────────
export function updateCountBadge() {
    const n = document.querySelectorAll("#process-body tr").length;
    const badge = document.getElementById("process-count-badge");
    if (badge) badge.textContent = `${n} process${n !== 1 ? "es" : ""} loaded`;
}

export function updateProcessIDs() {
    const rows = document.querySelectorAll("#process-body tr");
    rows.forEach((row, index) => {
        const idInput = row.querySelector(".p-id");
        if (idInput) idInput.value = `P${index + 1}`;
        const dot = row.querySelector(".color-dot");
        if (dot) dot.style.background = colors[index % colors.length];
    });
    updateCountBadge();
}

export function readProcessesFromTable() {
    const rows = document.querySelectorAll("#process-body tr");
    return Array.from(rows).map((row, index) => ({
        id:            row.querySelector(".p-id").value,
        at:            parseInt(row.querySelector(".p-at").value),
        bt:            parseInt(row.querySelector(".p-bt").value),
        priority:      parseInt(row.querySelector(".p-priority").value),
        color:         colors[index % colors.length],
        remTime:       parseInt(row.querySelector(".p-bt").value),
        originalIndex: index,
        firstStart:    -1,
        ct: 0, tat: 0, wt: 0, respTime: 0
    }));
}

export function cloneProcesses(processes) { 
    return processes.map(p => ({ ...p })); 
}

export function validateProcesses(processes) {
    for (let p of processes) {
        if (isNaN(p.at) || p.at < 0 || isNaN(p.bt) || p.bt <= 0 || isNaN(p.priority)) {
            showToast(`Invalid input for ${p.id}. Arrival ≥ 0 and Burst > 0 required.`, "error");
            return false;
        }
    }
    return true;
}

// Helper to restrict inputs in real-time
export function enforceStrictInput(inputElement, minValue, maxValue = 9999) {
    // 1. Block invalid keys instantly
    inputElement.addEventListener('keydown', (e) => {
        if (['e', 'E', '-', '+', '.'].includes(e.key)) {
            e.preventDefault();
        }
    });
    
    // 2. Correct the value if they clear it, go too low, or go too high
    inputElement.addEventListener('change', () => {
        let val = parseInt(inputElement.value);
        
        if (isNaN(val) || val < minValue) {
            inputElement.value = minValue;
            showToast(`Value auto-corrected to minimum (${minValue}).`, "error");
        } else if (val > maxValue) {
            inputElement.value = maxValue;
            showToast(`Value capped at maximum limit (${maxValue}).`, "error");
        }
    });
}

export function addProcessRow(at = 0, bt = 1, priority = 1) {
    const processBody = document.getElementById("process-body");
    const currentRows = document.querySelectorAll("#process-body tr").length;
    
    if (currentRows >= 10) {
        showToast("Maximum of 10 processes allowed.", "error");
        return;
    }
    const idx = currentRows;
    const color = colors[idx % colors.length];

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

    tr.querySelectorAll('input[type="number"]').forEach(inp =>
        inp.addEventListener('focus', function () { this.select(); })
    );

    enforceStrictInput(tr.querySelector('.p-at'), 0, 999);
    enforceStrictInput(tr.querySelector('.p-bt'), 1, 999);
    enforceStrictInput(tr.querySelector('.p-priority'), 0, 99);

    tr.querySelector(".delete-btn").addEventListener("click", () => {
        if (document.querySelectorAll("#process-body tr").length > 3) {
            tr.remove();
            updateProcessIDs();
            showToast("Process removed.", "success");
        } else {
            showToast("You need at least 3 processes.", "error");
        }
    });

    processBody.appendChild(tr);
    updateProcessIDs();
}

export function loadDefaultProcesses() {
    const processBody = document.getElementById("process-body");
    processBody.innerHTML = "";
    addProcessRow(0, 2, 0);
    addProcessRow(0, 1, 0);
    addProcessRow(0, 8, 0);
    addProcessRow(0, 4, 0);
    addProcessRow(0, 5, 0);
}

// ── Rendering & Animations ─────────────────────────────────────────────
function animateStat(id, targetValue) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseFloat(el.textContent) || 0;
    const end   = parseFloat(targetValue);
    const dur   = 700; 
    const t0    = performance.now();
    function step(now) {
        const p = Math.min((now - t0) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        el.textContent = (start + (end - start) * ease).toFixed(2);
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

export function renderGanttChart(gantt, totalTime) {
    if (totalTime === 0) return;
    const container = document.getElementById("gantt-chart");
    const timeline  = document.getElementById("gantt-timeline");
    container.innerHTML = ""; timeline.innerHTML = "";
    animationTimeouts.forEach(clearTimeout); animationTimeouts = [];

    let opt = [];
    gantt.forEach(b => {
        if (opt.length && opt[opt.length - 1].id === b.id) opt[opt.length - 1].end = b.end;
        else opt.push({ ...b });
    });

    opt.forEach((block, i) => {
        const duration = block.end - block.start;
        
        // 1. Build the colored Gantt Block
        const div = document.createElement("div");
        div.className = `gantt-block ${block.id === 'Idle' ? 'idle' : ''}`;
        div.style.backgroundColor = block.color;
        div.textContent = block.id === 'Idle' ? '' : block.id;
        
        // Start squished for the animation
        div.style.flexGrow = '0';
        div.style.flexBasis = '0px';
        div.style.minWidth = '0px';
        div.style.padding = '0';
        container.appendChild(div);

        // 2. Build the matching Timeline Block
        const tDiv = document.createElement("div");
        tDiv.className = "time-block";
        
        // Start squished for the animation
        tDiv.style.flexGrow = '0';
        tDiv.style.flexBasis = '0px';
        tDiv.style.minWidth = '0px';
        
        let timeHTML = `<span class="time-marker">${block.end}</span>`;
        if (i === 0) {
            timeHTML = `<span class="time-marker start-marker">${block.start}</span>` + timeHTML;
        }
        tDiv.innerHTML = timeHTML;
        timeline.appendChild(tDiv);

        // 3. Animate the Flex-Grow expansion
        const tid = setTimeout(() => { 
            div.style.flexGrow = duration; 
            div.style.minWidth = '40px'; 
            div.style.padding = '0 4px';
            
            tDiv.style.flexGrow = duration; 
            tDiv.style.minWidth = '40px'; 
        }, i * 110);
        animationTimeouts.push(tid);
    });
}

export function renderTable(processes) {
    const tbody = document.getElementById("results-body");
    tbody.innerHTML = "";
    let tWt = 0, tTat = 0;

    const list = [...processes].sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));

    list.forEach(p => {
        tWt += p.wt; tTat += p.tat;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div class="pid-cell">
                    <span class="color-dot" style="background:${p.color};"></span>
                    <strong style="font-family:var(--f-mono); font-size:0.8rem;">${p.id}</strong>
                </div>
            </td>
            <td>${p.wt}</td>
            <td>${p.tat}</td>
        `;
        tbody.appendChild(tr);
    });

    const n = processes.length;
    animateStat("avg-wt",  (tWt  / n).toFixed(2));
    animateStat("avg-tat", (tTat / n).toFixed(2));
}

export function renderPlaybackStep(gantt, processes, t, totalTime) {
    if (totalTime === 0) return;
    const container = document.getElementById("gantt-chart");
    const timeline  = document.getElementById("gantt-timeline");
    container.innerHTML = ""; timeline.innerHTML = "";
    
    // 1. Find blocks that occur before or during current time 't'
    let blocksUpToT = [];
    for (let block of gantt) {
        if (block.start >= t) break; 
        let displayEnd = Math.min(block.end, t);
        blocksUpToT.push({ ...block, end: displayEnd, duration: displayEnd - block.start });
    }

    // 2. Render those specific blocks
    blocksUpToT.forEach((block, i) => {
        const div = document.createElement("div");
        div.className = `gantt-block ${block.id === 'Idle' ? 'idle' : ''}`;
        div.style.backgroundColor = block.color;
        div.textContent = block.id === 'Idle' ? '' : block.id;
        div.style.flexGrow = block.duration;
        div.style.minWidth = '40px';
        div.style.padding = '0 4px';
        // Note: No transition so it instantly snaps during step-by-step
        div.style.transition = 'none'; 
        container.appendChild(div);

        const tDiv = document.createElement("div");
        tDiv.className = "time-block";
        tDiv.style.flexGrow = block.duration;
        tDiv.style.minWidth = '40px';
        tDiv.style.transition = 'none';
        
        let timeHTML = `<span class="time-marker">${block.end}</span>`;
        if (i === 0) timeHTML = `<span class="time-marker start-marker">${block.start}</span>` + timeHTML;
        tDiv.innerHTML = timeHTML;
        timeline.appendChild(tDiv);
    });

    // 3. Add invisible "Future" padding to preserve the Flexbox scale perfectly
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

    // 4. Update the visual System State (CPU vs Ready Queue)
    document.getElementById("current-t").textContent = t;
    const activeBlock = blocksUpToT[blocksUpToT.length - 1];
    const cpuState = document.getElementById("cpu-state");
    
    if (!activeBlock || activeBlock.id === 'Idle') {
        cpuState.textContent = "Idle";
        cpuState.style.background = "var(--input-bg)";
        cpuState.style.color = "var(--text-sub)";
    } else {
        cpuState.textContent = activeBlock.id;
        cpuState.style.background = activeBlock.color;
        cpuState.style.color = "#fff";
    }

    // Calculate how much time each process has executed so far
    let execTimes = {};
    processes.forEach(p => execTimes[p.id] = 0);
    blocksUpToT.forEach(b => { if (b.id !== 'Idle') execTimes[b.id] += b.duration; });

    // Populate Ready Queue
    const readyQueueContainer = document.getElementById("ready-queue");
    readyQueueContainer.innerHTML = "";
    let inQueue = 0;
    
    [...processes].sort((a,b) => a.at - b.at).forEach(p => {
        const isActive = activeBlock && activeBlock.id === p.id;
        // If it arrived, hasn't finished, and isn't on the CPU, it's waiting!
        if (p.at <= t && execTimes[p.id] < p.bt && !isActive) {
            const badge = document.createElement("span");
            badge.className = "algo-pill";
            badge.style.background = `rgba(255,255,255,0.08)`;
            badge.style.border = `1px solid ${p.color}`;
            badge.style.color = p.color;
            badge.textContent = p.id;
            readyQueueContainer.appendChild(badge);
            inQueue++;
        }
    });
    
    if (inQueue === 0) readyQueueContainer.innerHTML = "<span style='color: var(--text-dim); font-size: 0.8rem; padding-top: 4px;'>Queue Empty</span>";
}