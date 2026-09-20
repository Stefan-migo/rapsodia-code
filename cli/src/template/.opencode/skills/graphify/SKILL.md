---
name: graphify
description: Knowledge graph integration — run graph extraction, interpret results, navigate via graph
license: MIT
compatibility: opencode
metadata:
  workflow: knowledge
  audience: all agents
---

## What It Does
Integrates Graphify knowledge graph extraction into the development workflow.

## When to Use Graphify

### Initial Codebase Understanding
When entering a new codebase, run graphify to build structural understanding:
```
/graphify .
```
This produces:
- `graphify-out/graph.html` — Interactive graph visualization
- `graphify-out/GRAPH_REPORT.md` — God nodes, communities, surprising connections
- `graphify-out/graph.json` — Persistent queryable graph

### After Significant Changes
When the codebase structure changes substantially:
```
/graphify . --update
```

### Focused Analysis
For specific areas:
```
/graphify ./packages/core
```

## How to Interpret Output

### GRAPH_REPORT.md
The key artifact. Read this first:
- **God Nodes**: Highest-degree concepts — what everything connects through
- **Communities**: Clusters of related code/docs
- **Surprising Connections**: Cross-domain links you wouldn't expect
- **Suggested Questions**: What the graph is uniquely positioned to answer
- **Token Benchmark**: How much context you saved vs reading raw files

### graph.json
The raw graph data. Uses tagged edges:
- `EXTRACTED` (1.0 confidence) — Found directly in source code (AST)
- `INFERRED` (0.0-1.0) — Reasonable inference by the LLM
- `AMBIGUOUS` — Flagged for review

### graph.html
Interactive visualization. Open in browser to explore communities, click nodes for details, search for specific concepts.

## MCP Integration
If graphify MCP server is running (via opencode.json config), agents can query the graph directly:
```
{PYTHON_COMMAND} -m graphify.serve graphify-out/graph.json
```

## Workflow Integration
1. **Bootstrap**: Run graphify on project start
2. **Read**: Review GRAPH_REPORT.md for structural overview
3. **Navigate**: Use graph to find relevant code areas
4. **Update**: Re-run when architecture changes significantly
5. **Wiki sync**: Save key graph insights to wiki/concepts/
