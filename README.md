# c4

A browser-based editor for **C4-style architecture diagrams** written
in a Mermaid-flavored DSL. Type (or paste) a small text description of
your system on the left and watch the diagram render, auto-route, and
stay draggable on the right.

Live demo: <https://c4-loskc.ondigitalocean.app>

This repository is part of the **[go-teal](https://github.com/go-teal)**
set of projects — a growing collection of tools and building blocks
around architecture modelling, documentation, and code generation.

---

## What it does

- **Mermaid-flavored source.** Write `graph TD` with typed nodes like
  `API[server-app: Node.js<br/>API Gateway<br/>Handles requests]`,
  group them into `subgraph` boundaries, and connect them with
  `A -->|label| B`. Supported node types include `person`,
  `system`, `container`, `database`, `s3`, `spa`, `server-app`,
  `aws`, `bus`, `directory`, and `boundary`, each rendered with an
  appropriate C4 shape.
- **Orthogonal auto-routing.** Edges are routed on a grid with A\*,
  distributed along shared sides so parallel edges don't stack, and
  given clean perpendicular stubs at each end. Self-loops render as
  nested C-shapes around the right side of the node. See
  [docs/solution.md](docs/solution.md) for the full algorithm.
- **Drag-and-snap layout.** Nodes and boundaries can be dragged on
  the canvas, with a magnetic pull to a 50px grid during drag and a
  hard snap on release. Manual positions are persisted back into the
  source as `%% @pos` and `%% @edge` comments so layouts survive a
  re-parse.
- **Sequence-diagram paste.** Pasting a `sequenceDiagram` into the
  editor opens a modal that converts it into a graph, with an option
  to keep or drop response (dashed) arrows. `autonumber` directives
  — including `autonumber <start> <step>` — prefix edge labels with
  their step numbers.
- **Multi-line text.** Any `\n` inside node titles or edge labels is
  rendered as a stacked `<tspan>`, so you can wrap long names and
  messages without overflowing.
- **SVG export.** A one-click "Download SVG" button saves the current
  diagram as a standalone SVG file, with the background dot grid
  stripped out.
- **Component styling.** Click any node to pick its type and color
  from the style panel; changes are rewritten back into the source.

## Tech stack

- [Vue 3](https://vuejs.org/) with `<script setup>` SFCs
- [Vite](https://vitejs.dev/) for dev server and production builds
- [Pinia](https://pinia.vuejs.org/) for state (single diagram store)
- [reka-ui](https://reka-ui.com/) for the splitter panels
- Pure SVG rendering — no canvas, no third-party diagram engine

## Running locally

```bash
npm install
npm run dev      # Vite dev server
npm run build    # production build to ./dist
npm run preview  # preview the built output
```

## Deployment

The `main` branch auto-deploys to DigitalOcean App Platform via a
GitHub Actions workflow
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) using
the app spec in [.do/app.yaml](.do/app.yaml). Required secrets:
`DIGITALOCEAN_ACCESS_TOKEN` and the `DO_APP_ID` variable.

## Project structure

```text
src/
  App.vue                       main layout (editor + diagram + style)
  components/
    EditorPanel.vue             Mermaid-DSL textarea + paste detection
    DiagramPanel.vue            SVG canvas with dot grid and export
    C4Node.vue                  per-type node shape renderer
    C4Edge.vue                  polyline + multi-line label renderer
    C4Boundary.vue              draggable subgraph frame
    StylePanel.vue              node type/color picker
    SequenceDiagramModal.vue    paste-to-graph conversion prompt
  parser/
    mermaidParser.js            hand-written DSL parser
    sequenceConverter.js        sequenceDiagram → graph TD converter
  routing/
    orthogonalRouter.js         A* orthogonal edge routing + layout
  stores/
    diagramStore.js             Pinia store with drag/snap logic
    sourceRewriter.js           string-level source rewrites
```

## License

[MIT](LICENSE) © Boris Ershov
