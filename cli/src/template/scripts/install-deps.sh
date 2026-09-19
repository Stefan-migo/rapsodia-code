#!/usr/bin/env bash
# ================================================================
# {PROJECT_NAME} — Install Dependencies
# ================================================================
set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║        Rapsodia — Installing Dependencies               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

check() {
  if [ $? -eq 0 ]; then echo "  ✓ $1"; else echo "  ✗ $1 — skipped (already installed)"; fi
}

# ── 1. Node.js ────────────────────────────────────────────────
echo "--- Node.js ---"
if command -v node &>/dev/null; then
  echo "  ✓ Node.js found ($(node --version))"
else
  echo "  ⚠ Node.js not found. Install from https://nodejs.org"
fi

# ── 2. Graphify ─────────────────────────────────────────────────
echo ""
echo "--- Graphify ---"
if {PYTHON_COMMAND} -c "import graphify" 2>/dev/null; then
  echo "  ✓ graphify already installed"
else
  echo "  Installing graphify..."
  pip install graphifyy 2>&1 | tail -1
fi

# ── 3. OpenCode Custom Tools ────────────────────────────────────
echo ""
echo "--- OpenCode Custom Tools ---"
if [ -d .opencode/tools ]; then
  if [ -f .opencode/tools/node_modules/.package-lock.json ]; then
    echo "  ✓ tools dependencies already installed"
  else
    echo "  Installing tools dependencies..."
    cd .opencode/tools && npm install --silent 2>&1 | tail -1 && cd ../..
    echo "  ✓ tools dependencies installed"
  fi
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Done. Run: opencode                                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
