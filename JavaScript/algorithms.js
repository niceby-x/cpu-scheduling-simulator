// =====================================================================
// SCHEDULING ALGORITHMS MODULE
//
// This module implements seven classical CPU scheduling algorithms used
// in operating systems to manage process execution order. Each function
// accepts a list of process objects and returns a Gantt chart timeline
// along with computed performance metrics per process.
//
// Each process object is expected to have the following properties:
//   - id          : Unique process identifier (e.g., "P1", "P2")
//   - at          : Arrival Time  — the clock tick when the process enters the ready queue
//   - bt          : Burst Time    — total CPU time the process requires to complete
//   - remTime     : Remaining Time — tracks how much burst time is left (used by preemptive algorithms)
//   - priority    : Priority value — lower integer = higher priority (used by Priority algorithms)
//   - firstStart  : Initialized to -1; updated when the process first gets CPU access
//   - originalIndex : Positional index in the original input array; used as a consistent tie-breaker
//   - color       : Display color for the Gantt chart visualization
//
// Each function returns an object with:
//   - gantt       : Array of execution blocks { id, start, end, color } used to render the Gantt chart
//   - processes   : The updated process array with computed metrics (CT, TAT, WT, Response Time)
//   - totalTime   : The clock value when all processes have finished executing
//
// Computed Metrics (set on each process after execution):
//   - ct          : Completion Time  — when the process finishes execution
//   - tat         : Turnaround Time  — CT - AT  (total time from arrival to completion)
//   - wt          : Waiting Time     — TAT - BT (time spent waiting, not executing)
//   - respTime    : Response Time    — firstStart - AT (time from arrival to first CPU access)
// =====================================================================


// ─────────────────────────────────────────────────────────────────────
// 1. FIRST-COME, FIRST-SERVED (FCFS) — Non-Preemptive
//
// Overview:
//   The simplest scheduling algorithm. Processes are executed strictly
//   in the order they arrive in the ready queue. Once a process starts,
//   it holds the CPU until it finishes — it cannot be interrupted.
//
// Behavior:
//   - Arrival order determines execution order.
//   - If the CPU is free but no process has arrived yet, an Idle block
//     is inserted in the Gantt chart until the next process arrives.
//   - Ties in arrival time are broken by original input order.
//
// Strengths:  Simple to implement; fair in a "first come" sense.
// Weaknesses: Suffers from the "Convoy Effect" — a long process can
//             block many shorter ones, increasing average waiting time.
// ─────────────────────────────────────────────────────────────────────
export function runFCFS(processes) {
    // 'time' is the current clock tick; 'gantt' holds the timeline blocks
    let time = 0, gantt = [];

    // Sort the process list by arrival time.
    // If two processes arrive at the same time, the one with the lower
    // original input index goes first (preserves stable ordering).
    let queue = [...processes].sort((a, b) => a.at - b.at || a.originalIndex - b.originalIndex);
    
    queue.forEach(p => {
        // If the current clock is behind the process's arrival time,
        // the CPU has nothing to run — insert an Idle block to fill the gap.
        if (time < p.at) {
            gantt.push({ id: 'Idle', start: time, end: p.at, color: 'transparent' });
            time = p.at;
        }

        // Record the first time this process receives CPU access (used for Response Time).
        if (p.firstStart === -1) p.firstStart = time;
        
        // Push the full execution block onto the Gantt chart.
        // The process runs from 'time' to 'time + burst time' without interruption.
        gantt.push({ id: p.id, start: time, end: time + p.bt, color: p.color });
        time += p.bt;
        
        // Compute performance metrics once the process completes:
        //   CT  = current time after execution finishes
        //   TAT = CT - AT  (total lifecycle time)
        //   WT  = TAT - BT (time spent not running = waiting time)
        //   RT  = firstStart - AT (delay before first CPU access)
        p.ct = time;
        p.tat = p.ct - p.at;
        p.wt = p.tat - p.bt;
        p.respTime = p.firstStart - p.at;
    });

    return { gantt, processes: queue, totalTime: time };
}


