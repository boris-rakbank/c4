import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { parseMermaid } from '../parser/mermaidParser.js'
import { convertSequenceToGraph } from '../parser/sequenceConverter.js'
import { applyNodeStyle, setNodePositions, setEdgeRoutes } from './sourceRewriter.js'
import { DEFAULT_COLOR, parseClassName } from '../styles/palette.js'
import { routeAllEdges } from '../routing/orthogonalRouter.js'
import { applyForceLayout } from '../layout/forceLayout.js'

const BOUNDARY_PADDING = 30
const BOUNDARY_TITLE_HEIGHT = 40

export const useDiagramStore = defineStore('diagram', () => {
  const mermaidSource = ref(`graph TD
    subgraph Rakbank [Rakbank Internet Banking]
      A[person: Customer<br/>User<br/>Banking customer] -->|Uses| B[spa: Single-page App<br/>Web Application<br/>Serves the UI]
      B -->|API calls| C[server-app: Node.js<br/>API Server<br/>Handles business logic]
      C -->|Reads/Writes| D[database: PostgreSQL<br/>Main Database<br/>Stores accounts]
      C -->|Stores files| E[s3: AWS S3 Bucket<br/>Document Store<br/>Uploaded documents]
    end
    subgraph External [External Services]
      F[container: Core Banking<br/>Payment Service<br/>Processes payments]
      G[aws: SES<br/>Email Service<br/>Sends notifications]
    end
    C -->|Calls| F
    F -->|Sends email| G
    classDef person fill:#08427b,stroke:#fff,color:#052e56
    classDef external fill:#999999,stroke:#fff,color:#6b6b6b
    class A person
    class F,G external`)

  const nodes = ref([])
  const edges = ref([])
  const boundaries = ref([])
  const selectedNodeId = ref(null)

  // When the user pastes a Mermaid sequenceDiagram, we stash the full
  // pasted text here and show a conversion modal instead of mutating the
  // editor. `previousSourceBeforePaste` lets Cancel roll back the editor
  // to its pre-paste state (the editor textarea is bound to
  // `mermaidSource`, so restoring this ref restores the visible text).
  const pendingSequenceSource = ref(null)
  const previousSourceBeforePaste = ref(null)

  const selectedNode = computed(() => {
    if (!selectedNodeId.value) return null
    return nodes.value.find(n => n.id === selectedNodeId.value) || null
  })

  function selectNode(id) {
    selectedNodeId.value = id
  }

  function clearSelection() {
    selectedNodeId.value = null
  }

  function setNodeStyle(id, { type, colorName }) {
    const node = nodes.value.find(n => n.id === id)
    if (!node) return
    const nextType = type || node.type
    const nextColor = colorName || (parseClassName(node.className)?.colorName) || DEFAULT_COLOR
    const newSource = applyNodeStyle(mermaidSource.value, id, { type: nextType, colorName: nextColor })
    updateFromSource(newSource)
  }

  const getNodeById = computed(() => {
    const map = new Map(nodes.value.map(n => [n.id, n]))
    return (id) => map.get(id)
  })

  const getBoundaryById = computed(() => {
    const map = new Map(boundaries.value.map(b => [b.id, b]))
    return (id) => map.get(id)
  })

  // Auto-routed orthogonal edges. Recomputes whenever nodes or edges change,
  // so dragging a node reroutes connected edges automatically.
  const routedEdges = computed(() => {
    const routes = routeAllEdges(nodes.value, edges.value)
    return edges.value.map(e => {
      const r = routes.get(e.id)
      return {
        ...e,
        points:   r?.points   || null,
        slotOut:  r?.slotOut  || null,
        slotIn:   r?.slotIn   || null,
        labelPos:    r?.labelPos    || null,
        labelAnchor: r?.labelAnchor || null,
      }
    })
  })

  // Get all nodes that belong to a boundary (direct children)
  function getNodesInBoundary(boundaryId) {
    return nodes.value.filter(n => n.boundaryId === boundaryId)
  }

  // Get all child boundaries of a boundary
  function getChildBoundaries(boundaryId) {
    return boundaries.value.filter(b => b.parentId === boundaryId)
  }

  // Recalculate boundary bounds from its children (nodes + child boundaries)
  function recalcBoundary(boundaryId) {
    const boundary = boundaries.value.find(b => b.id === boundaryId)
    if (!boundary) return

    const childNodes = getNodesInBoundary(boundaryId)
    const childBounds = getChildBoundaries(boundaryId)

    const rects = []
    for (const n of childNodes) {
      rects.push({ x: n.x, y: n.y, r: n.x + n.width, b: n.y + n.height })
    }
    for (const cb of childBounds) {
      rects.push({ x: cb.x, y: cb.y, r: cb.x + cb.width, b: cb.y + cb.height })
    }

    if (rects.length === 0) return

    const minX = Math.min(...rects.map(r => r.x)) - BOUNDARY_PADDING
    const minY = Math.min(...rects.map(r => r.y)) - BOUNDARY_PADDING - BOUNDARY_TITLE_HEIGHT
    const maxR = Math.max(...rects.map(r => r.r)) + BOUNDARY_PADDING
    const maxB = Math.max(...rects.map(r => r.b)) + BOUNDARY_PADDING

    boundary.x = minX
    boundary.y = minY
    boundary.width = maxR - minX
    boundary.height = maxB - minY

    // Propagate up to parent
    if (boundary.parentId) {
      recalcBoundary(boundary.parentId)
    }
  }

  const MIN_MARGIN = 20
  const GRID_SIZE = 50     // px — snap grid spacing (~1/4 of NODE_WIDTH)
  const SNAP_MAGNET = 12   // px — pull radius during drag

  function snapToGrid(v) {
    return Math.round(v / GRID_SIZE) * GRID_SIZE
  }
  // Soft snap: only pull to the grid when within SNAP_MAGNET pixels of
  // a gridline; outside that radius the raw value passes through.
  function magnetSnap(v) {
    const g = snapToGrid(v)
    return Math.abs(g - v) <= SNAP_MAGNET ? g : v
  }

  // Shift all elements so the topmost/leftmost is at MIN_MARGIN (removes dead space)
  function normalizePositions() {
    let globalMinX = Infinity
    let globalMinY = Infinity

    for (const n of nodes.value) {
      if (n.x < globalMinX) globalMinX = n.x
      if (n.y < globalMinY) globalMinY = n.y
    }
    for (const b of boundaries.value) {
      if (b.x < globalMinX) globalMinX = b.x
      if (b.y < globalMinY) globalMinY = b.y
    }

    if (!isFinite(globalMinX) || !isFinite(globalMinY)) return

    const shiftX = MIN_MARGIN - globalMinX
    const shiftY = MIN_MARGIN - globalMinY

    if (shiftX === 0 && shiftY === 0) return

    for (const n of nodes.value) {
      n.x += shiftX
      n.y += shiftY
    }
    for (const b of boundaries.value) {
      b.x += shiftX
      b.y += shiftY
    }
  }

  function updateNodePosition(id, x, y) {
    const node = nodes.value.find(n => n.id === id)
    if (node) {
      // Clamp first so MIN_MARGIN always wins at the top-left edge,
      // then magnetic-snap so values near a gridline stick to it.
      node.x = magnetSnap(Math.max(MIN_MARGIN, x))
      node.y = magnetSnap(Math.max(MIN_MARGIN, y))
      // Auto-resize parent boundary
      if (node.boundaryId) {
        recalcBoundary(node.boundaryId)
      }
    }
  }

  function updateBoundaryPosition(id, x, y) {
    const boundary = boundaries.value.find(b => b.id === id)
    if (!boundary) return

    const clampedX = magnetSnap(Math.max(MIN_MARGIN, x))
    const clampedY = magnetSnap(Math.max(MIN_MARGIN, y))
    const dx = clampedX - boundary.x
    const dy = clampedY - boundary.y

    boundary.x = clampedX
    boundary.y = clampedY

    // Move all child nodes
    const childNodes = getNodesInBoundary(id)
    for (const node of childNodes) {
      node.x += dx
      node.y += dy
    }

    // Move all child boundaries (recursive)
    moveChildBoundaries(id, dx, dy)

    // Recalc parent if nested
    if (boundary.parentId) {
      recalcBoundary(boundary.parentId)
    }
  }

  // Called when drag ends — snaps content to top-left and persists positions
  // back to the source as `%% @pos` comments so they survive a reparse.
  function finishDrag() {
    normalizePositions()
    persistPositionsToSource()
    persistEdgeRoutesToSource()
  }

  function persistPositionsToSource() {
    const positions = {}
    for (const n of nodes.value) {
      positions[n.id] = { x: n.x, y: n.y }
    }
    mermaidSource.value = setNodePositions(mermaidSource.value, positions)
  }

  function persistEdgeRoutesToSource() {
    const routes = {}
    for (const e of routedEdges.value) {
      if (!e.points || !e.slotOut || !e.slotIn) continue
      routes[e.id] = {
        slotOut: e.slotOut,
        slotIn:  e.slotIn,
        points:  e.points,
      }
    }
    mermaidSource.value = setEdgeRoutes(mermaidSource.value, routes)
  }

  function moveChildBoundaries(parentId, dx, dy) {
    const children = getChildBoundaries(parentId)
    for (const child of children) {
      child.x += dx
      child.y += dy
      // Move this child's nodes
      const childNodes = getNodesInBoundary(child.id)
      for (const node of childNodes) {
        node.x += dx
        node.y += dy
      }
      // Recurse
      moveChildBoundaries(child.id, dx, dy)
    }
  }

  function updateFromSource(source) {
    mermaidSource.value = source
    const result = parseMermaid(source)

    nodes.value = result.nodes
    boundaries.value = result.boundaries
    edges.value = result.edges

    // Recalc boundaries from leaf to root so their geometry tracks the
    // (possibly user-saved) child node positions.
    for (const b of boundaries.value) {
      if (b.childBoundaryIds.length === 0) {
        recalcBoundary(b.id)
      }
    }
    normalizePositions()
  }

  // Fruchterman–Reingold force-directed auto-layout with grid snap.
  // Invoked on demand from the UI (toolbar button) — never
  // automatically.
  //
  // Two-pass layout:
  //   Pass 1 — for each root-level boundary, run the physics on
  //            just its descendants (using only intra-group edges);
  //            unparented nodes are force-laid-out together as one
  //            virtual group. This gives each group a compact
  //            internal layout without inter-group interference.
  //   Pass 2 — pack the groups (root boundaries + unparented nodes)
  //            in a tight row/column grid with fixed gaps: at most
  //            1/2 × NODE_WIDTH horizontally and 1/2 × NODE_HEIGHT
  //            vertically between adjacent groups. Each group's
  //            contents translate together via the existing
  //            updateBoundaryPosition / updateNodePosition helpers.
  //
  // Snapped positions are written back to the source as `%% @pos`
  // comments so they survive a re-parse.
  function runForceLayout() {
    if (nodes.value.length === 0) return

    // ── Pass 1 — per-group internal force layout ────────────────────
    runPerGroupInternalLayoutPass()

    // Recalc all boundary bounds from the new child positions so
    // Pass 2 sees accurate group sizes.
    for (const b of boundaries.value) {
      if (b.childBoundaryIds.length === 0) recalcBoundary(b.id)
    }

    // ── Pass 2 — pack groups with fixed small gaps ──────────────────
    runGroupPackingPass()

    normalizePositions()
    persistPositionsToSource()
    persistEdgeRoutesToSource()
  }

  // All node descendants of `boundaryId`, including nodes inside
  // nested child boundaries (flattened). Used to relax a whole root
  // group in one force-layout call.
  function getAllDescendantNodes(boundaryId) {
    const result = []
    const walk = (bid) => {
      for (const n of nodes.value) if (n.boundaryId === bid) result.push(n)
      for (const b of boundaries.value) if (b.parentId === bid) walk(b.id)
    }
    walk(boundaryId)
    return result
  }

  function runPerGroupInternalLayoutPass() {
    const relaxGroup = (groupNodes) => {
      if (groupNodes.length < 2) return
      const idSet = new Set(groupNodes.map(n => n.id))
      const internalEdges = edges.value.filter(e => idSet.has(e.from) && idSet.has(e.to))
      const k = Math.ceil(Math.sqrt(groupNodes.length))
      // Virtual canvas sized for this single group.
      const side = Math.max(1200, k * 520)
      const result = applyForceLayout({
        nodes: groupNodes,
        edges: internalEdges,
        canvas: { width: side, height: Math.round(side * 0.45) },
        gridSize: GRID_SIZE,
        directed: true,
      })
      const posById = new Map(result.map(r => [r.id, r]))
      for (const n of groupNodes) {
        const p = posById.get(n.id)
        if (p) { n.x = p.x; n.y = p.y }
      }
    }

    // Relax each root boundary's descendants (flattened).
    for (const b of boundaries.value) {
      if (b.parentId) continue
      relaxGroup(getAllDescendantNodes(b.id))
    }
    // Relax unparented nodes as a single virtual group.
    relaxGroup(nodes.value.filter(n => !n.boundaryId))
  }

  function runGroupPackingPass() {
    // NODE_WIDTH = 200, NODE_HEIGHT = 120 (mermaidParser.js constants).
    // Fixed inter-group gaps as specified: 1/2 × component size.
    const H_GAP = 100
    const V_GAP = 60

    // Build the packable items: each root boundary and each
    // unparented node is one item.
    const items = []
    for (const b of boundaries.value) {
      if (b.parentId) continue
      items.push({
        x: b.x, y: b.y, width: b.width, height: b.height,
        refBoundary: b,
      })
    }
    for (const n of nodes.value) {
      if (n.boundaryId) continue
      items.push({
        x: n.x, y: n.y, width: n.width, height: n.height,
        refNode: n,
      })
    }
    if (items.length === 0) return

    // Sort into reading order: group by y-band (of average item
    // height), then by x. This preserves rough relative ordering
    // from whatever layout preceded the pack (manual, parser auto,
    // or a previous Auto Layout click) — connected groups that
    // clustered in pass 1 tend to pack next to each other.
    const avgH = items.reduce((s, i) => s + i.height, 0) / items.length
    items.sort((a, b) => {
      const ay = Math.floor((a.y + a.height / 2) / avgH)
      const by = Math.floor((b.y + b.height / 2) / avgH)
      if (ay !== by) return ay - by
      return (a.x + a.width / 2) - (b.x + b.width / 2)
    })

    // Wrap row width: target a roughly square overall block.
    const maxItemW = items.reduce((m, i) => Math.max(m, i.width), 0)
    const k = Math.ceil(Math.sqrt(items.length))
    const maxRowWidth = Math.max(1800, k * (maxItemW + H_GAP))

    let cursorX = MIN_MARGIN
    let cursorY = MIN_MARGIN
    let rowHeight = 0

    for (const item of items) {
      // Wrap to next row if adding this item would overflow.
      if (cursorX > MIN_MARGIN && cursorX + item.width > maxRowWidth) {
        cursorX = MIN_MARGIN
        cursorY += rowHeight + V_GAP
        rowHeight = 0
      }
      // Snap cursor to grid so `%% @pos` values come out clean.
      const targetX = snapToGrid(cursorX)
      const targetY = snapToGrid(cursorY)
      if (item.refBoundary) {
        updateBoundaryPosition(item.refBoundary.id, targetX, targetY)
      } else if (item.refNode) {
        updateNodePosition(item.refNode.id, targetX, targetY)
      }
      cursorX += item.width + H_GAP
      if (item.height > rowHeight) rowHeight = item.height
    }
  }

  // Hard-snap the last-dragged element to the nearest gridline. Called
  // from component pointer-up handlers before finishDrag so the
  // persisted positions are always grid-aligned, regardless of whether
  // the magnetic snap kicked in during the drag.
  function snapActivePosition(id, kind) {
    if (kind === 'node') {
      const n = nodes.value.find(nn => nn.id === id)
      if (!n) return
      updateNodePosition(id, snapToGrid(n.x), snapToGrid(n.y))
    } else if (kind === 'boundary') {
      const b = boundaries.value.find(bb => bb.id === id)
      if (!b) return
      updateBoundaryPosition(id, snapToGrid(b.x), snapToGrid(b.y))
    }
  }

  function promptSequenceConversion(pastedText) {
    previousSourceBeforePaste.value = mermaidSource.value
    pendingSequenceSource.value = pastedText
  }

  function confirmSequenceConversion({ showResponses } = {}) {
    if (pendingSequenceSource.value == null) return
    const graphSource = convertSequenceToGraph(
      pendingSequenceSource.value,
      { showResponses: !!showResponses }
    )
    updateFromSource(graphSource)
    pendingSequenceSource.value = null
    previousSourceBeforePaste.value = null
  }

  function cancelSequenceConversion() {
    if (previousSourceBeforePaste.value != null) {
      mermaidSource.value = previousSourceBeforePaste.value
    }
    pendingSequenceSource.value = null
    previousSourceBeforePaste.value = null
  }

  function init() {
    const result = parseMermaid(mermaidSource.value)
    nodes.value = result.nodes
    edges.value = result.edges
    boundaries.value = result.boundaries

    // Recalc boundaries
    for (const b of boundaries.value) {
      if (b.childBoundaryIds.length === 0) {
        recalcBoundary(b.id)
      }
    }
    normalizePositions()
  }

  return {
    mermaidSource,
    nodes,
    edges,
    boundaries,
    selectedNodeId,
    selectedNode,
    pendingSequenceSource,
    routedEdges,
    getNodeById,
    getBoundaryById,
    updateFromSource,
    updateNodePosition,
    updateBoundaryPosition,
    finishDrag,
    selectNode,
    clearSelection,
    setNodeStyle,
    runForceLayout,
    snapActivePosition,
    promptSequenceConversion,
    confirmSequenceConversion,
    cancelSequenceConversion,
    init,
  }
})
