# Ralph Orchestrator Guide

Ralph Orchestrator is installed as a git submodule in `tools/ralph-orchestrator/`. It provides autonomous AI agent orchestration using the "Ralph Wiggum technique" - running AI agents in a loop until tasks are complete.

## Quick Start

```bash
# Run ralph from anywhere in the repo
./scripts/ralph run -p "Your task description here"

# Or create a PROMPT.md file
echo "# Task: Refactor auth module" > PROMPT.md
./scripts/ralph run
```

## Installation

Ralph orchestrator is installed as a git submodule:

```bash
# Clone submodule (if not already done)
git submodule update --init --recursive

# Set up Python environment (if needed)
cd tools/ralph-orchestrator
uv sync --python /opt/homebrew/opt/python@3.13/bin/python3.13
```

## Usage

### Basic Commands

```bash
# Initialize a new ralph project
./scripts/ralph init

# Check status
./scripts/ralph status

# Run orchestrator
./scripts/ralph run

# Clean workspace
./scripts/ralph clean
```

### Running Tasks

**Option 1: Inline Prompt**
```bash
./scripts/ralph run -p "Refactor the authentication module to use Medusa v2 patterns"
```

**Option 2: Prompt File**
```bash
# Create PROMPT.md
cat > PROMPT.md << 'EOF'
# Task: Refactor Authentication Module

Refactor apps/backend/src/modules/auth/ to use Medusa v2 patterns:
- Replace TransactionBaseService with MedusaService
- Replace @Inject with container.resolve()
- Update all tests

Success criteria:
- [ ] All services use MedusaService
- [ ] All tests passing
- [ ] TASK_COMPLETE
EOF

# Run ralph
./scripts/ralph run -a claude --max-iterations 50
```

### Configuration

Create `ralph.yml` at the root for default settings:

```yaml
agent: auto
prompt_file: PROMPT.md
max_iterations: 100
max_runtime: 14400
max_cost: 50.0
checkpoint_interval: 5
verbose: false
```

## AI Agent Integration

AI agents can delegate complex tasks to ralph orchestrator:

### Pattern: Agent Delegation

```python
# AI Agent creates detailed prompt and delegates
def delegate_to_ralph(task_description):
    prompt = f"""
    # Task: {task_description}
    
    ## Requirements
    {detailed_requirements}
    
    ## Success Criteria
    - [ ] All requirements met
    - [ ] Tests passing
    - [ ] TASK_COMPLETE
    """
    
    # Write prompt file
    with open("PROMPT.md", "w") as f:
        f.write(prompt)
    
    # Delegate to ralph
    subprocess.run(["./scripts/ralph", "run", "-a", "claude", "--max-iterations", "50"])
    
    # Review results
    review_changes()
```

### Use Cases

**1. Complex Refactoring**
- Agent identifies code patterns to refactor
- Creates detailed prompt with refactoring plan
- Ralph iteratively executes until complete

**2. Test Generation**
- Agent analyzes coverage gaps
- Creates prompt for comprehensive test suite
- Ralph generates tests iteratively

**3. Documentation**
- Agent identifies undocumented APIs
- Creates prompt for documentation
- Ralph generates docs iteratively

## When to Use Ralph

**Use Ralph Orchestrator when:**
- ✅ Task requires multiple iterations
- ✅ Task needs state persistence across iterations
- ✅ Task benefits from checkpointing/recovery
- ✅ Task has clear completion criteria
- ✅ Task is too complex for single execution

**Use Direct Agent Execution when:**
- ✅ Task completes in one iteration
- ✅ Task requires real-time interaction
- ✅ Task needs immediate feedback

## Cost Management

Ralph includes built-in cost controls:

```bash
# Set cost limit
./scripts/ralph run --max-cost 10.0

# Set iteration limit
./scripts/ralph run --max-iterations 30

# Set runtime limit (4 hours default)
./scripts/ralph run --max-runtime 7200  # 2 hours
```

**Typical Costs:**
- Simple tasks: $0.50 - $2.00
- Medium tasks: $2.00 - $10.00
- Complex tasks: $10.00 - $50.00+

## Safety Features

Ralph includes multiple safety mechanisms:

1. **Iteration Limit**: Default 100 iterations
2. **Runtime Limit**: Default 4 hours
3. **Cost Limit**: Default $50
4. **Completion Detection**: Stops on `- [x] TASK_COMPLETE` marker
5. **Loop Detection**: Stops on repetitive outputs (≥90% similar)
6. **Consecutive Failures**: Stops after 5 consecutive errors

## Workspace Structure

Ralph creates a `.agent/` directory in the current working directory:

```
.agent/
├── prompts/      # Prompt workspace
├── checkpoints/  # Checkpoint markers
├── metrics/      # Metrics data
├── plans/        # Planning documents
└── memory/       # Agent memory
```

## Updating Ralph Orchestrator

Since ralph is a git submodule, update it like this:

```bash
# Update to latest
cd tools/ralph-orchestrator
git checkout main
git pull origin main
cd ../..
git add tools/ralph-orchestrator
git commit -m "chore: update ralph-orchestrator submodule"

# Pin to specific version
cd tools/ralph-orchestrator
git checkout v1.2.0
cd ../..
git add tools/ralph-orchestrator
git commit -m "chore: pin ralph-orchestrator to v1.2.0"
```

## Troubleshooting

### Python Version Issues

If you see Python version errors, ensure you're using Python 3.13:

```bash
cd tools/ralph-orchestrator
uv sync --python /opt/homebrew/opt/python@3.13/bin/python3.13
```

### Agent Not Found

Ensure you have at least one AI agent configured:

```bash
# For Claude
export ANTHROPIC_API_KEY="sk-ant-..."

# For Gemini
export GOOGLE_API_KEY="..."
```

### Task Not Completing

- Check that prompt includes `- [x] TASK_COMPLETE` marker
- Review `.agent/metrics/` for errors
- Try different agent: `./scripts/ralph run -a gemini`

## Resources

- [Ralph Orchestrator Docs](https://mikeyobrien.github.io/ralph-orchestrator/)
- [GitHub Repository](https://github.com/mikeyobrien/ralph-orchestrator)
- [Quick Start Guide](https://mikeyobrien.github.io/ralph-orchestrator/quick-start/)