// ─────────────────────────────────────────────────────────────────────
// 2. SHORTEST JOB FIRST (SJF) — Non-Preemptive
//
// Overview:
//   At each scheduling decision point, the scheduler picks the process
//   in the ready queue with the smallest burst time. Like FCFS, once
//   selected, the process runs to completion without preemption.
//
// Behavior:
//   - At every decision point, all arrived and incomplete processes are
//     collected into an "available" pool.
//   - The process with the shortest burst time is chosen next.
//   - Ties in burst time are broken by arrival time, then input order.
//   - If no process is available, the CPU idles until the next arrival.
//
// Strengths:  Minimizes average waiting time among non-preemptive algorithms.
// Weaknesses: Requires advance knowledge of burst times (impractical in
//             real systems). Long processes may suffer starvation.
// ─────────────────────────────────────────────────────────────────────
export function runSJF_NP(processes) {
    let time = 0, completed = 0, gantt = [], n = processes.length;

    // Boolean array to mark which processes have already been completed.
    // Indexed by originalIndex to safely cross-reference the processes array.
    let done = new Array(n).fill(false);
    
    // The main loop continues until all 'n' processes have been executed.
    while (completed !== n) {

        // Build the ready queue: processes that have arrived and are not yet done.
        let avail = processes.filter(p => p.at <= time && !done[p.originalIndex]);

        if (avail.length > 0) {
            // Sort the available pool: shortest burst time first.
            // Ties resolved by: earliest arrival → then original input order.
            avail.sort((a, b) => a.bt - b.bt || a.at - b.at || a.originalIndex - b.originalIndex);
            let cur = avail[0]; // The selected process is the one with the shortest burst

            // Record first CPU access time for response time calculation.
            if (cur.firstStart === -1) cur.firstStart = time;
            
            // Execute the entire process — no preemption occurs.
            gantt.push({ id: cur.id, start: time, end: time + cur.bt, color: cur.color });
            time += cur.bt;

            // Compute and store metrics after completion.
            cur.ct = time;
            cur.tat = cur.ct - cur.at;
            cur.wt = cur.tat - cur.bt;
            cur.respTime = cur.firstStart - cur.at;

            // Mark as done and count it toward the completion total.
            done[cur.originalIndex] = true;
            completed++;
        } else {
            // No process is ready — find the earliest future arrival and idle until then.
            let rem = processes.filter(p => !done[p.originalIndex]);
            if (!rem.length) break; // Safety check: no remaining processes
            let next = Math.min(...rem.map(p => p.at));
            gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' });
            time = next;
        }
    }

    return { gantt, processes, totalTime: time };
}


