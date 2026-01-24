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
        this.abal = {}; // accepted ballot for recovery
        this.recovered = {}; // recovery counter
        
        // Message queue with delivery delays
        this.messages = [];
        this.messageDeliveryDelays = new Map(); // Track when messages should be delivered
        
        // Command counter
        this.commandCounter = 0;
        
        // Conflict definitions
        this.conflicts = {};
        
        // Command colors for visualization
        this.commandColors = {};
        this.colorPalette = [
            '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
            '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b'
        ];
        
        // Execution history
        this.executionHistory = [];
        
        // Animation state
        this.isPlaying = false;
        this.speed = 1500;
        this.playInterval = null;
        this.currentTime = 0; // Logical time for message delivery
        
        // Replica disconnection state
        this.disconnectedReplicas = new Set();
        
        // Active message animations
        this.activeMessageAnimations = [];
        
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
            this.abal[r] = {};
            this.recovered[r] = {};
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
        this.messageDeliveryDelays = new Map();
        this.commandCounter = 0;
        this.conflicts = {};
        this.commandColors = {};
        this.executionHistory = [];
        this.currentTime = 0;
        this.disconnectedReplicas = new Set();
        this.abal = {};
        this.recovered = {};
        this.activeMessageAnimations = [];
        this.init();
        this.updateUI();
        this.addToHistory('System reset', 'system');
    }
    
    setupEventListeners() {
        document.getElementById('submit-btn').addEventListener('click', () => this.submitCommand());
        document.getElementById('step-btn').addEventListener('click', () => this.step());
        document.getElementById('play-btn').addEventListener('click', () => this.play());
        document.getElementById('pause-btn').addEventListener('click', () => this.pause());
        document.getElementById('reset-btn').addEventListener('click', () => this.reset());
        
        // Disconnect replica buttons
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            const btn = document.getElementById(`disconnect-btn-${r}`);
            if (btn) {
                btn.addEventListener('click', () => this.toggleReplicaConnection(r));
            }
        }
        
        // Recovery button
        const recoveryBtn = document.getElementById('recovery-btn');
        if (recoveryBtn) {
            recoveryBtn.addEventListener('click', () => this.startRecovery());
        }
        
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
    
    addToHistory(message, commandId = null) {
        const timestamp = new Date().toLocaleTimeString();
        const color = commandId && commandId !== 'system' ? this.getCommandColor(commandId) : '#666';
        this.executionHistory.push({ timestamp, message, commandId, color });
        this.updateHistoryDisplay();
    }
    
    getCommandColor(commandId) {
        if (!this.commandColors[commandId]) {
            const colorIndex = Object.keys(this.commandColors).length % this.colorPalette.length;
            this.commandColors[commandId] = this.colorPalette[colorIndex];
        }
        return this.commandColors[commandId];
    }
    
    updateHistoryDisplay() {
        const historyEl = document.getElementById('execution-history');
        if (!historyEl) return;
        
        // Show last 15 entries
        const recentHistory = this.executionHistory.slice(-15);
        historyEl.innerHTML = recentHistory.map(entry => 
            `<div class="history-entry" style="border-left-color: ${entry.color}">
                <span class="history-time">${entry.timestamp}</span>
                <span class="history-message">${entry.message}</span>
            </div>`
        ).join('');
        
        // Auto-scroll to bottom
        historyEl.scrollTop = historyEl.scrollHeight;
    }
    
    toggleReplicaConnection(replicaId) {
        if (this.disconnectedReplicas.has(replicaId)) {
            this.disconnectedReplicas.delete(replicaId);
            this.addToHistory(`Replica ${replicaId} reconnected`, 'system');
        } else {
            this.disconnectedReplicas.add(replicaId);
            this.addToHistory(`Replica ${replicaId} disconnected`, 'system');
        }
        this.updateUI();
    }
    
    isReplicaConnected(replicaId) {
        return !this.disconnectedReplicas.has(replicaId);
    }
    
    addMessageWithRandomDelay(msg) {
        // Add random network delay (0-200ms simulation time)
        const delay = Math.random() * 200;
        const deliveryTime = this.currentTime + delay;
        
        msg.deliveryTime = deliveryTime;
        this.messages.push(msg);
        
        // Sort messages by delivery time to simulate network randomization
        this.messages.sort((a, b) => (a.deliveryTime || 0) - (b.deliveryTime || 0));
    }
    
    startRecovery() {
        // Start recovery for a random command that hasn't been committed on all replicas
        const candidates = [];
        
        for (const cmdId of this.submitted) {
            let needsRecovery = false;
            for (let r = 0; r < this.NUM_REPLICAS; r++) {
                if (!this.phase[r][cmdId] || this.phase[r][cmdId] !== 'committed') {
                    needsRecovery = true;
                    break;
                }
            }
            if (needsRecovery) {
                candidates.push(cmdId);
            }
        }
        
        if (candidates.length === 0) {
            this.addToHistory('No commands need recovery', 'system');
            return;
        }
        
        // Pick a random command and replica to start recovery
        const cmdId = candidates[Math.floor(Math.random() * candidates.length)];
        const replicaId = Math.floor(Math.random() * this.NUM_REPLICAS);
        
        if (!this.isReplicaConnected(replicaId)) {
            this.addToHistory(`Cannot start recovery on disconnected Replica ${replicaId}`, 'system');
            return;
        }
        
        this.addToHistory(`Replica ${replicaId} starting recovery for ${cmdId}`, cmdId);
        this.initiateRecovery(replicaId, cmdId);
    }
    
    initiateRecovery(replicaId, commandId) {
        if (!this.recovered[replicaId]) {
            this.recovered[replicaId] = {};
        }
        if (!this.recovered[replicaId][commandId]) {
            this.recovered[replicaId][commandId] = 0;
        }
        
        if (this.recovered[replicaId][commandId] >= 2) {
            this.addToHistory(`Replica ${replicaId} already recovered ${commandId} twice`, commandId);
            return;
        }
        
        this.recovered[replicaId][commandId]++;
        
        // Calculate new ballot
        const currentBal = this.bal[replicaId][commandId] || 0;
        const newBal = currentBal === 0 ? replicaId : currentBal + this.NUM_REPLICAS;
        
        this.bal[replicaId][commandId] = newBal;
        
        // Send Recover messages to all replicas
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            if (this.isReplicaConnected(r)) {
                this.addMessageWithRandomDelay({
                    type: 'Recover',
                    from: replicaId,
                    to: r,
                    commandId: commandId,
                    bal: newBal
                });
            }
        }
        
        this.addToHistory(`Replica ${replicaId} sent Recover for ${commandId} with ballot ${newBal}`, commandId);
        this.updateUI();
    }
    
    submitCommand() {
        const replicaId = parseInt(document.getElementById('replica-select').value);
        const commandName = document.getElementById('command-input').value.trim();
        const conflictsInput = document.getElementById('conflicts-input').value.trim();
        
        if (!commandName) {
            alert('Please enter a command name');
            return;
        }
        
        if (!this.isReplicaConnected(replicaId)) {
            alert(`Replica ${replicaId} is disconnected`);
            return;
        }
        
        const commandId = `cmd${this.commandCounter++}`;
        
        // Assign color to command
        this.getCommandColor(commandId);
        
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
        
        this.addToHistory(`Replica ${replicaId} submitted command ${commandName} (${commandId})`, commandId);
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
        
        // Send PreAccept messages to all replicas with random delays
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            if (this.isReplicaConnected(r)) {
                this.addMessageWithRandomDelay({
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
            this.addToHistory('No messages to process', 'system');
            return;
        }
        
        // Increment logical time
        this.currentTime += 1;
        
        // Process one message
        const msg = this.messages.shift();
        
        // Skip if recipient is disconnected
        if (!this.isReplicaConnected(msg.to)) {
            this.addToHistory(`Message dropped: Replica ${msg.to} is disconnected`, msg.commandId || 'system');
            this.updateUI();
            return;
        }
        
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
                this.addToHistory('All messages processed', 'system');
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
            case 'Recover':
                this.handleRecover(msg);
                break;
            case 'RecoverOK':
                this.handleRecoverOK(msg);
                break;
        }
    }
    
    handlePreAccept(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        this.addToHistory(`Replica ${r} received PreAccept for ${id} from Replica ${msg.from}`, id);
        
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
            
            if (!this.abal[r]) this.abal[r] = {};
            this.abal[r][id] = 0;
            
            // Send PreAcceptOK back to coordinator with random delay
            this.addMessageWithRandomDelay({
                type: 'PreAcceptOK',
                from: r,
                to: msg.from,
                commandId: id,
                dep: finalDeps,
                bal: msg.bal
            });
            
            this.addToHistory(`Replica ${r} pre-accepted ${msg.cmd} (${id}) with deps: ${Array.from(finalDeps).join(', ') || 'none'}`, id);
        }
    }
    
    handlePreAcceptOK(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        this.addToHistory(`Replica ${r} received PreAcceptOK for ${id} from Replica ${msg.from}`, id);
        
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
                // Fast path: send Commit with random delays
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    if (this.isReplicaConnected(replica)) {
                        this.addMessageWithRandomDelay({
                            type: 'Commit',
                            from: r,
                            to: replica,
                            commandId: id,
                            cmd: this.cmd[r][id],
                            dep: allDeps,
                            bal: 0
                        });
                    }
                }
                this.addToHistory(`Replica ${r} taking fast path for ${id}`, id);
            } else {
                // Slow path: send Accept with random delays
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    if (this.isReplicaConnected(replica)) {
                        this.addMessageWithRandomDelay({
                            type: 'Accept',
                            from: r,
                            to: replica,
                            commandId: id,
                            cmd: this.cmd[r][id],
                            dep: allDeps,
                            bal: 0
                        });
                    }
                }
                this.addToHistory(`Replica ${r} taking slow path for ${id}`, id);
            }
        }
    }
    
    handleAccept(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        this.addToHistory(`Replica ${r} received Accept for ${id} from Replica ${msg.from}`, id);
        
        if (!this.bal[r][id] || this.bal[r][id] <= msg.bal) {
            this.bal[r][id] = msg.bal;
            this.cmd[r][id] = msg.cmd;
            this.dep[r][id] = new Set(msg.dep);
            this.phase[r][id] = 'accepted';
            
            if (!this.abal[r]) this.abal[r] = {};
            this.abal[r][id] = msg.bal;
            
            // Send AcceptOK with random delay
            this.addMessageWithRandomDelay({
                type: 'AcceptOK',
                from: r,
                to: msg.from,
                commandId: id,
                bal: msg.bal
            });
            
            this.addToHistory(`Replica ${r} accepted ${msg.cmd} (${id})`, id);
        }
    }
    
    handleAcceptOK(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        this.addToHistory(`Replica ${r} received AcceptOK for ${id} from Replica ${msg.from}`, id);
        
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
            
            // Send Commit to all replicas with random delays
            for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                if (this.isReplicaConnected(replica)) {
                    this.addMessageWithRandomDelay({
                        type: 'Commit',
                        from: r,
                        to: replica,
                        commandId: id,
                        cmd: this.cmd[r][id],
                        dep: this.dep[r][id],
                        bal: msg.bal
                    });
                }
            }
            
            this.addToHistory(`Replica ${r} sending Commit for ${id}`, id);
        }
    }
    
    handleCommit(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        this.addToHistory(`Replica ${r} received Commit for ${id}`, id);
        
        this.cmd[r][id] = msg.cmd;
        this.dep[r][id] = new Set(msg.dep);
        this.phase[r][id] = 'committed';
        this.bal[r][id] = msg.bal;
        
        if (!this.abal[r]) this.abal[r] = {};
        this.abal[r][id] = msg.bal;
        
        this.addToHistory(`Replica ${r} committed ${msg.cmd} (${id})`, id);
    }
    
    handleRecover(msg) {
        const r = msg.to;
        const id = msg.commandId;
        const b = msg.bal;
        
        this.addToHistory(`Replica ${r} received Recover for ${id} from Replica ${msg.from}`, id);
        
        if (!this.bal[r][id] || this.bal[r][id] < b) {
            this.bal[r][id] = b;
            
            const abalValue = this.abal[r] && this.abal[r][id] ? this.abal[r][id] : 0;
            const cmdValue = this.cmd[r][id] || "Nop";
            const depValue = this.dep[r][id] || new Set();
            const initDepValue = this.initDep[r][id] || new Set();
            const phaseValue = this.phase[r][id] || "Initial";
            
            // Send RecoverOK with random delay
            this.addMessageWithRandomDelay({
                type: 'RecoverOK',
                from: r,
                to: msg.from,
                commandId: id,
                bal: b,
                abal: abalValue,
                cmd: cmdValue,
                dep: depValue,
                initDep: initDepValue,
                phase: phaseValue
            });
            
            this.addToHistory(`Replica ${r} sent RecoverOK for ${id}`, id);
        }
    }
    
    handleRecoverOK(msg) {
        const r = msg.to;
        const id = msg.commandId;
        const b = msg.bal;
        
        this.addToHistory(`Replica ${r} received RecoverOK for ${id} from Replica ${msg.from}`, id);
        
        if (this.bal[r][id] !== b) {
            return;
        }
        
        // Count RecoverOK messages
        const okMsgs = this.messages.filter(m => 
            m.type === 'RecoverOK' && m.to === r && m.commandId === id && m.bal === b
        );
        
        if (msg.type === 'RecoverOK' && msg.to === r && msg.commandId === id && msg.bal === b) {
            okMsgs.push(msg);
        }
        
        if (okMsgs.length >= this.QUORUM_SIZE) {
            // Remove processed RecoverOK messages
            this.messages = this.messages.filter(m => 
                !(m.type === 'RecoverOK' && m.to === r && m.commandId === id && m.bal === b)
            );
            
            // Find message with highest abal
            let maxAbal = -1;
            let maxAbalMsgs = [];
            
            for (const m of okMsgs) {
                if (m.abal > maxAbal) {
                    maxAbal = m.abal;
                    maxAbalMsgs = [m];
                } else if (m.abal === maxAbal) {
                    maxAbalMsgs.push(m);
                }
            }
            
            // Check if any replica has committed
            const committedMsg = maxAbalMsgs.find(m => m.phase === 'committed');
            if (committedMsg) {
                // Send Commit to all replicas
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    if (this.isReplicaConnected(replica)) {
                        this.addMessageWithRandomDelay({
                            type: 'Commit',
                            from: r,
                            to: replica,
                            commandId: id,
                            cmd: committedMsg.cmd,
                            dep: committedMsg.dep,
                            bal: b
                        });
                    }
                }
                this.addToHistory(`Recovery: Replica ${r} found committed value for ${id}`, id);
                return;
            }
            
            // Check if any replica has accepted
            const acceptedMsg = maxAbalMsgs.find(m => m.phase === 'accepted');
            if (acceptedMsg) {
                // Send Accept to all replicas
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    if (this.isReplicaConnected(replica)) {
                        this.addMessageWithRandomDelay({
                            type: 'Accept',
                            from: r,
                            to: replica,
                            commandId: id,
                            cmd: acceptedMsg.cmd,
                            dep: acceptedMsg.dep,
                            bal: b
                        });
                    }
                }
                this.addToHistory(`Recovery: Replica ${r} found accepted value for ${id}`, id);
                return;
            }
            
            // Check if initial coordinator responded
            const coordMsg = okMsgs.find(m => m.from === this.initCoord[id]);
            if (coordMsg) {
                // Send Accept with Nop
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    if (this.isReplicaConnected(replica)) {
                        this.addMessageWithRandomDelay({
                            type: 'Accept',
                            from: r,
                            to: replica,
                            commandId: id,
                            cmd: "Nop",
                            dep: new Set(),
                            bal: b
                        });
                    }
                }
                this.addToHistory(`Recovery: Replica ${r} using Nop for ${id}`, id);
                return;
            }
            
            // Try fast-path recovery
            const preacceptedMsgs = maxAbalMsgs.filter(m => 
                m.phase === 'preaccepted' && this.setsEqual(m.dep, m.initDep)
            );
            
            if (preacceptedMsgs.length >= this.NUM_REPLICAS - this.FAST_QUORUM_SIZE + okMsgs.length) {
                const msg0 = preacceptedMsgs[0];
                // Send Accept with recovered value
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    if (this.isReplicaConnected(replica)) {
                        this.addMessageWithRandomDelay({
                            type: 'Accept',
                            from: r,
                            to: replica,
                            commandId: id,
                            cmd: msg0.cmd,
                            dep: msg0.dep,
                            bal: b
                        });
                    }
                }
                this.addToHistory(`Recovery: Replica ${r} recovered ${id} via fast-path`, id);
            } else {
                // Default to Nop
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    if (this.isReplicaConnected(replica)) {
                        this.addMessageWithRandomDelay({
                            type: 'Accept',
                            from: r,
                            to: replica,
                            commandId: id,
                            cmd: "Nop",
                            dep: new Set(),
                            bal: b
                        });
                    }
                }
                this.addToHistory(`Recovery: Replica ${r} defaulting to Nop for ${id}`, id);
            }
        }
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
        // Deprecated - now using history
        this.addToHistory(message, 'system');
    }
    
    updateUI() {
        // Update message queue count
        document.getElementById('queue-count').textContent = this.messages.length;
        
        // Update each replica's display
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            this.updateReplicaDisplay(r);
            this.drawDependencyGraph(r);
        }
        
        // Update disconnected replica styling
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            const replicaEl = document.querySelector(`.replica[data-replica="${r}"]`);
            const disconnectBtn = document.getElementById(`disconnect-btn-${r}`);
            if (replicaEl) {
                if (this.disconnectedReplicas.has(r)) {
                    replicaEl.classList.add('disconnected');
                    if (disconnectBtn) disconnectBtn.textContent = 'Reconnect';
                } else {
                    replicaEl.classList.remove('disconnected');
                    if (disconnectBtn) disconnectBtn.textContent = 'Disconnect';
                }
            }
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
