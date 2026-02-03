# EPaxos Protocol Animation

This directory contains an interactive JavaScript animation of the Egalitarian Paxos (EPaxos) consensus protocol, based on the TLA+ specification in `EPaxosRecovery/EPaxosCommitWithRecovery.tla`.

## Features

- **5 Replicas**: Visualize the protocol running across 5 replica nodes
- **Dependency Graphs**: Each replica displays its local view of the dependency graph
- **Interactive Command Submission**: Submit commands with configurable conflicts
- **Step-by-step Execution**: Step through the protocol or run continuously
- **Phase Visualization**: See commands progress through PreAccept, Accept, and Commit phases

## How to Use

### Opening the Animation

Simply open `index.html` in a web browser. No build step or server is required.

```bash
# From the animation directory
open index.html
# or
firefox index.html
# or
google-chrome index.html
```

### Submitting Commands

1. **Select a Replica**: Choose which replica will initiate the command
2. **Enter Command Name**: Type a command identifier (e.g., "A", "B", "cmd1")
3. **Specify Conflicts**: (Optional) List commands that conflict with this one, separated by commas
4. **Click Submit**: The protocol will begin processing the command

### Animation Controls

- **Step**: Process one message from the queue
- **Play**: Automatically process messages at the configured speed
- **Pause**: Stop automatic processing
- **Reset**: Clear all state and start over
- **Speed Slider**: Adjust animation speed (0.5s to 3.0s per step)

## Protocol Overview

EPaxos is a leaderless consensus protocol that provides:
- **Agreement**: All replicas commit the same command with the same dependencies
- **Visibility**: Conflicting commands appear in each other's dependency sets
- **Low Latency**: Commands can commit in one round trip in the common case (fast path)

### Protocol Phases

1. **PreAccept**: Coordinator sends command to all replicas with initial dependencies
2. **PreAcceptOK**: Replicas respond with their local conflict information
3. **Fast Commit** (if possible): Direct commit when fast quorum agrees on dependencies
4. **Accept** (slow path): Coordinator sends updated dependencies for acceptance
5. **AcceptOK**: Replicas acknowledge acceptance
6. **Commit**: Final commit message sent to all replicas

## Conflict Handling

Commands can be marked as conflicting with other commands. When you submit a command:
- Specify which existing commands it conflicts with
- The protocol will automatically add these as dependencies
- Dependency graphs will show arrows from commands to their dependencies

### Example Scenarios

**Scenario 1: Non-conflicting Commands**
1. Submit command "A" (no conflicts)
2. Submit command "B" (no conflicts)
- Both commands have empty dependency sets
- Both can commit via fast path

**Scenario 2: Conflicting Commands**
1. Submit command "A" (no conflicts)
2. Submit command "B" conflicts with "A"
- B's dependency set includes A
- Replicas update dependencies accordingly

**Scenario 3: Complex Dependencies**
1. Submit "A" (no conflicts)
2. Submit "B" conflicts with "A"
3. Submit "C" conflicts with "B"
- C depends on B, B depends on A
- Dependency graph shows the chain

## Implementation Details

The implementation follows the TLA+ specification closely:

- **Quorum Size**: 3 out of 5 replicas (tolerates 2 failures)
- **Fast Quorum Size**: 4 out of 5 replicas (for fast path commits)
- **Message Types**: PreAccept, PreAcceptOK, Accept, AcceptOK, Commit
- **State**: Each replica maintains ballot numbers, phases, commands, and dependencies

## Files

- `index.html`: Main HTML structure
- `style.css`: Styling and layout
- `epaxos.js`: Protocol implementation and visualization logic
- `README.md`: This file

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari

## Educational Use

This animation is designed to help understand:
- How EPaxos differs from traditional Paxos (no single leader)
- The role of dependency tracking in leaderless consensus
- Fast path vs slow path commit
- Quorum-based decision making