// ─────────────────────────────────────────────────────────────────────
// 3. SHORTEST REMAINING TIME (SRT) — Preemptive SJF
//
// Overview:
//   The preemptive counterpart of SJF. The scheduler re-evaluates the
//   ready queue at every clock tick. If a newly arrived process has a
//   shorter remaining burst time than the currently running process,
//   the current process is immediately preempted.
//
// Behavior:
//   - Advances simulation one clock tick at a time for precise control.
//   - At each tick, the process with the smallest 'remTime' is selected.
//   - If the same process runs consecutively, its Gantt block is extended
//     (merged) rather than creating a new block — keeps the chart clean.
//   - Idle blocks are similarly merged if multiple idle ticks follow each other.
//
// Strengths:  Achieves the minimum possible average waiting time overall.
// Weaknesses: High overhead from frequent context switches. Starvation
//             risk for long processes if short ones keep arriving.
// ─────────────────────────────────────────────────────────────────────
export function runSRT(processes) {
    let time = 0, completed = 0, gantt = [], n = processes.length;

    // 'prev' tracks the ID of the last process (or 'Idle') that ran.
    // Used to decide whether to extend the last Gantt block or create a new one.
    let prev = null;

    // EVENT-DRIVEN: instead of stepping one tick at a time (O(n × T)), each
    // iteration jumps directly to the next meaningful time point — whichever
    // of these comes first:
    //   1. The running process finishes (time + cur.remTime).
    //   2. A future process arrives and may preempt (next unstarted arrival).
    // This keeps the loop count proportional to the number of scheduling
    // events (arrivals + completions), not the total burst time.
    while (completed !== n) {
        // Collect all processes that have arrived and still have work remaining.
        let avail = processes.filter(p => p.at <= time && p.remTime > 0);

        if (avail.length > 0) {
            // Select the process with the shortest remaining burst time.
            // Ties resolved by: earliest arrival → then original input order.
            avail.sort((a, b) => a.remTime - b.remTime || a.at - b.at || a.originalIndex - b.originalIndex);
            let cur = avail[0];

            // Record the first time this process receives the CPU.
            if (cur.firstStart === -1) cur.firstStart = time;

            // Find the next future arrival that could preempt the current process.
            // A future process p can preempt cur only if p.remTime is strictly less
            // than the time cur will have *remaining* at the moment p arrives.
            // By the time p.at is reached, cur will have run for (p.at - time) more
            // ticks, leaving it with: cur.remTime - (p.at - time).
            // So the preemption condition is: p.remTime < cur.remTime - (p.at - time).
            // Using + instead of - would make the threshold larger than cur's actual
            // remaining time, causing nearly every future arrival to pass the filter
            // and forcing unnecessary loop iterations and Gantt block merges.
            let futureArrivals = processes.filter(p => p.at > time && p.remTime > 0);
            let nextPreemption = futureArrivals
                .filter(p => p.remTime < cur.remTime - (p.at - time)) // could preempt
                .reduce((min, p) => Math.min(min, p.at), Infinity);

            // Jump to whichever comes first: completion or a potential preemption.
            let runUntil = Math.min(time + cur.remTime, nextPreemption);
            let slice    = runUntil - time;

            // Extend the current Gantt block or open a new one.
            if (prev !== cur.id) {
                gantt.push({ id: cur.id, start: time, end: runUntil, color: cur.color });
            } else {
                gantt[gantt.length - 1].end = runUntil;
            }

            cur.remTime -= slice;
            time         = runUntil;
            prev         = cur.id;

            // If this process has no remaining time, it is complete.
            if (cur.remTime === 0) {
                completed++;
                cur.ct      = time;
                cur.tat     = cur.ct - cur.at;
                cur.wt      = cur.tat - cur.bt;
                cur.respTime = cur.firstStart - cur.at;
            }
        } else {
            // No process is ready — CPU idles until the next process arrives.
            let rem = processes.filter(p => p.remTime > 0);
            if (!rem.length) break;
            let next = Math.min(...rem.map(p => p.at));

            // Merge idle blocks if the CPU was already idle last tick.
            if (prev !== 'Idle') {
                gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' });
            } else {
                gantt[gantt.length - 1].end = next;
            }

            time = next;
            prev = 'Idle';
        }
    }

    return { gantt, processes, totalTime: time };
}


