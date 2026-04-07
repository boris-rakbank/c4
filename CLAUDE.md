# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — production build
- `npm run preview` — preview built output

There is no test runner or linter configured.

## Architecture

A Vue 3 + Vite single-page app for editing and rendering C4-style architecture diagrams from a Mermaid-flavored DSL. The UI is a two-pane splitter ([src/App.vue](src/App.vue)): an [EditorPanel](src/components/EditorPanel.vue) for the source on the left and a [DiagramPanel](src/components/DiagramPanel.vue) on the right that renders [C4Boundary](src/components/C4Boundary.vue), [C4Node](src/components/C4Node.vue), and [C4Edge](src/components/C4Edge.vue) elements.

State lives in a single Pinia store, [src/stores/diagramStore.js](src/stores/diagramStore.js), which holds `mermaidSource`, `nodes`, `edges`, and `boundaries`. Two pipelines mutate this state and must be kept in mind when changing layout/parsing logic:

1. **Source → model.** [src/parser/mermaidParser.js](src/parser/mermaidParser.js) is a hand-written parser (not real Mermaid). It understands `graph TD/LR/...`, `subgraph ... end` (which become **boundaries**, can nest via a `boundaryStack`), edges with optional `|label|`, `classDef`/`class` for styling, and a custom node bracket grammar:
   ```
   NodeId[type: type_title<br/>Title<br/>description]
   ```
   The leading token is matched against `VALID_TYPES` (`person`, `system`, `container`, `database`, `s3`, `spa`, `server-app`, `aws`, `bus`, `directory`, `boundary`); unknown types fall back to `system`. The parser also performs initial auto-layout: nodes inside a boundary are placed in a grid using `NODE_WIDTH/HEIGHT` + gaps, root-level boundaries are laid out left-to-right with a horizontal `cursorX`, and final absolute `x,y` are computed from boundary origin + local offset.

2. **Model → updated model (interaction).** The store handles drag interactions and recomputes layout incrementally:
   - `updateNodePosition` clamps to `MIN_MARGIN` and calls `recalcBoundary` on the parent, which recomputes the boundary's bounding rect from its child nodes + child boundaries (with `BOUNDARY_PADDING` and `BOUNDARY_TITLE_HEIGHT` reserved at the top), then propagates up to its own parent.
   - `updateBoundaryPosition` moves the boundary and translates *all* descendants (nodes and child boundaries) by the same delta via `moveChildBoundaries`, then recalcs the parent.
   - `finishDrag` calls `normalizePositions`, which finds the global min x/y across all nodes and boundaries and shifts everything so the top-left sits at `MIN_MARGIN` (removes dead space after a drag).
   - `updateFromSource` reparses but preserves existing `x,y` (and boundary `width,height`) for ids that survive the edit, so the user's manual layout isn't lost on every keystroke.

When adding new node types, update `VALID_TYPES` in the parser **and** any per-type rendering in `C4Node.vue`. When changing layout constants, note that `BOUNDARY_PADDING` and `BOUNDARY_TITLE_HEIGHT` are duplicated between the parser and the store — both copies must stay in sync.

`classDef` styles are resolved during parse and attached to each node as `node.style = { fill, stroke, color }`. Note the unusual mapping in the parser: `fill` → background, `stroke` → font/text color, `color` → frame/border color (this inverts the usual Mermaid meaning, see `parseMermaid` near the bottom).
