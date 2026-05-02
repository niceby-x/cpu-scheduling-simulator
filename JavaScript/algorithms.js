// =====================================================================
// JavaScript/algorithms.js
// SCHEDULING ALGORITHMS
// =====================================================================

export function runFCFS(processes) {
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

export function runSJF_NP(processes) {
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

export function runSRT(processes) {
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

export function runRR(processes, quantum) {
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

export function runPriority_NP(processes) {
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

export function runPriority_P(processes) {
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

export function runPriority_RR(processes, quantum) {
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