// ─────────────────────────────────────────────────────────────────────
// 4. ROUND ROBIN (RR) — Preemptive
//
// Overview:
//   A fair, preemptive algorithm designed for time-sharing systems.
//   Each process is assigned a fixed unit of CPU time called the
//   "time quantum." Processes cycle through the ready queue in order;
//   if a process does not finish within its quantum, it is returned
//   to the back of the queue and waits for its next turn.
//
// Parameters:
//   - quantum : The maximum number of time units a process may run
//               continuously before being preempted and re-queued.
//
// Behavior:
//   - A circular FIFO queue manages the ready pool.
//   - After each execution slice, newly arrived processes are admitted
//     to the queue before the current process is re-queued (if unfinished).
//   - The 'inQueue' boolean array prevents the same process from being
//     added to the queue multiple times simultaneously.
//
// Strengths:  Guarantees every process gets CPU time within bounded delay.
//             Good for interactive and time-sharing environments.
// Weaknesses: A poorly chosen quantum degrades performance (too small =
//             excessive context switches; too large = behaves like FCFS).
// ─────────────────────────────────────────────────────────────────────
export function runRR(processes, quantum) {
    let completed = 0, gantt = [], n = processes.length, queue = [];

    // 'inQueue[i]' is true if process with originalIndex i is currently in the ready queue.
    // This prevents a process from being enqueued twice at the same time.
    let inQueue = new Array(n).fill(false);

    // 'prev' tracks the ID of the last process (or 'Idle') that ran.
    // Used to merge consecutive Gantt blocks for the same process into one entry,
    // keeping the raw gantt array lean and consistent with runSRT / runPriority_P.
    // Without this, a process that receives multiple consecutive quanta (e.g. when
    // it's the only process in the queue) produces a separate block per quantum,
    // inflating the gantt array and the exported Excel timeline unnecessarily.
    let prev = null;

    // Sort the master process list by arrival order for consistent arrival scanning.
    let sorted = [...processes].sort((a, b) => a.at - b.at || a.originalIndex - b.originalIndex);
    
    // Initialize the clock at the earliest process arrival (may not be time 0).
    let time = Math.min(...sorted.map(p => p.at));

    // If processes don't start at time 0, insert an initial Idle block.
    if (time > 0) {
        gantt.push({ id: 'Idle', start: 0, end: time, color: 'transparent' });
        prev = 'Idle';
    }
    
    // Populate the initial ready queue with all processes that have already arrived.
    sorted.forEach(p => {
        if (p.at <= time && !inQueue[p.originalIndex]) {
            queue.push(p);
            inQueue[p.originalIndex] = true;
        }
    });
    
    // Main scheduling loop — continues until all processes complete.
    while (completed !== n) {
        if (queue.length > 0) {
            let cur = queue.shift(); // Take the first process from the ready queue (FIFO)

            // Record first CPU access time for response time calculation.
            if (cur.firstStart === -1) cur.firstStart = time;
            
            // Execute for the lesser of: the time quantum OR remaining burst time.
            // This ensures a process is never given more time than it actually needs.
            let exec = Math.min(cur.remTime, quantum);

            // Extend the last Gantt block if this process ran in the previous slot,
            // otherwise open a fresh block. This keeps consecutive quanta merged.
            if (prev === cur.id) {
                gantt[gantt.length - 1].end = time + exec;
            } else {
                gantt.push({ id: cur.id, start: time, end: time + exec, color: cur.color });
            }

            time += exec;
            cur.remTime -= exec;
            prev = cur.id;
            
            // After executing, check if any new processes arrived during this execution window.
            // New arrivals are added to the back of the queue before re-queuing the current process.
            sorted.forEach(p => {
                if (p.at <= time && p.remTime > 0 && !inQueue[p.originalIndex]) {
                    queue.push(p);
                    inQueue[p.originalIndex] = true;
                }
            });
            
            if (cur.remTime > 0) {
                // Process still has work to do — re-add it to the back of the queue.
                queue.push(cur);
            } else {
                // Process is fully complete — compute and store its metrics.
                completed++;
                cur.ct = time;
                cur.tat = cur.ct - cur.at;
                cur.wt = cur.tat - cur.bt;
                cur.respTime = cur.firstStart - cur.at;
            }
        } else {
            // Queue is empty but processes remain — CPU idles until the next arrival.
            let rem = sorted.filter(p => p.remTime > 0);
            if (!rem.length) break;
            let next = Math.min(...rem.map(p => p.at));

            // Merge consecutive idle periods into one block, consistent with other algorithms.
            if (prev === 'Idle') {
                gantt[gantt.length - 1].end = next;
            } else {
                gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' });
            }

            time = next;
            prev = 'Idle';

            // Admit any processes that have now arrived into the ready queue.
            sorted.forEach(p => {
                if (p.at <= time && p.remTime > 0 && !inQueue[p.originalIndex]) {
                    queue.push(p);
                    inQueue[p.originalIndex] = true;
                }
            });
        }
    }

    return { gantt, processes, totalTime: time };
}


