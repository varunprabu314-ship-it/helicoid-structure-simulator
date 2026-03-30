

# Helicoid Structure Simulator — Implementation Plan

## Overview
A premium, single-page engineering visualization tool for simulating helicoid building structures using Three.js. Design follows a Linear/Vercel-inspired dark aesthetic with precise color palette and typography.

## Design System
- **Background**: #0c0c0e, **Surface**: #111113, **Text**: #f0f0f0 / #666 / #333
- **Accent colors**: Sage green (#4a9e7f), Terracotta (#e05a3a), Amber (#c8973a)
- **Font**: Inter, max weight 500, monospaced numbers
- **No sci-fi aesthetics** — clean, minimal, 1px borders, generous whitespace

## Page Sections

### 1. Fixed Navbar
- Left: "HELICOID SIM" in 12px mono #333
- Right: Simulator · Research · About links
- Bottom border only, no background

### 2. Hero Section (full viewport)
- Centered: category label → 72px "Helicoid" title → subtitle → ghost CTA button
- "Open Simulator ↓" smooth-scrolls to canvas

### 3. Three.js Simulator (70vh canvas)
- **Scene**: PerspectiveCamera, ambient + directional + point lights, thin grid, auto-rotate + drag orbit
- **Building geometry**: `buildBuilding(params)` generates floor slabs with edge lines, helical/straight columns via TubeGeometry/CylinderGeometry
- **Modes**: Helicoid (twisted), Standard (straight), Split (side-by-side comparison)
- **Wind visualization**: Animated arrow pool approaching from -X, deflection/sway simulation
- **Stress map**: Color-coded floor slabs (green→amber→red) showing stress distribution
- **Proper disposal**: All geometries/materials disposed on rebuild

### 4. Floating Parameter Panel (bottom-left)
- Glass card with backdrop blur
- Controls: Floors slider, Twist/floor slider, Floor plate slider, Structure type toggles, Wind toggle + speed slider, Stress map toggle with gradient legend
- All minimal 2px sliders, 16ms debounced rebuilds

### 5. Floating Metrics Panel (bottom-right)
- 4 live-computed metrics: Wind resistance, Sway reduction, Stress distribution, Torsional stiffness
- Updates reactively with parameter changes

### 6. Research Cards Section
- 3-column grid (scrollable on mobile)
- Wind load / Seismic performance / Material efficiency with real-world examples

### 7. About Section
- Two-column layout explaining the engineering basis (Bouligand structure)

## Technical Approach
- Build entirely within the React project using a single `Index.tsx` page
- Three.js loaded via CDN (r128) with ref-based canvas management
- All Three.js logic in imperative JS within useEffect hooks
- Arrow pool pre-created, show/hide based on wind speed
- Resize handler for responsive canvas
- Mobile: panels stack below canvas, canvas 50vh

## Files to Create/Modify
- `src/pages/Index.tsx` — entire page (navbar, hero, simulator, research, about)
- `src/index.css` — add Inter font import + custom styles for sliders and panels
- `index.html` — add Three.js CDN script tag

