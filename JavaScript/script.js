document.addEventListener("DOMContentLoaded", () => {
    const processBody   = document.getElementById("process-body");
    const addProcessBtn = document.getElementById("add-process-btn");
    const simulateBtn   = document.getElementById("simulate-btn");
    const algorithmSelect = document.getElementById("algorithm");
    const quantumContainer = document.getElementById("quantum-container");

    let animationTimeouts = [];

    const colors = [
        "#ef4444", "#3b82f6", "#10b981", "#f59e0b",
        "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
        "#06b6d4", "#84cc16"
    ];

    const algoDescriptions = {
        "FCFS":        "Executes processes in the exact order they arrive. Simple, but can cause long wait times for small jobs behind large ones (Convoy Effect).",
        "SJF":         "Non-preemptive. Selects the waiting process with the smallest execution time. Optimal for minimizing average wait time, but cannot interrupt a running job.",
        "SRT":         "Preemptive version of SJF. If a new process arrives with a shorter remaining time than the current job, the CPU swaps immediately.",
        "RR":          "Preemptive. Each process gets a fixed time slot (quantum). If it doesn't finish, it goes back to the end of the queue. Highly responsive and fair.",
        "PRIORITY_NP": "Non-preemptive. Runs the process with the highest priority (lowest number). Once started, it runs to completion regardless of new arrivals.",
        "PRIORITY_P":  "Preemptive Priority. A higher-priority arrival immediately preempts the currently running lower-priority process.",
        "PRIORITY_RR": "Combination of priority and round-robin. Processes compete by priority first; ties within a priority level are broken by round-robin."
    };

    // ── Toast ──────────────────────────────────────────────────────────────
    function showToast(message, type = "error") {
        const container = document.getElementById("toast-container");
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 420);
        }, 3000);
    }

    // ── Process counter badge ──────────────────────────────────────────────
    function updateCountBadge() {
        const n = document.querySelectorAll("#process-body tr").length;
        const badge = document.getElementById("process-count-badge");
        if (badge) badge.textContent = `${n} process${n !== 1 ? "es" : ""} loaded`;
    }

    // ── PID re-numbering ───────────────────────────────────────────────────
    function updateProcessIDs() {
        const rows = document.querySelectorAll("#process-body tr");
        rows.forEach((row, index) => {
            const idInput = row.querySelector(".p-id");
            if (idInput) idInput.value = `P${index + 1}`;
            // update color dot colour to match process color
            const dot = row.querySelector(".color-dot");
            if (dot) dot.style.background = colors[index % colors.length];
        });
        updateCountBadge();
    }

    // ── Read processes from table ──────────────────────────────────────────
    function readProcessesFromTable() {
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

    // ── Clone processes ────────────────────────────────────────────────────
    function cloneProcesses(processes) { return processes.map(p => ({ ...p })); }

    // ── Validation ─────────────────────────────────────────────────────────
    function validateProcesses(processes) {
        for (let p of processes) {
            if (isNaN(p.at) || p.at < 0 || isNaN(p.bt) || p.bt <= 0 || isNaN(p.priority)) {
                showToast(`Invalid input for ${p.id}. Arrival ≥ 0 and Burst > 0 required.`, "error");
                return false;
            }
        }
        return true;
    }

    // ── Stat counter animation ─────────────────────────────────────────────
    function animateStat(id, targetValue) {
        const el = document.getElementById(id);
        if (!el) return;
        const start = parseFloat(el.textContent) || 0;
        const end   = parseFloat(targetValue);
        const dur   = 700; // ms
        const t0    = performance.now();
        function step(now) {
            const p = Math.min((now - t0) / dur, 1);
            // ease out cubic
            const ease = 1 - Math.pow(1 - p, 3);
            el.textContent = (start + (end - start) * ease).toFixed(2);
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // ── Default processes ──────────────────────────────────────────────────
    function loadDefaultProcesses() {
        processBody.innerHTML = "";
        addProcessRow(0, 2, 0);
        addProcessRow(0, 1, 0);
        addProcessRow(0, 8, 0);
        addProcessRow(0, 4, 0);
        addProcessRow(0, 5, 0);
    }

    loadDefaultProcesses();

    // ── Algorithm select change → show/hide quantum, update description ────
    algorithmSelect.addEventListener("change", (e) => {
        const algo = e.target.value;
        const desc = document.getElementById("algo-description");
        desc.textContent = algoDescriptions[algo];
        quantumContainer.style.display =
            (algo === "RR" || algo === "PRIORITY_RR") ? "flex" : "none";
    });

    // Fire once on load
    document.getElementById("algo-description").textContent = algoDescriptions[algorithmSelect.value];

    // ── Add process button ─────────────────────────────────────────────────
    addProcessBtn.addEventListener("click", () => addProcessRow(0, 1, 1));

    function addProcessRow(at = 0, bt = 1, priority = 1) {
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

        tr.querySelector(".delete-btn").addEventListener("click", () => {
            if (document.querySelectorAll("#process-body tr").length > 3) {
                tr.remove();
                updateProcessIDs();
            } else {
                showToast("You need at least 3 processes.", "error");
            }
        });

        processBody.appendChild(tr);
        updateProcessIDs();
    }

    // ── Simulate ───────────────────────────────────────────────────────────
    simulateBtn.addEventListener("click", () => {
        const processes = readProcessesFromTable();
        if (!validateProcesses(processes)) return;

        const algo    = algorithmSelect.value;
        const quantum = parseInt(document.getElementById("quantum").value);

        if ((algo === "RR" || algo === "PRIORITY_RR") && (isNaN(quantum) || quantum <= 0)) {
            showToast("Time Quantum must be > 0 for Round Robin.", "error");
            return;
        }

        let result;
        switch (algo) {
            case "FCFS":        result = runFCFS(processes);                 break;
            case "SJF":         result = runSJF_NP(processes);               break;
            case "SRT":         result = runSRT(processes);                  break;
            case "RR":          result = runRR(processes, quantum);           break;
            case "PRIORITY_RR": result = runPriority_RR(processes, quantum);  break;
            case "PRIORITY_NP": result = runPriority_NP(processes);          break;
            case "PRIORITY_P":  result = runPriority_P(processes);           break;
            default:
                showToast("Unknown algorithm selected.", "error");
                return;
        }

        if (result) {
            window.lastSimulationData = { algoName: algorithmSelect.options[algorithmSelect.selectedIndex].text, result };
            const tag = document.getElementById("algo-tag");
            if (tag) tag.textContent = algorithmSelect.options[algorithmSelect.selectedIndex].text;

            const out = document.getElementById("output-section");
            out.style.display = "flex";
            renderGanttChart(result.gantt, result.totalTime);
            renderTable(result.processes);
            showToast("Simulation complete! ✅", "success");
            out.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });

    // ── Compare all ────────────────────────────────────────────────────────
    document.getElementById("compare-btn").addEventListener("click", () => {
        const baseProcesses = readProcessesFromTable();
        const quantum = parseInt(document.getElementById("quantum").value) || 2;

        if (!validateProcesses(baseProcesses)) return;

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

    // =====================================================================
    // SCHEDULING ALGORITHMS
    // =====================================================================

    function runFCFS(processes) {
        let time = 0, gantt = [];
        let queue = [...processes].sort((a, b) => a.at - b.at || a.originalIndex - b.originalIndex);
        queue.forEach(p => {
            if (time < p.at) { gantt.push({ id: 'Idle', start: time, end: p.at, color: 'transparent' }); time = p.at; }
            if (p.firstStart === -1) p.firstStart = time;
            gantt.push({ id: p.id, start: time, end: time + p.bt, color: p.color });
            time += p.bt;
            p.ct = time; p.tat = p.ct - p.at; p.wt = p.tat - p.bt; p.respTime = p.firstStart - p.at;
        });
        return { gantt, processes: queue, totalTime: time };
    }

    function runSJF_NP(processes) {
        let time = 0, completed = 0, gantt = [], n = processes.length;
        let done = new Array(n).fill(false);
        while (completed !== n) {
            let avail = processes.filter(p => p.at <= time && !done[p.originalIndex]);
            if (avail.length > 0) {
                avail.sort((a, b) => a.bt - b.bt || a.at - b.at || a.originalIndex - b.originalIndex);
                let cur = avail[0];
                if (cur.firstStart === -1) cur.firstStart = time;
                gantt.push({ id: cur.id, start: time, end: time + cur.bt, color: cur.color });
                time += cur.bt;
                cur.ct = time; cur.tat = cur.ct - cur.at; cur.wt = cur.tat - cur.bt; cur.respTime = cur.firstStart - cur.at;
                done[cur.originalIndex] = true; completed++;
            } else {
                let rem = processes.filter(p => !done[p.originalIndex]);
                if (!rem.length) break;
                let next = Math.min(...rem.map(p => p.at));
                gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' }); time = next;
            }
        }
        return { gantt, processes, totalTime: time };
    }

    function runSRT(processes) {
        let time = 0, completed = 0, gantt = [], n = processes.length, prev = null;
        while (completed !== n) {
            let avail = processes.filter(p => p.at <= time && p.remTime > 0);
            if (avail.length > 0) {
                avail.sort((a, b) => a.remTime - b.remTime || a.at - b.at || a.originalIndex - b.originalIndex);
                let cur = avail[0];
                if (cur.firstStart === -1) cur.firstStart = time;
                if (prev !== cur.id) gantt.push({ id: cur.id, start: time, end: time + 1, color: cur.color });
                else gantt[gantt.length - 1].end = time + 1;
                cur.remTime--; time++; prev = cur.id;
                if (cur.remTime === 0) {
                    completed++; cur.ct = time; cur.tat = cur.ct - cur.at; cur.wt = cur.tat - cur.bt; cur.respTime = cur.firstStart - cur.at;
                }
            } else {
                let rem = processes.filter(p => p.remTime > 0);
                if (!rem.length) break;
                let next = Math.min(...rem.map(p => p.at));
                if (prev !== 'Idle') gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' });
                else gantt[gantt.length - 1].end = next;
                time = next; prev = 'Idle';
            }
        }
        return { gantt, processes, totalTime: time };
    }

    function runRR(processes, quantum) {
        let completed = 0, gantt = [], n = processes.length, queue = [];
        let inQueue = new Array(n).fill(false);
        let sorted = [...processes].sort((a, b) => a.at - b.at || a.originalIndex - b.originalIndex);
        let time = Math.min(...sorted.map(p => p.at));
        if (time > 0) gantt.push({ id: 'Idle', start: 0, end: time, color: 'transparent' });
        sorted.forEach(p => { if (p.at <= time && !inQueue[p.originalIndex]) { queue.push(p); inQueue[p.originalIndex] = true; } });
        while (completed !== n) {
            if (queue.length > 0) {
                let cur = queue.shift();
                if (cur.firstStart === -1) cur.firstStart = time;
                let exec = Math.min(cur.remTime, quantum);
                gantt.push({ id: cur.id, start: time, end: time + exec, color: cur.color });
                time += exec; cur.remTime -= exec;
                sorted.forEach(p => { if (p.at <= time && p.remTime > 0 && !inQueue[p.originalIndex]) { queue.push(p); inQueue[p.originalIndex] = true; } });
                if (cur.remTime > 0) queue.push(cur);
                else { completed++; cur.ct = time; cur.tat = cur.ct - cur.at; cur.wt = cur.tat - cur.bt; cur.respTime = cur.firstStart - cur.at; }
            } else {
                let rem = sorted.filter(p => p.remTime > 0);
                if (!rem.length) break;
                let next = Math.min(...rem.map(p => p.at));
                gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' }); time = next;
                sorted.forEach(p => { if (p.at <= time && p.remTime > 0 && !inQueue[p.originalIndex]) { queue.push(p); inQueue[p.originalIndex] = true; } });
            }
        }
        return { gantt, processes, totalTime: time };
    }

    function runPriority_NP(processes) {
        let time = 0, completed = 0, gantt = [], n = processes.length;
        let done = new Array(n).fill(false);
        while (completed !== n) {
            let avail = processes.filter(p => p.at <= time && !done[p.originalIndex]);
            if (avail.length > 0) {
                avail.sort((a, b) => a.priority - b.priority || a.at - b.at || a.originalIndex - b.originalIndex);
                let cur = avail[0];
                if (cur.firstStart === -1) cur.firstStart = time;
                gantt.push({ id: cur.id, start: time, end: time + cur.bt, color: cur.color });
                time += cur.bt; cur.ct = time; cur.tat = cur.ct - cur.at; cur.wt = cur.tat - cur.bt; cur.respTime = cur.firstStart - cur.at;
                done[cur.originalIndex] = true; completed++;
            } else {
                let rem = processes.filter(p => !done[p.originalIndex]);
                if (!rem.length) break;
                let next = Math.min(...rem.map(p => p.at));
                gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' }); time = next;
            }
        }
        return { gantt, processes, totalTime: time };
    }

    function runPriority_P(processes) {
        let time = 0, completed = 0, gantt = [], n = processes.length, prev = null;
        while (completed !== n) {
            let avail = processes.filter(p => p.at <= time && p.remTime > 0);
            if (avail.length > 0) {
                avail.sort((a, b) => a.priority - b.priority || a.at - b.at || a.originalIndex - b.originalIndex);
                let cur = avail[0];
                if (cur.firstStart === -1) cur.firstStart = time;
                if (prev !== cur.id) gantt.push({ id: cur.id, start: time, end: time + 1, color: cur.color });
                else gantt[gantt.length - 1].end = time + 1;
                cur.remTime--; time++; prev = cur.id;
                if (cur.remTime === 0) { completed++; cur.ct = time; cur.tat = cur.ct - cur.at; cur.wt = cur.tat - cur.bt; cur.respTime = cur.firstStart - cur.at; }
            } else {
                let rem = processes.filter(p => p.remTime > 0);
                if (!rem.length) break;
                let next = Math.min(...rem.map(p => p.at));
                if (prev !== 'Idle') gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' });
                else gantt[gantt.length - 1].end = next;
                time = next; prev = 'Idle';
            }
        }
        return { gantt, processes, totalTime: time };
    }

    function runPriority_RR(processes, quantum) {
        let time = 0, completed = 0, gantt = [], n = processes.length, queue = [];
        let inQueue = new Array(n).fill(false);
        let sorted = [...processes].sort((a, b) => a.at - b.at || a.originalIndex - b.originalIndex);
        time = Math.min(...sorted.map(p => p.at));
        if (time > 0) gantt.push({ id: 'Idle', start: 0, end: time, color: 'transparent' });

        const checkArrivals = t => sorted.forEach(p => {
            if (p.at <= t && p.remTime > 0 && !inQueue[p.originalIndex]) { queue.push(p); inQueue[p.originalIndex] = true; }
        });
        checkArrivals(time);

        while (completed !== n) {
            if (queue.length > 0) {
                let hp = Math.min(...queue.map(p => p.priority));
                let ci = queue.findIndex(p => p.priority === hp);
                let cur = queue.splice(ci, 1)[0];
                if (cur.firstStart === -1) cur.firstStart = time;
                let spent = 0, preempted = false;
                while (spent < quantum && cur.remTime > 0) {
                    cur.remTime--; spent++; time++;
                    let newArr = false;
                    sorted.forEach(p => { if (p.at === time && p.remTime > 0 && !inQueue[p.originalIndex]) { queue.push(p); inQueue[p.originalIndex] = true; newArr = true; } });
                    if (newArr && Math.min(...queue.map(p => p.priority)) < cur.priority) { preempted = true; break; }
                }
                const gs = time - spent;
                if (gantt.length > 0 && gantt[gantt.length - 1].id === cur.id) gantt[gantt.length - 1].end = time;
                else gantt.push({ id: cur.id, start: gs, end: time, color: cur.color });

                if (cur.remTime > 0) queue.push(cur);
                else { completed++; cur.ct = time; cur.tat = cur.ct - cur.at; cur.wt = cur.tat - cur.bt; cur.respTime = cur.firstStart - cur.at; }
            } else {
                let rem = sorted.filter(p => p.remTime > 0);
                if (!rem.length) break;
                let next = Math.min(...rem.map(p => p.at));
                gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' }); time = next;
                checkArrivals(time);
            }
        }
        return { gantt, processes, totalTime: time };
    }

    // =====================================================================
    // RENDER
    // =====================================================================

    function renderGanttChart(gantt, totalTime) {
        if (totalTime === 0) return;
        const container = document.getElementById("gantt-chart");
        const timeline  = document.getElementById("gantt-timeline");
        container.innerHTML = ""; timeline.innerHTML = "";
        animationTimeouts.forEach(clearTimeout); animationTimeouts = [];

        // Merge adjacent same-process blocks
        let opt = [];
        gantt.forEach(b => {
            if (opt.length && opt[opt.length - 1].id === b.id) opt[opt.length - 1].end = b.end;
            else opt.push({ ...b });
        });

        let cumPct = 0;
        opt.forEach((block, i) => {
            const w = ((block.end - block.start) / totalTime) * 100;
            const div = document.createElement("div");
            div.className = `gantt-block ${block.id === 'Idle' ? 'idle' : ''}`;
            div.style.backgroundColor = block.color;
            div.textContent = block.id === 'Idle' ? '' : block.id;
            div.style.width = '0%';
            container.appendChild(div);
            const tid = setTimeout(() => { div.style.width = `${w}%`; }, i * 110);
            animationTimeouts.push(tid);
            if (i === 0) createMarker(block.start, 0);
            cumPct += w;
            createMarker(block.end, cumPct);
        });

        function createMarker(t, pct) {
            const s = document.createElement("span");
            s.className = "time-marker";
            s.style.left = `${pct}%`;
            s.textContent = t;
            timeline.appendChild(s);
        }
    }

    function renderTable(processes) {
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

    // ── Reset ──────────────────────────────────────────────────────────────
    document.getElementById("reset-btn")?.addEventListener("click", () => {
        loadDefaultProcesses();
        document.getElementById("output-section").style.display     = "none";
        document.getElementById("comparison-section").style.display = "none";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ── Export CSV ─────────────────────────────────────────────────────────
    document.getElementById("export-btn")?.addEventListener("click", () => {
        if (!window.lastSimulationData) {
            showToast("Please run a simulation first.", "error");
            return;
        }

        const { algoName, result } = window.lastSimulationData;
        
        // 1. Top Header Rows
        let csv = "Consider the following set of processes with the length of the CPU burst time given in milliseconds:\n";
        csv += `The processes are assumed to have arrived according to the table.,,,,,,1. ${algoName}\n`;
        
        // 2. Table Headers (Matching the image order)
        csv += "Process,Burst Time,Priority,Arrival time,waiting time,Turnaround time\n";

        // 3. Table Data
        // Sort processes by ID to match P1, P2, P3... order
        const sortedProcesses = [...result.processes].sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
        
        sortedProcesses.forEach(p => {
            // Leave priority blank if it's 0 or not a priority algo to match image
            const prio = (algoName.includes("Priority") || p.priority > 0) ? p.priority : "";
            csv += `${p.id},${p.bt},${prio},${p.at},${p.wt},${p.tat}\n`;
        });

        // 4. Averages
        const avgWt = document.getElementById("avg-wt").textContent;
        const avgTat = document.getElementById("avg-tat").textContent;
        csv += `average,,,,${avgWt},${avgTat}\n\n`;

        // 5. CSV Gantt Chart (Spreading 1 unit per column)
        csv += `${algoName},Gantt chart\n`;
        
        let ganttProcesses = "";
        let ganttTimeline = "0,";
        let currentTime = 0;

        // Expand each block in the Gantt array unit-by-unit across the CSV columns
        result.gantt.forEach(block => {
            const duration = block.end - block.start;
            for(let i = 0; i < duration; i++) {
                ganttProcesses += `${block.id === 'Idle' ? '-' : block.id},`;
                currentTime++;
                ganttTimeline += `${currentTime},`;
            }
        });

        csv += ganttProcesses + "\n";
        csv += ganttTimeline + "\n";

        // 6. Download Logic
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url;
        a.download = `CPU_Scheduling_${algoName.replace(/\s+/g, '_')}.csv`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast("CSV Layout downloaded! ✅", "success");
    });
});