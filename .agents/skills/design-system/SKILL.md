---
name: design-system
description: UI/UX design intelligence — generate consistent designs using DESIGN.md and design system rules
license: MIT
compatibility: pi
metadata:
  workflow: design
  audience: implementing agent
---

## What It Does
Provides design intelligence for generating professional UI/UX across platforms. Uses DESIGN.md as the source of truth.

## When to Load
- Building UI components or pages
- Implementing visual features
- Reviewing UI implementation
- Generating design system specifications

## Design Generation Process

### 1. Read DESIGN.md
The DESIGN.md file contains the project's design system:
- Color palette with semantic tokens
- Typography scale and font choices
- Component styling (buttons, cards, inputs, nav)
- Layout principles and spacing scale
- Depth and elevation rules
- Responsive breakpoints
- Do's and don'ts

### 2. Determine Product Context
Understand what you're building:
- Product type (SaaS, dashboard, landing page, mobile app)
- Target audience
- Platform (web, mobile, desktop)

### 3. Apply Design Rules
- Match visual style to product purpose
- Select appropriate color weighting
- Apply consistent spacing (4/8/12/16/24/32/48/64)
- Use proper typography hierarchy
- Respect accessibility (WCAG AA minimum)

### 4. Generate UI
- Use semantic HTML with Tailwind CSS
- Import DESIGN.md color tokens as CSS variables
- Apply typography from the type scale
- Include hover, focus, and active states
- Ensure responsive behavior at all breakpoints
- Use Lucide or Heroicons for icons (no emoji)

### 5. Validate
- Verify colors match DESIGN.md tokens
- Check spacing against the scale
- Confirm responsive breakpoints are covered
- Run accessibility check (contrast, focus, labels)
- Check against anti-patterns list

## Design Principles
- Consistency: Same components look the same everywhere
- Accessibility: Minimum WCAG AA, prefer AAA
- Performance: Optimize images, minimize CSS, lazy load
- Maintainability: Use CSS variables, keep components modular
