import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { parseMermaid } from '../parser/mermaidParser.js'
import { applyNodeStyle, setNodePositions } from './sourceRewriter.js'
import { DEFAULT_COLOR, parseClassName } from '../styles/palette.js'
import { routeAllEdges } from '../routing/orthogonalRouter.js'

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
    return edges.value.map(e => ({ ...e, points: routes.get(e.id) || null }))
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
      node.x = Math.max(MIN_MARGIN, x)
      node.y = Math.max(MIN_MARGIN, y)
      // Auto-resize parent boundary
      if (node.boundaryId) {
        recalcBoundary(node.boundaryId)
      }
    }
  }

  function updateBoundaryPosition(id, x, y) {
    const boundary = boundaries.value.find(b => b.id === id)
    if (!boundary) return

    const clampedX = Math.max(MIN_MARGIN, x)
    const clampedY = Math.max(MIN_MARGIN, y)
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
  }

  function persistPositionsToSource() {
    const positions = {}
    for (const n of nodes.value) {
      positions[n.id] = { x: n.x, y: n.y }
    }
    mermaidSource.value = setNodePositions(mermaidSource.value, positions)
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
    init,
  }
})
