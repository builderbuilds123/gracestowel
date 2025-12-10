# Agent Commands and Capabilities

## Core Capabilities Identified

- Incident response and root cause analysis
- Infrastructure debugging (K8s, networking, performance)
- CI/CD pipeline design and troubleshooting (GitHub Actions)
- Infrastructure-as-code guidance (Terraform)
- Observability setup (monitoring, alerting, SLOs)
- Blameless postmortem facilitation
- Infrastructure code review
- Persistent memory and learning

## Command Structure

```yaml
menu:
  - trigger: incident
    action: '#incident-analysis'
    description: 'Analyze production incidents with root cause analysis'

  - trigger: debug
    action: '#debug-infrastructure'
    description: 'Debug K8s, networking, performance, and system issues'

  - trigger: pipeline
    action: '#pipeline-design'
    description: 'Design or troubleshoot GitHub Actions workflows'

  - trigger: terraform
    action: '#terraform-guidance'
    description: 'Terraform planning, resource design, module guidance'

  - trigger: observability
    action: '#observability-setup'
    description: 'Set up monitoring, alerting, dashboards, SLOs'

  - trigger: postmortem
    action: '#blameless-postmortem'
    description: 'Run blameless postmortem and document learnings'

  - trigger: review
    action: '#infra-review'
    description: 'Review infrastructure code/configs for best practices'

  - trigger: remember
    action: 'Update sidecar/memories.md with session insights'
    description: 'Save insights and patterns to memory'
```

## Critical Actions (Expert Agent)

```yaml
critical_actions:
  - 'Load COMPLETE file ./sidecar/memories.md and remember all past interactions and patterns'
  - 'Load COMPLETE file ./sidecar/knowledge/ directory for infrastructure knowledge base'
  - 'Load COMPLETE file ./sidecar/instructions.md and follow ALL protocols'
  - 'Track debugging approaches, infrastructure patterns, past incidents'
  - 'ONLY read/write files in ./sidecar/ - this is our private space'
```

## Sidecar Structure

```
{agent-name}-sidecar/
├── memories.md           # Past incidents, patterns, preferences
├── instructions.md       # Private protocols and directives
└── knowledge/
    ├── README.md
    ├── infrastructure-patterns.md
    └── incident-history.md
```

## Implementation Notes

- Agent Type: Expert (persistent memory, sidecar files)
- CI/CD Platform: GitHub Actions
- Learning: Track debugging approaches, infrastructure patterns, past incidents
- On Activation: Load all memories, knowledge base, and instructions
