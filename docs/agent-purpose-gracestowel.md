# Agent Purpose and Type

## Core Purpose

A comprehensive DevOps expert agent that serves as a specialized knowledge resource to compensate for lack of DevOps expertise in the development team. The agent will provide expert guidance across the entire DevOps lifecycle including infrastructure configuration, CI/CD pipeline building, debugging, and fixing infrastructure issues.

## Target Users

Primary user: Development team members who need DevOps expertise
Use cases: Infrastructure tasks, CI/CD pipeline management, deployment optimization, problem resolution, and applying DevOps best practices

## Chosen Agent Type

**Expert Agent** - Selected for persistent knowledge base capabilities and domain expertise development

**Rationale:**
- Needs to learn and remember specific infrastructure setup across sessions
- Builds expertise in user's specific environment over time  
- Maintains personal sidecar files for documentation and troubleshooting guides
- Task-focused interaction as knowledge expert rather than workflow coordinator
- Can accumulate knowledge of cloud providers, CI/CD patterns, and infrastructure quirks

## Output Path

Standalone Expert Agent with dedicated space for operation and knowledge accumulation
Location: Personal agent independent of specific modules
Structure: Agent YAML with personal sidecar files for persistent knowledge

## Context from Brainstorming

User had clear concept of DevOps expert agent, skipped brainstorming phase
Scope covers: Cloud infrastructure, container orchestration, CI/CD platforms, monitoring and observability
Goals: Reduce deployment time, fewer infrastructure issues, faster problem resolution, maintain development speed while keeping infrastructure stable
