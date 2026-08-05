# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Typst simple-plot graph rendering** — the graph plugin now renders through the native Typst compiler using the `simple-plot` package instead of Plotly.js.
  - Math expressions (`x^2`, `sin(x)`, `sqrt(1 - x^2)`, ...) are translated to Typst lambdas automatically; domain-restricted functions produce proper curve gaps.
  - Curve labels are drawn inline on the plot with configurable position (0–1) and side (above/below/left/right/...).
  - Per-function options: stroke width, dashed strokes, sample count, and restricted domains.
  - Axis options: per-axis tick steps, minor grid, axis position (center/bottom/left/hidden), origin label, end ticks, and tick label size.
  - Spy-glass zoom insets (`zoom()`) with configurable region, position, magnification, lens shape, inset grid, and accent colour.
  - `zoom` template demonstrating the spy-glass inset.
- **Simplified zoom configuration** — the zoom inset now takes `center` (data coords), `size` (cm), `magnification`, and `at` placement (`"bottom-right"` presets or custom x/y data coords); legacy region-based zoom specs are converted automatically.
- **Curve-coloured labels** — function and data-trace labels render in the same colour as their curve.

### Changed
- Fixed the plot background colour: the `style` dict (background, axis, label and tick colours) is now actually emitted; dark backgrounds get high-contrast grids, text and label backdrops.
- The zoom inset's background now matches the plot background (`box-fill`), and is transparent when the plot background is transparent — previously the spy-glass inset always rendered a white box.
- Updating a selected plot now replaces the existing element in place instead of inserting a duplicate — repeated "Update" clicks keep replacing the same element, the rotation angle is preserved, and the element's file entry is overwritten (no orphaned image data).
- Selecting an existing plot/equation while the panel is open now targets it for editing, so "Update" replaces it (previously the panel stayed in insert mode and created duplicates).
- Updating a plot is now as fast as inserting one: the updated element gets a fresh file ID, so Excalidraw defers the SVG decode instead of synchronously rasterising the image inside the click handler (which caused hangs and crashes on large plots). Orphaned file entries are pruned automatically at save time, and grouping/framing/locking applied to the element is preserved on update.
- Fixed jagged function curves: function series now always sample over an explicit `domain` (the plotted range, like simple-plot's own `plot-fn` wrapper) instead of simple-plot's inflated sampling span, so `samples` maps 1:1 to visible curve segments and adapts to the plot width.
- Shared Typst compilation infrastructure moved to `plugins/typst/` (worker client, artifact rendering, diagnostics) — used by both the equation and graph plugins.

### Removed
- Removed the Plotly.js dependency from `@excalimath/core`, the demo, and the desktop app.

## [2.0.0] - 2026-07-16

### Changed
- Replaced KaTeX and LaTeX equation authoring with native Typst math syntax.
- Moved equation compilation to a Web Worker and render Typst vector artifacts as self-contained SVG.
- Replaced `excalimath_latex` metadata with `excalimath_typst` and made round-trip restoration fully asynchronous.
- Converted the visual toolbar and expression library to Typst-native snippets.

### Fixed
- Removed the KaTeX HTML/MathML dual-output path that duplicated preview math when the host did not load KaTeX CSS.
- Packaged the Typst worker with relative asset URLs so consuming Vite applications include it correctly.

### Removed
- Removed KaTeX, its demo CDN stylesheet, `renderLatexToSvg`, `validateLatex`, and synchronous `restoreExcalimathFiles`.
- Legacy LaTeX scene metadata is intentionally unsupported.

## [1.1.0] - 2026-04-05

### Added
- **Visual LaTeX toolbar** — 40+ clickable buttons across 6 groups (Structure, Operators, Calculus, Greek, Trig, Layout) for building equations without knowing LaTeX syntax
- **Excalidraw library export** — `scripts/export-libraries.cjs` generates `.excalidrawlib` files for all 6 shape packs, compatible with libraries.excalidraw.com
- Pre-built `.excalidrawlib` files included in `scripts/output/`

### Fixed
- Library panel import button now scrolls with content instead of pinned footer

## [0.1.0-desktop] - 2026-04-05

### Added
- **Desktop app** — Electrobun-based native shell under `apps/desktop/`
  - Full Excalidraw + ExcaliMath UI running in native WebView2 window
  - All features work fully offline (equations, graphs, shapes)
  - Portable distribution: unzip and run `bin/launcher.exe`
  - Packaging script: `npm run package` creates distributable .zip
  - CI workflow: GitHub Actions matrix build for macOS, Windows, Linux
- Desktop app is isolated from npm workspaces (uses Electrobun independently)

## [1.0.0] - 2026-04-04

### Added
- **Clean Component API** — `theme`, `initialData`, `onSave` props
- **Round-trip fidelity** — `restoreExcalimathFiles()` and `restoreExcalimathFilesAsync()` regenerate equation/graph SVGs from stored metadata on file load
- **`extractExcalimathData()`** — utility to extract all ExcaliMath metadata from a scene
- **Accessibility** — ARIA roles (`dialog`, `tablist`, `tab`, `tabpanel`), `aria-selected`, `aria-expanded`, `aria-label`, `aria-controls`
- **AuthorKit adapter spec** — reference specification with widget type, lifecycle, response capture, and React stub

## [0.3.0] - 2026-04-04

### Added
- **Shape Libraries** — 6 curriculum-aligned packs with 80+ shapes
  - Geometry (K-10): triangles, circles, polygons, coordinate grid, number line, protractor
  - Algebra (Gr 3-10): fraction bars, algebra tiles, Venn diagrams, function machine
  - Statistics (Gr 5-12): bar chart, pie chart, histogram, scatter plot, box plot
  - Physics/Circuits (Gr 8-12): 30 components including resistors, capacitors, transistors, all logic gates (AND, OR, NOT, NAND, NOR, XOR, XNOR, Buffer), meters, diodes, and more
  - Biology (Gr 5-12): cell diagrams, DNA helix, mitosis stages, food web
  - Chemistry (Gr 7-12): Bohr atom, periodic table tile, bond types, lab equipment
- **LibraryPanel UI** — searchable grid browser, pack filter/toggle, `.excalidrawlib` import
- **SVG shape support** — shapes with smooth bezier curves (logic gates) rendered as SVG images
- **Element grouping** — all multi-element shapes grouped for single-click selection and movement

## [0.2.0] - 2026-04-04

### Added
- **Graph Layer** — function plotting via Plotly.js with SVG output
  - Up to 5 colour-coded functions per graph with safe mathjs evaluation
  - Configurable axes: range, labels, grid, tick intervals
  - CSV data import for scatter and line plots
  - 7 preset templates: linear, parabola, trig, unit circle, number line, exponential, absolute value
  - Click-to-edit restores full graph configuration from element metadata
- **GraphPanel UI** — function input, axis config, data tab, templates tab, live preview

## [0.1.0] - 2026-04-04

### Added
- **Equation Layer** — LaTeX authoring via KaTeX
  - LaTeX input with live KaTeX preview (MathML output for data URL compatibility)
  - Insert rendered equations as Excalidraw image elements
  - Click-to-edit: click any equation to reopen in the editor
  - 40+ pre-built expression library across 9 categories
  - Graceful error handling with clear parse error messages
- **Core infrastructure**
  - `elementFactory` — SVG to Excalidraw imageElement conversion with data URLs
  - `stateBridge` — click-to-edit metadata detection via customData
- **Monorepo scaffold** — npm workspaces, Vite + TypeScript, MIT license
- **Demo app** — standalone app wrapping Excalidraw + ExcaliMath
