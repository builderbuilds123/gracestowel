# Agent Workspace Setup

## Agent Type

Expert

## Workspace Configuration

Complete sidecar structure created for Expert agent SRE.

## Setup Elements

- **memories.md** - Persistent memory for past interactions, incidents, patterns
- **instructions.md** - Private protocols, directives, communication guidelines
- **knowledge/README.md** - Knowledge base documentation
- **knowledge/infrastructure-patterns.md** - Infrastructure patterns storage
- **knowledge/incident-history.md** - Incident history documentation

## Location

```
.bmad/custom/src/agents/sre/
├── sre.agent.yaml
└── sre-sidecar/
    ├── memories.md
    ├── instructions.md
    └── knowledge/
        ├── README.md
        ├── infrastructure-patterns.md
        └── incident-history.md
```

## Workspace Features

- Agent loads all sidecar files on activation
- Persistent memory across sessions
- Expandable knowledge base
- Domain-restricted file access (sidecar only)