// ─────────────────────────────────────────────────────────────────────
// 5. PRIORITY SCHEDULING — Non-Preemptive
//
// Overview:
//   Each process is assigned a numeric priority. At each scheduling
//   decision, the process with the highest priority (lowest integer
//   value) among all arrived processes is selected and runs to completion
//   without interruption.
//
// Behavior:
//   - At every decision point, all arrived and incomplete processes form
//     the candidate pool, sorted by their priority value.
//   - Ties in priority are broken by arrival time, then input order.
//   - The selected process holds the CPU until it finishes; no preemption.
//
// Strengths:  Ensures critical processes are serviced before less important ones.
// Weaknesses: Low-priority processes may experience indefinite starvation
//             if high-priority processes keep arriving. Requires aging
//             strategies in real systems to prevent this.
// ─────────────────────────────────────────────────────────────────────
export function runPriority_NP(processes) {
    let time = 0, completed = 0, gantt = [], n = processes.length;

    // Boolean array to track which processes have finished execution.
    let done = new Array(n).fill(false);

    while (completed !== n) {
        // Collect all processes that have arrived and are not yet completed.
        let avail = processes.filter(p => p.at <= time && !done[p.originalIndex]);

        if (avail.length > 0) {
            // Sort by priority (ascending = higher priority first).
            // Ties resolved by: earliest arrival → then original input order.
            avail.sort((a, b) => a.priority - b.priority || a.at - b.at || a.originalIndex - b.originalIndex);
            let cur = avail[0]; // Select the highest-priority process

            // Record first CPU access time for response time calculation.
            if (cur.firstStart === -1) cur.firstStart = time;

            // Execute the entire process — non-preemptive, so no interruption occurs.
            gantt.push({ id: cur.id, start: time, end: time + cur.bt, color: cur.color });
            time += cur.bt;

            // Compute performance metrics upon completion.
            cur.ct = time;
            cur.tat = cur.ct - cur.at;
            cur.wt = cur.tat - cur.bt;
            cur.respTime = cur.firstStart - cur.at;

            // Mark this process as finished.
            done[cur.originalIndex] = true;
            completed++;
        } else {
            // No process is ready — idle until the next one arrives.
            let rem = processes.filter(p => !done[p.originalIndex]);
            if (!rem.length) break;
            let next = Math.min(...rem.map(p => p.at));
            gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' });
            time = next;
        }
    }

    return { gantt, processes, totalTime: time };
}


