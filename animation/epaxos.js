// EPaxos Protocol Visualization
// Based on EPaxosCommitWithRecovery.tla specification

class EPaxosSimulator {
    constructor() {
        this.NUM_REPLICAS = 5;
        this.QUORUM_SIZE = 3; // N - F where N=5, F=2
        this.FAST_QUORUM_SIZE = 4; // N - E where E=1
        
        // Protocol state (similar to TLA+ variables)
        this.bal = {}; // ballot number per replica per command
        this.phase = {}; // phase per replica per command
        this.cmd = {}; // command payload per replica per command
        this.dep = {}; // dependencies per replica per command
        this.initDep = {}; // initial dependencies
        this.initCoord = {}; // initial coordinator for each command
        this.submitted = new Set();
        
        // Message queue
        this.messages = [];
        
        // Command counter
        this.commandCounter = 0;
        
        // Conflict definitions
        this.conflicts = {};
        
        // Animation state
        this.isPlaying = false;
        this.speed = 1500;
        this.playInterval = null;
        
        this.init();
        this.setupEventListeners();
        this.updateUI();
    }
    
    init() {
        // Initialize state for all replicas
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            this.bal[r] = {};
            this.phase[r] = {};
            this.cmd[r] = {};
            this.dep[r] = {};
            this.initDep[r] = {};
        }
    }
    
    reset() {
        this.bal = {};
        this.phase = {};
        this.cmd = {};
        this.dep = {};
        this.initDep = {};
        this.initCoord = {};
        this.submitted = new Set();
        this.messages = [];
        this.commandCounter = 0;
        this.conflicts = {};
        this.init();
        this.updateUI();
        this.updateStatus('System reset');
    }
    
    setupEventListeners() {
        document.getElementById('submit-btn').addEventListener('click', () => this.submitCommand());
        document.getElementById('step-btn').addEventListener('click', () => this.step());
        document.getElementById('play-btn').addEventListener('click', () => this.play());
        document.getElementById('pause-btn').addEventListener('click', () => this.pause());
        document.getElementById('reset-btn').addEventListener('click', () => this.reset());
        
        const speedSlider = document.getElementById('speed-slider');
        speedSlider.addEventListener('input', (e) => {
            this.speed = parseInt(e.target.value);
            document.getElementById('speed-value').textContent = (this.speed / 1000).toFixed(1) + 's';
            if (this.isPlaying) {
                this.pause();
                this.play();
            }
        });
    }
    
    submitCommand() {
        const replicaId = parseInt(document.getElementById('replica-select').value);
        const commandName = document.getElementById('command-input').value.trim();
        const conflictsInput = document.getElementById('conflicts-input').value.trim();
        
        if (!commandName) {
            alert('Please enter a command name');
            return;
        }
        
        const commandId = `cmd${this.commandCounter++}`;
        
        // Parse conflicts
        const conflictsWith = conflictsInput ? 
            conflictsInput.split(',').map(c => c.trim()).filter(c => c) : [];
        
        // Store conflict information
        this.conflicts[commandName] = conflictsWith;
        
        // Update conflicts bidirectionally
        for (const conflictCmd of conflictsWith) {
            if (!this.conflicts[conflictCmd]) {
                this.conflicts[conflictCmd] = [];
            }
            if (!this.conflicts[conflictCmd].includes(commandName)) {
                this.conflicts[conflictCmd].push(commandName);
            }
        }
        
        // Submit command
        this.submit(replicaId, commandId, commandName);
        
        // Clear inputs
        document.getElementById('command-input').value = '';
        document.getElementById('conflicts-input').value = '';
        
        this.updateStatus(`Command ${commandName} (${commandId}) submitted by Replica ${replicaId}`);
        this.updateUI();
    }
    
    submit(replicaId, commandId, commandName) {
        if (this.submitted.has(commandId)) {
            return;
        }
        
        this.submitted.add(commandId);
        this.initCoord[commandId] = replicaId;
        
        // Calculate initial dependencies (conflicting commands)
        const initialDeps = this.getConflictingIds(replicaId, commandName);
        
        // Send PreAccept messages to all replicas
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            this.messages.push({
                type: 'PreAccept',
                from: replicaId,
                to: r,
                commandId: commandId,
                cmd: commandName,
                dep: new Set(initialDeps),
                bal: 0
            });
        }
    }
    
    getConflictingIds(replicaId, commandName) {
        const conflictingIds = [];
        
        // Find all submitted commands that conflict with this one
        for (const [id, coord] of Object.entries(this.initCoord)) {
            if (this.phase[replicaId][id] && this.phase[replicaId][id] !== 'Initial') {
                const otherCmd = this.cmd[replicaId][id];
                if (this.checkConflict(commandName, otherCmd)) {
                    conflictingIds.push(id);
                }
            }
        }
        
        return conflictingIds;
    }
    
    checkConflict(cmd1, cmd2) {
        if (!cmd1 || !cmd2 || cmd1 === cmd2) return false;
        
        const conflicts1 = this.conflicts[cmd1] || [];
        const conflicts2 = this.conflicts[cmd2] || [];
        
        return conflicts1.includes(cmd2) || conflicts2.includes(cmd1);
    }
    
    step() {
        if (this.messages.length === 0) {
            this.updateStatus('No messages to process');
            return;
        }
        
        // Process one message
        const msg = this.messages.shift();
        this.processMessage(msg);
        this.updateUI();
    }
    
    play() {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        document.getElementById('play-btn').disabled = true;
        document.getElementById('pause-btn').disabled = false;
        document.getElementById('step-btn').disabled = true;
        
        this.playInterval = setInterval(() => {
            if (this.messages.length === 0) {
                this.pause();
                this.updateStatus('All messages processed');
            } else {
                this.step();
            }
        }, this.speed);
    }
    
    pause() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        document.getElementById('play-btn').disabled = false;
        document.getElementById('pause-btn').disabled = true;
        document.getElementById('step-btn').disabled = false;
        
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }
    
    processMessage(msg) {
        switch (msg.type) {
            case 'PreAccept':
                this.handlePreAccept(msg);
                break;
            case 'PreAcceptOK':
                this.handlePreAcceptOK(msg);
                break;
            case 'Accept':
                this.handleAccept(msg);
                break;
            case 'AcceptOK':
                this.handleAcceptOK(msg);
                break;
            case 'Commit':
                this.handleCommit(msg);
                break;
        }
    }
    
    handlePreAccept(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        // Initialize if needed
        if (!this.phase[r][id] || this.phase[r][id] === 'Initial') {
            // Store command and initial deps
            this.cmd[r][id] = msg.cmd;
            this.initDep[r][id] = new Set(msg.dep);
            
            // Calculate local dependencies
            const localDeps = this.getConflictingIds(r, msg.cmd);
            const finalDeps = new Set([...msg.dep, ...localDeps]);
            
            this.dep[r][id] = finalDeps;
            this.phase[r][id] = 'preaccepted';
            this.bal[r][id] = msg.bal;
            
            // Send PreAcceptOK back to coordinator
            this.messages.push({
                type: 'PreAcceptOK',
                from: r,
                to: msg.from,
                commandId: id,
                dep: finalDeps,
                bal: msg.bal
            });
            
            this.updateStatus(`Replica ${r} pre-accepted ${msg.cmd} (${id})`);
        }
    }
    
    handlePreAcceptOK(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        // Check if we're the coordinator and in preaccepted phase
        if (this.phase[r][id] !== 'preaccepted' || this.initCoord[id] !== r) {
            return;
        }
        
        // Count PreAcceptOK messages for this command
        const okMsgs = this.messages.filter(m => 
            m.type === 'PreAcceptOK' && m.to === r && m.commandId === id
        );
        
        // Verify current message matches criteria before adding
        if (msg.type === 'PreAcceptOK' && msg.to === r && msg.commandId === id) {
            okMsgs.push(msg);
        }
        
        // Check if we have a quorum
        if (okMsgs.length >= this.QUORUM_SIZE) {
            // Union all dependencies
            const allDeps = new Set();
            for (const m of okMsgs) {
                for (const dep of m.dep) {
                    allDeps.add(dep);
                }
            }
            
            // Check for fast path (fast quorum + all same deps as initial)
            const initialDeps = this.initDep[r] && this.initDep[r][id] ? this.initDep[r][id] : new Set();
            const canFastCommit = okMsgs.length >= this.FAST_QUORUM_SIZE &&
                okMsgs.every(m => this.setsEqual(m.dep, initialDeps));
            
            // Remove processed PreAcceptOK messages
            this.messages = this.messages.filter(m => 
                !(m.type === 'PreAcceptOK' && m.to === r && m.commandId === id)
            );
            
            if (canFastCommit) {
                // Fast path: send Commit
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    this.messages.push({
                        type: 'Commit',
                        from: r,
                        to: replica,
                        commandId: id,
                        cmd: this.cmd[r][id],
                        dep: allDeps,
                        bal: 0
                    });
                }
                this.updateStatus(`Fast commit for ${this.cmd[r][id]} (${id})`);
            } else {
                // Slow path: send Accept
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    this.messages.push({
                        type: 'Accept',
                        from: r,
                        to: replica,
                        commandId: id,
                        cmd: this.cmd[r][id],
                        dep: allDeps,
                        bal: 0
                    });
                }
                this.updateStatus(`Slow path for ${this.cmd[r][id]} (${id})`);
            }
        }
    }
    
    handleAccept(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        if (!this.bal[r][id] || this.bal[r][id] <= msg.bal) {
            this.bal[r][id] = msg.bal;
            this.cmd[r][id] = msg.cmd;
            this.dep[r][id] = new Set(msg.dep);
            this.phase[r][id] = 'accepted';
            
            // Send AcceptOK
            this.messages.push({
                type: 'AcceptOK',
                from: r,
                to: msg.from,
                commandId: id,
                bal: msg.bal
            });
            
            this.updateStatus(`Replica ${r} accepted ${msg.cmd} (${id})`);
        }
    }
    
    handleAcceptOK(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        if (this.phase[r][id] !== 'accepted') {
            return;
        }
        
        // Count AcceptOK messages
        const okMsgs = this.messages.filter(m => 
            m.type === 'AcceptOK' && m.to === r && m.commandId === id && m.bal === msg.bal
        );
        
        // Verify current message matches criteria before adding
        if (msg.type === 'AcceptOK' && msg.to === r && msg.commandId === id && msg.bal === this.bal[r][id]) {
            okMsgs.push(msg);
        }
        
        if (okMsgs.length >= this.QUORUM_SIZE) {
            // Remove processed AcceptOK messages
            this.messages = this.messages.filter(m => 
                !(m.type === 'AcceptOK' && m.to === r && m.commandId === id)
            );
            
            // Send Commit to all replicas
            for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                this.messages.push({
                    type: 'Commit',
                    from: r,
                    to: replica,
                    commandId: id,
                    cmd: this.cmd[r][id],
                    dep: this.dep[r][id],
                    bal: msg.bal
                });
            }
            
            this.updateStatus(`Committing ${this.cmd[r][id]} (${id})`);
        }
    }
    
    handleCommit(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        this.cmd[r][id] = msg.cmd;
        this.dep[r][id] = new Set(msg.dep);
        this.phase[r][id] = 'committed';
        this.bal[r][id] = msg.bal;
        
        this.updateStatus(`Replica ${r} committed ${msg.cmd} (${id})`);
    }
    
    setsEqual(set1, set2) {
        if (!set1 || !set2) return false;
        if (set1.size !== set2.size) return false;
        for (const item of set1) {
            if (!set2.has(item)) return false;
        }
        return true;
    }
    
    updateStatus(message) {
        document.getElementById('status-message').textContent = message;
    }
    
    updateUI() {
        // Update message queue count
        document.getElementById('queue-count').textContent = this.messages.length;
        
        // Update each replica's display
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            this.updateReplicaDisplay(r);
            this.drawDependencyGraph(r);
        }
    }
    
    updateReplicaDisplay(replicaId) {
        const commandsList = document.getElementById(`commands-${replicaId}`);
        commandsList.innerHTML = '';
        
        // Get all commands for this replica
        const commands = Object.keys(this.phase[replicaId] || {});
        
        if (commands.length === 0) {
            commandsList.innerHTML = '<div style="color: #999; font-size: 12px;">No commands</div>';
            return;
        }
        
        for (const cmdId of commands) {
            const phase = this.phase[replicaId][cmdId];
            const cmd = this.cmd[replicaId][cmdId];
            const deps = this.dep[replicaId][cmdId];
            
            const cmdDiv = document.createElement('div');
            cmdDiv.className = `command-item status-${phase}`;
            
            const cmdName = document.createElement('div');
            cmdName.className = 'command-name';
            cmdName.textContent = `${cmd} (${cmdId})`;
            
            const cmdStatus = document.createElement('div');
            cmdStatus.innerHTML = `<span class="status-badge status-${phase}">${phase}</span>`;
            
            const cmdDeps = document.createElement('div');
            cmdDeps.className = 'command-deps';
            if (deps && deps.size > 0) {
                cmdDeps.textContent = `Deps: ${Array.from(deps).join(', ')}`;
            } else {
                cmdDeps.textContent = 'Deps: none';
            }
            
            cmdDiv.appendChild(cmdName);
            cmdDiv.appendChild(cmdStatus);
            cmdDiv.appendChild(cmdDeps);
            
            commandsList.appendChild(cmdDiv);
        }
    }
    
    drawDependencyGraph(replicaId) {
        const canvas = document.getElementById(`graph-${replicaId}`);
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const commands = Object.keys(this.phase[replicaId] || {});
        if (commands.length === 0) {
            ctx.fillStyle = '#999';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No commands', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        // Calculate node positions in a circle
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) / 2 - 30;
        
        const positions = {};
        commands.forEach((cmdId, index) => {
            const angle = (2 * Math.PI * index) / commands.length - Math.PI / 2;
            positions[cmdId] = {
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle)
            };
        });
        
        // Draw dependency edges
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        commands.forEach(cmdId => {
            const deps = this.dep[replicaId][cmdId];
            if (deps) {
                deps.forEach(depId => {
                    if (positions[depId]) {
                        const from = positions[cmdId];
                        const to = positions[depId];
                        
                        // Draw arrow
                        ctx.beginPath();
                        ctx.moveTo(from.x, from.y);
                        ctx.lineTo(to.x, to.y);
                        ctx.stroke();
                        
                        // Draw arrowhead
                        const angle = Math.atan2(to.y - from.y, to.x - from.x);
                        const arrowSize = 8;
                        ctx.beginPath();
                        ctx.moveTo(to.x, to.y);
                        ctx.lineTo(
                            to.x - arrowSize * Math.cos(angle - Math.PI / 6),
                            to.y - arrowSize * Math.sin(angle - Math.PI / 6)
                        );
                        ctx.lineTo(
                            to.x - arrowSize * Math.cos(angle + Math.PI / 6),
                            to.y - arrowSize * Math.sin(angle + Math.PI / 6)
                        );
                        ctx.closePath();
                        ctx.fill();
                    }
                });
            }
        });
        
        // Draw nodes
        commands.forEach(cmdId => {
            const pos = positions[cmdId];
            const phase = this.phase[replicaId][cmdId];
            
            // Node color based on phase
            let color;
            switch (phase) {
                case 'preaccepted':
                    color = '#ffc107';
                    break;
                case 'accepted':
                    color = '#17a2b8';
                    break;
                case 'committed':
                    color = '#28a745';
                    break;
                default:
                    color = '#e0e0e0';
            }
            
            // Draw node circle
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 15, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw label
            const cmd = this.cmd[replicaId][cmdId];
            ctx.fillStyle = '#333';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cmd || cmdId, pos.x, pos.y);
        });
    }
}

// Initialize the simulator when the page loads
let simulator;
document.addEventListener('DOMContentLoaded', () => {
    simulator = new EPaxosSimulator();
});
