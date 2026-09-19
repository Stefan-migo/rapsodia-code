---
name: bootstrap
description: Complete intelligent project bootstrap. Pre-flight check → questionnaire → deep research → agent team architecture → project generation.
license: MIT
compatibility: opencode
metadata:
  workflow: setup
  audience: all agents
---

## What It Does
Transforms the generic Rapsodia template into a fully specialized, professional-grade project environment with custom primary agents, specialized subagent teams, MCP servers, and tools — all tailored to the project's tech stack, domain, and architecture.

## When to Load
- User types `/new-project`
- User says "start a new project"
- User says "adapt this system for my project"

---

## Phase 0 — Pre-flight Check

Before ANY questions, verify the system is functional. Run checks silently and report.

### 0.1 Check Essential Tools
```bash
node --version
```

### 0.2 Check Optional Tools
```bash
{PYTHON_COMMAND} -c "import graphify" 2>/dev/null && echo "graphify OK"
```

### 0.3 Report
Present findings.

---

## Phase 1 — Discovery: Structured Interview

Ask questions ONE AT A TIME. Wait for each answer.

### 1.1 Project Identity
- "What is the project name?"
- "Describe it in 1-2 sentences. What problem does it solve?"
- "What type?" (web app, mobile app, CLI tool, API, library, game, data pipeline, desktop app, SaaS platform, other)

### 1.2 Technical Context
- "What's your tech stack preference?"
  - Frontend: (React, Next.js, Vue, Svelte, none, other)
  - Backend: (Node/Express, Python/FastAPI, Go, Rust, Java/Spring, Ruby/Rails, .NET, other)
  - Database: (PostgreSQL, MySQL, MongoDB, SQLite, Redis, other)
  - Infrastructure: (Docker, Kubernetes, Vercel, AWS, Cloudflare, bare metal, other)

### 1.3 Domain & Industry
- "What domain does this belong to?"
- "Any compliance requirements?" (GDPR, HIPAA, PCI-DSS, SOC2, none)

### 1.4 Architecture Preferences
- "How many users do you expect?"
- "Any specific architecture preferences?"
- "What's your deployment target?"

### 1.5 Team & Workflow
- "How many developers will work on this?"
- "What's your preferred workflow?"
- "Any existing code or is this from scratch?"

### 1.6 References
- "Do you have any reference materials?"
- "Any brand guidelines or design preferences?"

---

## Phase 2 — Deep Research

After gathering context, spawn parallel research agents.

### 2.1 Tech Stack Validation
### 2.2 Architecture Recommendations
### 2.3 Industry & Competitor Research
### 2.4 Reference Analysis

---

## Phase 3 — Agent Team Architecture

Based on all research, propose a professional team structure.

---

## Phase 4 — Generate

### 4.1 Create Primary Agents
### 4.2 Create Specialized Subagents
### 4.3 Generate Project Files
### 4.4 Update opencode.json

---

## Phase 5 — Launch

Present the complete setup with agent team, MCP servers, and next steps.