// ─────────────────────────────────────────────────────────────────────
// 6. PRIORITY SCHEDULING — Preemptive
//
// Overview:
//   The preemptive variant of Priority Scheduling. The scheduler checks
//   priority at every single clock tick. If a new process arrives with
//   a higher priority than the currently running one, the CPU is
//   immediately seized and given to the new process.
//
// Behavior:
//   - Advances one clock tick at a time, recomputing priority each tick.
//   - If the selected process changes between ticks, a new Gantt block
//     is created. If it stays the same, the existing block is extended.
//   - Idle blocks are handled with the same merge logic as SRT.
//
// Strengths:  Highest-priority processes always get the CPU immediately
//             upon arrival — ideal for real-time or critical task systems.
// Weaknesses: Maximum starvation risk for low-priority processes. Very
//             high context-switch overhead compared to non-preemptive version.
// ─────────────────────────────────────────────────────────────────────
export function runPriority_P(processes) {
    let time = 0, completed = 0, gantt = [], n = processes.length;

    // 'prev' tracks the last process ID executed, for Gantt block merging.
    let prev = null;

    // EVENT-DRIVEN: instead of stepping one tick at a time (O(n × T)), each
    // iteration jumps directly to the next meaningful time point — whichever
    // of these comes first:
    //   1. The running process finishes (time + cur.remTime).
    //   2. A higher-priority process arrives and would preempt the current one.
    // This keeps the loop count proportional to scheduling events, not burst time.
    while (completed !== n) {
        // Collect all arrived processes that still have remaining burst time.
        let avail = processes.filter(p => p.at <= time && p.remTime > 0);

        if (avail.length > 0) {
            // Select the process with the highest priority (lowest value).
            // Ties resolved by: earliest arrival → then original input order.
            avail.sort((a, b) => a.priority - b.priority || a.at - b.at || a.originalIndex - b.originalIndex);
            let cur = avail[0];

            // Record first CPU access for response time calculation.
            if (cur.firstStart === -1) cur.firstStart = time;

            // Find the earliest future arrival of a process with strictly higher
            // priority (lower value) than the current process — that is the point
            // at which a preemption would occur.
            let nextPreemption = processes
                .filter(p => p.at > time && p.remTime > 0 && p.priority < cur.priority)
                .reduce((min, p) => Math.min(min, p.at), Infinity);

            // Jump to whichever comes first: completion or a preempting arrival.
            let runUntil = Math.min(time + cur.remTime, nextPreemption);
            let slice    = runUntil - time;

            // Extend the current Gantt block or open a new one.
            if (prev !== cur.id) {
                gantt.push({ id: cur.id, start: time, end: runUntil, color: cur.color });
            } else {
                gantt[gantt.length - 1].end = runUntil;
            }

            // Advance the clock and decrement the process's remaining time.
            cur.remTime -= slice;
            time         = runUntil;
            prev         = cur.id;

            // If the process is now complete, record its metrics.
            if (cur.remTime === 0) {
                completed++;
                cur.ct      = time;
                cur.tat     = cur.ct - cur.at;
                cur.wt      = cur.tat - cur.bt;
                cur.respTime = cur.firstStart - cur.at;
            }
        } else {
            // No ready process — CPU idles until the next arrival.
            let rem = processes.filter(p => p.remTime > 0);
            if (!rem.length) break;
            let next = Math.min(...rem.map(p => p.at));

            // Merge consecutive idle ticks into a single block.
            if (prev !== 'Idle') {
                gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' });
            } else {
                gantt[gantt.length - 1].end = next;
            }

            time = next;
            prev = 'Idle';
        }
    }

    return { gantt, processes, totalTime: time };
}


