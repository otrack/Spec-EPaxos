// EPaxos Protocol Visualization
// Based on EPaxosCommitWithRecovery.tla specification

class EPaxosSimulator {
    constructor() {
        this.NUM_REPLICAS = 5;
        this.QUORUM_SIZE = 3; // N - F where N=5, F=2
        this.FAST_QUORUM_SIZE = 4; // N - E where E=1
        this.MAX_MESSAGE_DELAY = 200; // Maximum random network delay in ms
        this.MAX_VISIBLE_HISTORY_ENTRIES = 15; // Number of history entries to display
        this.asynchronousMode = false; // When true, extreme message delivery randomness
        
        // Protocol state (similar to TLA+ variables)
        this.bal = {}; // ballot number per replica per command
        this.phase = {}; // phase per replica per command
        this.cmd = {}; // command payload per replica per command
        this.initCmd = {}; // initial command payload received in PreAccept
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
        
        // Message timeline tracking
        this.messageTimeline = [];
        this.timelineAnimationId = 0;
        
        // Animation state
        this.isPlaying = false;
        this.speed = 1500;
        this.playInterval = null;
        this.currentTime = 0; // Logical time for message delivery
        
        // Replica disconnection state
        this.disconnectedReplicas = new Set();
        
        // Active message animations
        this.activeMessageAnimations = [];
        
        // Tooltip element
        this.tooltip = null;
        
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
            this.initCmd[r] = {};
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
        this.initCmd = {};
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
        
        // Asynchronous mode checkbox
        const asyncCheckbox = document.getElementById('async-mode-checkbox');
        if (asyncCheckbox) {
            asyncCheckbox.addEventListener('change', (e) => {
                this.asynchronousMode = e.target.checked;
                this.addToHistory(`Asynchronous mode ${this.asynchronousMode ? 'enabled' : 'disabled'}`, 'system');
            });
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
    
    addToHistory(message, commandId = null, msgDetails = null) {
        const timestamp = new Date().toLocaleTimeString();
        const color = commandId && commandId !== 'system' ? this.getCommandColor(commandId) : '#666';
        
        // If message details provided, format them
        let fullMessage = message;
        if (msgDetails) {
            const details = this.formatMessageDetails(msgDetails);
            fullMessage = `${message} ${details}`;
        }
        
        this.executionHistory.push({ timestamp, message: fullMessage, commandId, color });
        this.updateHistoryDisplay();
    }
    
    formatMessageDetails(msg) {
        if (!msg) return '';
        
        const parts = [];
        parts.push(`{type: ${msg.type}`);
        if (msg.from !== undefined) parts.push(`from: R${msg.from}`);
        if (msg.to !== undefined) parts.push(`to: R${msg.to}`);
        if (msg.cmd) parts.push(`cmd: "${msg.cmd}"`);
        if (msg.bal !== undefined) parts.push(`bal: ${msg.bal}`);
        if (msg.abal !== undefined) parts.push(`abal: ${msg.abal}`);
        if (msg.dep) {
            const depStr = msg.dep instanceof Set ? Array.from(msg.dep).join(',') : msg.dep;
            parts.push(`dep: [${depStr || 'none'}]`);
        }
        parts.push('}');
        
        return parts.join(', ');
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
        
        // Show last MAX_VISIBLE_HISTORY_ENTRIES entries
        const recentHistory = this.executionHistory.slice(-this.MAX_VISIBLE_HISTORY_ENTRIES);
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
        // Add random network delay (0-MAX_MESSAGE_DELAY ms simulation time)
        // Each message gets an independent random delay
        // In asynchronous mode, use much wider spread of delays
        let delay;
        if (this.asynchronousMode) {
            // Asynchronous mode: messages arrive over MANY rounds
            // Random delay between 0 and 50 rounds (much larger spread)
            // This ensures different replicas receive messages in different rounds
            delay = Math.random() * 50;
        } else {
            // Synchronous mode: small randomness within same round
            delay = Math.random() * this.MAX_MESSAGE_DELAY / 1000; // Convert ms to rounds (0-0.2 rounds)
        }
        const deliveryTime = this.currentTime + delay;
        
        // Deep clone the message to avoid mutation issues
        // Need to handle Set objects specially
        const msgWithDelay = {
            ...msg,
            dep: msg.dep ? new Set(msg.dep) : undefined,
            deliveryTime: deliveryTime
        };
        this.messages.push(msgWithDelay);
        
        // Sort messages by delivery time to simulate network randomization
        this.messages.sort((a, b) => (a.deliveryTime || 0) - (b.deliveryTime || 0));
    }
    
    updateRecoveryDropdown() {
        const dropdown = document.getElementById('recovery-command-select');
        if (!dropdown) return;
        
        // Find commands that need recovery
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
                const cmdName = this.cmd[this.initCoord[cmdId]][cmdId] || cmdId;
                candidates.push({ id: cmdId, name: cmdName });
            }
        }
        
        // Update dropdown
        dropdown.innerHTML = '<option value="">-- Select command --</option>';
        for (const candidate of candidates) {
            const option = document.createElement('option');
            option.value = candidate.id;
            option.textContent = `${candidate.name} (${candidate.id})`;
            dropdown.appendChild(option);
        }
    }
    