// ─────────────────────────────────────────────────────────────────────
// 7. PRIORITY ROUND ROBIN — Preemptive
//
// Overview:
//   A hybrid algorithm that combines Priority Scheduling with Round Robin.
//   Processes are primarily ordered by priority. However, when multiple
//   processes share the same priority level, they are served using Round
//   Robin time-slicing to ensure fairness among equals.
//
// Parameters:
//   - quantum : The time slice allocated per turn for processes sharing
//               the same priority level.
//
// Behavior:
//   - At each scheduling turn, the ready queue is searched for the
//     process with the highest priority (lowest integer value).
//   - That process executes for up to 'quantum' ticks.
//   - Mid-quantum preemption occurs instantly if a higher-priority process
//     arrives — ensuring strict priority is always respected.
//   - 'inQueue' tracks which processes are currently in the ready queue
//     to avoid duplicate insertions.
//   - Gantt blocks from the same process are merged if they are adjacent,
//     accounting for cases where preemption did not actually occur.
//
// Strengths:  Balances priority enforcement with fairness at each priority
//             level. Prevents monopolization within a priority tier.
// Weaknesses: More complex to implement than either pure algorithm alone.
//             Starvation can still occur for the lowest-priority processes.
// ─────────────────────────────────────────────────────────────────────
export function runPriority_RR(processes, quantum) {
    let time = 0, completed = 0, gantt = [], n = processes.length, queue = [];

    // 'inQueue[i]' prevents the same process from appearing in the queue twice.
    let inQueue = new Array(n).fill(false);

    // Sort all processes by arrival time for systematic arrival scanning.
    let sorted = [...processes].sort((a, b) => a.at - b.at || a.originalIndex - b.originalIndex);

    // Start the clock at the earliest arrival; insert Idle block if needed.
    time = Math.min(...sorted.map(p => p.at));
    if (time > 0) gantt.push({ id: 'Idle', start: 0, end: time, color: 'transparent' });

    // Reusable helper: scans 'sorted' and adds any process that has arrived
    // by time 't' and is not already in the queue.
    const checkArrivals = t => sorted.forEach(p => {
        if (p.at <= t && p.remTime > 0 && !inQueue[p.originalIndex]) {
            queue.push(p);
            inQueue[p.originalIndex] = true;
        }
    });

    // Initialize the ready queue with processes that have arrived at start time.
    checkArrivals(time);

    while (completed !== n) {
        if (queue.length > 0) {
            // Identify the highest priority (minimum value) among queued processes.
            let hp = Math.min(...queue.map(p => p.priority));

            // Find and remove the first process in the queue with that priority.
            // Using 'findIndex' + 'splice' preserves Round Robin order within the tier.
            let ci = queue.findIndex(p => p.priority === hp);
            let cur = queue.splice(ci, 1)[0];
            
            // Record first CPU access time.
            if (cur.firstStart === -1) cur.firstStart = time;

            // 'spent' counts how many ticks were executed this turn.
            // 'preempted' flags whether the quantum was cut short by a higher-priority arrival.
            let spent = 0, preempted = false;
            
            // Inner execution loop: run up to 'quantum' ticks, one at a time.
            // This allows checking for higher-priority arrivals at each tick.
            while (spent < quantum && cur.remTime > 0) {
                cur.remTime--;
                spent++;
                time++;
                let newArr = false;
                
                // Scan for any process arriving exactly at this tick.
                sorted.forEach(p => {
                    if (p.at === time && p.remTime > 0 && !inQueue[p.originalIndex]) {
                        queue.push(p);
                        inQueue[p.originalIndex] = true;
                        newArr = true;
                    }
                });
                
                // If a new arrival has strictly higher priority, preempt immediately.
                // This ensures the preemptive nature of the algorithm is enforced mid-quantum.
                if (newArr && Math.min(...queue.map(p => p.priority)) < cur.priority) {
                    preempted = true;
                    break;
                }
            }
            
            // Compute the start of this execution block for Gantt recording.
            const gs = time - spent;

            // Merge into the previous Gantt block if it belongs to the same process.
            // This handles cases where the same process runs consecutive turns.
            if (gantt.length > 0 && gantt[gantt.length - 1].id === cur.id) {
                gantt[gantt.length - 1].end = time;
            } else {
                gantt.push({ id: cur.id, start: gs, end: time, color: cur.color });
            }

            if (cur.remTime > 0) {
                // Process is not finished — return it to the back of the ready queue.
                queue.push(cur);
            } else {
                // Process is complete — finalize its performance metrics.
                completed++;
                cur.ct = time;
                cur.tat = cur.ct - cur.at;
                cur.wt = cur.tat - cur.bt;
                cur.respTime = cur.firstStart - cur.at;
            }
        } else {
            // Queue is empty — CPU idles until the next process arrives.
            let rem = sorted.filter(p => p.remTime > 0);
            if (!rem.length) break;
            let next = Math.min(...rem.map(p => p.at));
            gantt.push({ id: 'Idle', start: time, end: next, color: 'transparent' });
            time = next;

            // Admit newly arrived processes into the ready queue.
            checkArrivals(time);
        }
    }

    return { gantt, processes, totalTime: time };
}