    startRecovery() {
        const dropdown = document.getElementById('recovery-command-select');
        const selectedCmdId = dropdown ? dropdown.value : '';
        
        if (!selectedCmdId) {
            alert('Please select a command to recover');
            return;
        }
        
        // Pick a random connected replica to start recovery
        const connectedReplicas = [];
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            if (this.isReplicaConnected(r)) {
                connectedReplicas.push(r);
            }
        }
        
        if (connectedReplicas.length === 0) {
            this.addToHistory('No connected replicas available for recovery', 'system');
            return;
        }
        
        const replicaId = connectedReplicas[Math.floor(Math.random() * connectedReplicas.length)];
        
        this.addToHistory(`Replica ${replicaId} starting recovery for ${selectedCmdId}`, selectedCmdId);
        this.initiateRecovery(replicaId, selectedCmdId);
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
                const recoverMsg = {
                    type: 'Recover',
                    from: replicaId,
                    to: r,
                    commandId: commandId,
                    bal: newBal
                };
                this.addMessageWithRandomDelay(recoverMsg);
                this.trackMessageTimeline(recoverMsg);
            }
        }
        
        this.addToHistory(`Replica ${replicaId} sent Recover for ${commandId} with ballot ${newBal} [bal=${newBal}]`, commandId);
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
        // Each message gets a separate copy with independent delay
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            if (this.isReplicaConnected(r)) {
                // Create a fresh message object for each recipient
                const msg = {
                    type: 'PreAccept',
                    from: replicaId,
                    to: r,
                    commandId: commandId,
                    cmd: commandName,
                    dep: new Set(initialDeps), // Fresh copy of deps for this message
                    bal: 0
                };
                this.addMessageWithRandomDelay(msg);
                this.trackMessageTimeline(msg);
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
        
        // Advance logical time to next message's delivery time
        // This ensures time progresses realistically in the simulation
        const nextMsg = this.messages[0];
        if (nextMsg.deliveryTime) {
            this.currentTime = nextMsg.deliveryTime;
        } else {
            this.currentTime += 1;
        }
        
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
        
        this.addToHistory(`Replica ${r} received PreAccept for ${id} from Replica ${msg.from}`, id, msg);
        
        // Initialize if needed
        if (!this.phase[r][id] || this.phase[r][id] === 'Initial') {
            // Store command and initial deps
            this.cmd[r][id] = msg.cmd;
            this.initCmd[r][id] = msg.cmd; // Store initial command received in PreAccept
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
            const okMsg = {
                type: 'PreAcceptOK',
                from: r,
                to: msg.from,
                commandId: id,
                dep: finalDeps,
                bal: msg.bal
            };
            this.addMessageWithRandomDelay(okMsg);
            this.trackMessageTimeline(okMsg);
            
            this.addToHistory(`Replica ${r} pre-accepted ${msg.cmd} (${id}) [bal=${msg.bal}] with deps: ${Array.from(finalDeps).join(', ') || 'none'}`, id);
        }
    }
    
    handlePreAcceptOK(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        this.addToHistory(`Replica ${r} received PreAcceptOK for ${id} from Replica ${msg.from} [bal=${msg.bal}]`, id, msg);
        
        // Check if we're the coordinator and in preaccepted phase
        if (this.phase[r][id] !== 'preaccepted' || this.initCoord[id] !== r) {
            return;
        }
        
        // Put the message back in the queue temporarily for quorum counting
        // (it was removed by step() before this handler was called)
        this.messages.push(msg);
        
        // Count unique replicas that have sent PreAcceptOK for this command
        const okSenders = new Set();
        const okMsgs = [];
        for (const m of this.messages) {
            if (m.type === 'PreAcceptOK' && m.to === r && m.commandId === id) {
                okSenders.add(m.from);
                okMsgs.push(m);
            }
        }
        
        // Check if we have a quorum
        if (okSenders.size >= this.QUORUM_SIZE) {
            // Union all dependencies
            const allDeps = new Set();
            for (const m of okMsgs) {
                if (m.dep) {
                    for (const dep of m.dep) {
                        allDeps.add(dep);
                    }
                }
            }
            
            // Check for fast path (fast quorum + all same deps as initial)
            const initialDeps = this.initDep[r] && this.initDep[r][id] ? this.initDep[r][id] : new Set();
            const canFastCommit = okSenders.size >= this.FAST_QUORUM_SIZE &&
                okMsgs.every(m => this.setsEqual(m.dep, initialDeps));
            
            // Remove all processed PreAcceptOK messages from queue
            this.messages = this.messages.filter(m => 
                !(m.type === 'PreAcceptOK' && m.to === r && m.commandId === id)
            );
            
            if (canFastCommit) {
                // Fast path: send Commit with random delays
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    if (this.isReplicaConnected(replica)) {
                        const commitMsg = {
                            type: 'Commit',
                            from: r,
                            to: replica,
                            commandId: id,
                            cmd: this.cmd[r][id],
                            dep: allDeps,
                            bal: 0
                        };
                        this.addMessageWithRandomDelay(commitMsg);
                        this.trackMessageTimeline(commitMsg);
                    }
                }
                this.addToHistory(`Replica ${r} taking fast path for ${id}`, id);
            } else {
                // Slow path: send Accept with random delays
                for (let replica = 0; replica < this.NUM_REPLICAS; replica++) {
                    if (this.isReplicaConnected(replica)) {
                        const acceptMsg = {
                            type: 'Accept',
                            from: r,
                            to: replica,
                            commandId: id,
                            cmd: this.cmd[r][id],
                            dep: allDeps,
                            bal: 0
                        };
                        this.addMessageWithRandomDelay(acceptMsg);
                        this.trackMessageTimeline(acceptMsg);
                    }
                }
                this.addToHistory(`Replica ${r} taking slow path for ${id}`, id);
            }
        } else {
            // Not enough responses yet, remove the message we temporarily added
            this.messages = this.messages.filter(m => m !== msg);
        }
    }
    
    handleAccept(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        this.addToHistory(`Replica ${r} received Accept for ${id} from Replica ${msg.from}`, id, msg);
        
        if (!this.bal[r][id] || this.bal[r][id] <= msg.bal) {
            this.bal[r][id] = msg.bal;
            this.cmd[r][id] = msg.cmd;
            
            // Set initCmd if not already set
            if (!this.initCmd[r][id]) {
                this.initCmd[r][id] = msg.cmd;
            }
            
            this.dep[r][id] = new Set(msg.dep);
            this.phase[r][id] = 'accepted';
            
            if (!this.abal[r]) this.abal[r] = {};
            this.abal[r][id] = msg.bal;
            
            // Send AcceptOK with random delay
            const okMsg = {
                type: 'AcceptOK',
                from: r,
                to: msg.from,
                commandId: id,
                bal: msg.bal
            };
            this.addMessageWithRandomDelay(okMsg);
            this.trackMessageTimeline(okMsg);
            
            this.addToHistory(`Replica ${r} accepted ${msg.cmd} (${id}) [bal=${msg.bal}]`, id);
        }
    }
    
    handleAcceptOK(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        this.addToHistory(`Replica ${r} received AcceptOK for ${id} from Replica ${msg.from}`, id, msg);
        
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
                    const commitMsg = {
                        type: 'Commit',
                        from: r,
                        to: replica,
                        commandId: id,
                        cmd: this.cmd[r][id],
                        dep: this.dep[r][id],
                        bal: msg.bal
                    };
                    this.addMessageWithRandomDelay(commitMsg);
                    this.trackMessageTimeline(commitMsg);
                }
            }
            
            this.addToHistory(`Replica ${r} sending Commit for ${id} [bal=${msg.bal}]`, id);
        }
    }
    
    handleCommit(msg) {
        const r = msg.to;
        const id = msg.commandId;
        
        this.addToHistory(`Replica ${r} received Commit for ${id} [bal=${msg.bal}]`, id, msg);
        
        this.cmd[r][id] = msg.cmd;
        
        // Set initCmd if not already set
        if (!this.initCmd[r][id]) {
            this.initCmd[r][id] = msg.cmd;
        }
        
        this.dep[r][id] = new Set(msg.dep);
        this.phase[r][id] = 'committed';
        this.bal[r][id] = msg.bal;
        
        if (!this.abal[r]) this.abal[r] = {};
        this.abal[r][id] = msg.bal;
        
        this.addToHistory(`Replica ${r} committed ${msg.cmd} (${id}) [bal=${msg.bal}]`, id);
    }
    
    handleRecover(msg) {
        const r = msg.to;
        const id = msg.commandId;
        const b = msg.bal;
        
        this.addToHistory(`Replica ${r} received Recover for ${id} from Replica ${msg.from}`, id, msg);
        
        if (!this.bal[r][id] || this.bal[r][id] < b) {
            this.bal[r][id] = b;
            
            const abalValue = this.abal[r] && this.abal[r][id] ? this.abal[r][id] : 0;
            const cmdValue = this.cmd[r][id] || "Nop";
            const depValue = this.dep[r][id] || new Set();
            const initDepValue = this.initDep[r][id] || new Set();
            const phaseValue = this.phase[r][id] || "Initial";
            
            // Send RecoverOK with random delay
            const recoverOKMsg = {
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
            };
            this.addMessageWithRandomDelay(recoverOKMsg);
            this.trackMessageTimeline(recoverOKMsg);
            
            this.addToHistory(`Replica ${r} sent RecoverOK for ${id} [bal=${b}]`, id);
        }
    }
    
    handleRecoverOK(msg) {
        const r = msg.to;
        const id = msg.commandId;
        const b = msg.bal;
        
        this.addToHistory(`Replica ${r} received RecoverOK for ${id} from Replica ${msg.from}`, id, msg);
        
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
            
            if (this.isValidFastPathRecoveryQuorum(preacceptedMsgs.length, okMsgs.length)) {
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
    
    isValidFastPathRecoveryQuorum(preacceptedCount, okMsgCount) {
        // Check if we have enough preaccepted messages for fast-path recovery
        // Formula: preacceptedCount >= N - F_fast + okMsgCount
        return preacceptedCount >= this.NUM_REPLICAS - this.FAST_QUORUM_SIZE + okMsgCount;
    }
    
    trackMessageTimeline(msg) {
        // Track message for timeline visualization
        const timelineEntry = {
            id: this.timelineAnimationId++,
            type: msg.type,
            from: msg.from,
            to: msg.to,
            commandId: msg.commandId,
            timestamp: Date.now(),
            color: this.getCommandColor(msg.commandId || 'system')
        };
        
        this.messageTimeline.push(timelineEntry);
        
        // Keep only last 20 messages for performance
        if (this.messageTimeline.length > 20) {
            this.messageTimeline.shift();
        }
        
        this.updateMessageTimeline();
    }
    
    updateMessageTimeline() {
        const timelineEl = document.getElementById('message-timeline');
        if (!timelineEl) return;
        
        // Show recent messages in chronological order
        const recentMessages = this.messageTimeline.slice(-20);
        
        if (recentMessages.length === 0) {
            timelineEl.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No messages yet - submit commands to see the protocol in action</div>';
            return;
        }
        
        // Create SVG for timeline visualization
        const width = timelineEl.clientWidth || 800;
        const height = Math.max(400, recentMessages.length * 30 + 100);
        const replicaSpacing = width / (this.NUM_REPLICAS + 1);
        const timeStep = 25; // Vertical space per time unit
        
        let svg = `<svg width="${width}" height="${height}" style="background: white;">`;
        
        // Draw vertical lifelines for each replica
        for (let r = 0; r < this.NUM_REPLICAS; r++) {
            const x = replicaSpacing * (r + 1);
            svg += `
                <line x1="${x}" y1="30" x2="${x}" y2="${height - 10}" 
                      stroke="#ddd" stroke-width="2" stroke-dasharray="5,5"/>
                <text x="${x}" y="20" text-anchor="middle" fill="#667eea" font-weight="bold">R${r}</text>
            `;
        }
        
        // Draw messages as actions (dots) and arrows
        let currentY = 50;
        recentMessages.forEach((msg, idx) => {
            const fromX = replicaSpacing * (msg.from + 1);
            const toX = replicaSpacing * (msg.to + 1);
            const y = currentY + idx * timeStep;
            
            // Draw action dot at sender
            svg += `
                <circle cx="${fromX}" cy="${y}" r="5" fill="${msg.color}" stroke="#333" stroke-width="1">
                    <title>${msg.type} sent by Replica ${msg.from} (${msg.commandId})</title>
                </circle>
            `;
            
            // Draw arrow to receiver if different replica
            if (msg.from !== msg.to) {
                const arrowY = y + 10;
                svg += `
                    <line x1="${fromX}" y1="${y}" x2="${toX}" y2="${arrowY}" 
                          stroke="${msg.color}" stroke-width="2" opacity="0.6" marker-end="url(#arrowhead-${idx})"/>
                    <defs>
                        <marker id="arrowhead-${idx}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                            <polygon points="0 0, 10 3, 0 6" fill="${msg.color}" opacity="0.6"/>
                        </marker>
                    </defs>
                `;
                
                // Draw receive dot
                svg += `
                    <circle cx="${toX}" cy="${arrowY}" r="4" fill="white" stroke="${msg.color}" stroke-width="2">
                        <title>${msg.type} received by Replica ${msg.to} (${msg.commandId})</title>
                    </circle>
                `;
            }
            
            // Add message type label
            const labelX = (fromX + toX) / 2;
            const labelY = y + (msg.from !== msg.to ? 5 : -8);
            svg += `
                <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="10" fill="#666">${msg.type}</text>
            `;
        });
        
        svg += '</svg>';
        timelineEl.innerHTML = svg;
    }
    
    drawMessageArrow(msg, opacity = 1) {
        // This method is no longer needed with SVG timeline
        // Kept for backward compatibility
    }
    
    updateUI() {
        // Update message queue count
        document.getElementById('queue-count').textContent = this.messages.length;
        
        // Update recovery dropdown
        this.updateRecoveryDropdown();
        
        // Update message timeline
        this.updateMessageTimeline();
        
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
        
        // Draw nodes with hover support
        const self = this;
        
        // Remove old event listener if exists
        canvas.onmousemove = null;
        canvas.onmouseout = null;
        
        // Add mouse move handler for tooltips
        canvas.onmousemove = function(e) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            let hoveredCmd = null;
            for (const cmdId of commands) {
                const pos = positions[cmdId];
                const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                if (dist < 15) {
                    hoveredCmd = cmdId;
                    break;
                }
            }
            
            if (hoveredCmd) {
                self.showCommandTooltip(replicaId, hoveredCmd, e.clientX, e.clientY);
                canvas.style.cursor = 'pointer';
            } else {
                self.hideCommandTooltip();
                canvas.style.cursor = 'default';
            }
        };
        
        canvas.onmouseout = function() {
            self.hideCommandTooltip();
        };
        
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
    
    showCommandTooltip(replicaId, cmdId, x, y) {
        // Remove existing tooltip
        this.hideCommandTooltip();
        
        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'command-tooltip';
        tooltip.id = 'command-tooltip';
        
        // Get command state
        const phase = this.phase[replicaId][cmdId] || 'Initial';
        const cmd = this.cmd[replicaId][cmdId] || 'N/A';
        const initCmd = this.initCmd && this.initCmd[replicaId] && this.initCmd[replicaId][cmdId] || 'N/A';
        const bal = this.bal[replicaId] && this.bal[replicaId][cmdId] !== undefined ? this.bal[replicaId][cmdId] : 'N/A';
        const abal = this.abal[replicaId] && this.abal[replicaId][cmdId] !== undefined ? this.abal[replicaId][cmdId] : 'N/A';
        const dep = this.dep[replicaId][cmdId] ? Array.from(this.dep[replicaId][cmdId]).join(', ') || 'none' : 'none';
        const initDep = this.initDep[replicaId] && this.initDep[replicaId][cmdId] ? Array.from(this.initDep[replicaId][cmdId]).join(', ') || 'none' : 'none';
        
        tooltip.innerHTML = `
            <div class="tooltip-row"><span class="tooltip-label">Command ID:</span> ${cmdId}</div>
            <div class="tooltip-row"><span class="tooltip-label">phase[${cmdId}]:</span> ${phase}</div>
            <div class="tooltip-row"><span class="tooltip-label">cmd[${cmdId}]:</span> ${cmd}</div>
            <div class="tooltip-row"><span class="tooltip-label">initCmd[${cmdId}]:</span> ${initCmd}</div>
            <div class="tooltip-row"><span class="tooltip-label">bal[${cmdId}]:</span> ${bal}</div>
            <div class="tooltip-row"><span class="tooltip-label">abal[${cmdId}]:</span> ${abal}</div>
            <div class="tooltip-row"><span class="tooltip-label">dep[${cmdId}]:</span> ${dep}</div>
            <div class="tooltip-row"><span class="tooltip-label">initDep[${cmdId}]:</span> ${initDep}</div>
        `;
        
        tooltip.style.left = (x + 10) + 'px';
        tooltip.style.top = (y + 10) + 'px';
        
        document.body.appendChild(tooltip);
        this.tooltip = tooltip;
    }
    
    hideCommandTooltip() {
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
    }
}

// Initialize the simulator when the page loads
let simulator;
document.addEventListener('DOMContentLoaded', () => {
    simulator = new EPaxosSimulator();
});
