/**
 * Custom Mermaid flowchart parser.
 *
 * Node syntax:
 *   NodeId[type: type_title<br/>Title<br/>description]
 *
 * Boundary syntax (mermaid subgraph):
 *   subgraph boundaryId [Label]
 *     ...nodes and edges...
 *   end
 *
 * Boundaries can nest. Nodes inside a subgraph belong to that boundary.
 */

const VALID_TYPES = [
  'system', 'container', 'database', 's3', 'person',
  'server-app', 'spa', 'directory', 'boundary', 'aws', 'bus',
]

const NODE_WIDTH = 200
const NODE_HEIGHT = 120
const H_GAP = 60
const V_GAP = 60
const BOUNDARY_PADDING = 30

function parseTypePart(raw) {
  const match = raw.match(/^([\w-]+)\s*:\s*(.+)$/)
  if (match) {
    const type = VALID_TYPES.includes(match[1].toLowerCase()) ? match[1].toLowerCase() : 'system'
    return { type, typeTitle: match[2].trim() }
  }
  const bare = raw.trim().toLowerCase()
  if (VALID_TYPES.includes(bare)) {
    return { type: bare, typeTitle: '' }
  }
  return { type: 'system', typeTitle: raw.trim() }
}

function parseBracketContent(content) {
  const parts = content.split(/<br\s*\/?>/i).map(p => p.trim())
  const { type, typeTitle } = parseTypePart(parts[0] || '')
  return {
    type,
    typeTitle,
    title: parts[1] || '',
    description: parts[2] || '',
  }
}

function parseNodeToken(token) {
  const trimmed = token.trim()
  if (!trimmed) return null

  const match = trimmed.match(/^(\w+)\[(.+)\]$/s)
  if (match) {
    const id = match[1]
    const parsed = parseBracketContent(match[2])
    return { id, ...parsed, _defined: true }
  }

  const bareMatch = trimmed.match(/^(\w+)$/)
  if (bareMatch) {
    return { id: bareMatch[1], type: 'system', typeTitle: '', title: bareMatch[1], description: '', _defined: false }
  }

  return null
}

/**
 * Parse a subgraph line: "subgraph id [Label]" or "subgraph id [type: title<br/>...]"
 * Returns { id, title, typeTitle, description } or null
 */
function parseSubgraphLine(line) {
  // subgraph id [content]
  const match = line.match(/^subgraph\s+(\w+)\s*\[(.+)\]$/i)
  if (match) {
    const id = match[1]
    const content = match[2].trim()
    // Try parsing as bracket content (type: title<br/>...)
    if (/<br\s*\/?>/i.test(content)) {
      const parsed = parseBracketContent(content)
      return { id, title: parsed.title || id, typeTitle: parsed.typeTitle, description: parsed.description }
    }
    // Plain label
    return { id, title: content, typeTitle: '', description: '' }
  }

  // subgraph id (no brackets)
  const simpleMatch = line.match(/^subgraph\s+(\w+)\s*$/i)
  if (simpleMatch) {
    return { id: simpleMatch[1], title: simpleMatch[1], typeTitle: '', description: '' }
  }

  return null
}

export function parseMermaid(source) {
  const nodesMap = new Map()
  const edges = []
  const boundariesMap = new Map()
  const classDefsMap = new Map()       // className → { fill, stroke, color }
  const classAssignments = new Map()   // nodeId → className

  // Stack of boundary IDs for nesting
  const boundaryStack = []

  function currentBoundaryId() {
    return boundaryStack.length > 0 ? boundaryStack[boundaryStack.length - 1] : null
  }

  function setNode(node) {
    if (!node) return
    if (!nodesMap.has(node.id) || node._defined) {
      nodesMap.set(node.id, node)
    }
    // Assign node to current boundary (only on first definition)
    if (node._defined && currentBoundaryId()) {
      node._boundaryId = currentBoundaryId()
    }
  }

  const lines = source.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const startIdx = lines.findIndex(l => /^graph\s+(TD|TB|LR|RL|BT)/i.test(l))
  const contentLines = startIdx >= 0 ? lines.slice(startIdx + 1) : lines

  const edgePattern = /^(.+?)\s*(-{1,2}->|=+>|-.->)\s*(?:\|(.+?)\|\s*)?(.+)$/
  const edgeLabelBeforeArrow = /^(.+?)\s*--\s+(.+?)\s*-->\s*(.+)$/

  for (const line of contentLines) {
    if (line.startsWith('%%') || line.startsWith('style ')) {
      continue
    }

    // Parse classDef: classDef person fill:#08427b,stroke:#052e56,stroke-width:2px,color:#fff
    if (line.startsWith('classDef')) {
      const cdMatch = line.match(/^classDef\s+(\S+)\s+(.+)$/)
      if (cdMatch) {
        const className = cdMatch[1]
        const props = cdMatch[2]
        const style = {}
        for (const part of props.split(',')) {
          const kv = part.split(':')
          if (kv.length >= 2) {
            const key = kv[0].trim()
            const val = kv.slice(1).join(':').trim()  // rejoin in case of color values like #fff
            if (key === 'fill') style.fill = val
            if (key === 'stroke') style.stroke = val
            if (key === 'color') style.color = val
          }
        }
        classDefsMap.set(className, style)
      }
      continue
    }

    // Parse class assignment: class Treasury,Manager person
    if (line.startsWith('class ')) {
      const clMatch = line.match(/^class\s+(.+?)\s+(\S+)$/)
      if (clMatch) {
        const nodeIds = clMatch[1].split(',').map(s => s.trim())
        const className = clMatch[2]
        for (const nodeId of nodeIds) {
          if (nodeId) classAssignments.set(nodeId, className)
        }
      }
      continue
    }

    // Check for subgraph start
    const subgraph = parseSubgraphLine(line)
    if (subgraph) {
      const parentId = currentBoundaryId()
      boundariesMap.set(subgraph.id, {
        id: subgraph.id,
        title: subgraph.title,
        typeTitle: subgraph.typeTitle,
        description: subgraph.description,
        parentId,
        childNodeIds: [],
        childBoundaryIds: [],
      })
      // Register as child of parent boundary
      if (parentId && boundariesMap.has(parentId)) {
        boundariesMap.get(parentId).childBoundaryIds.push(subgraph.id)
      }
      boundaryStack.push(subgraph.id)
      continue
    }

    // Check for subgraph end
    if (/^end$/i.test(line)) {
      boundaryStack.pop()
      continue
    }

    // Try edge patterns
    let edgeMatch = line.match(edgeLabelBeforeArrow)
    if (edgeMatch) {
      const leftNode = parseNodeToken(edgeMatch[1].trim())
      const rightNode = parseNodeToken(edgeMatch[3].trim())
      setNode(leftNode)
      setNode(rightNode)
      if (leftNode && rightNode) {
        edges.push({ id: `${leftNode.id}-${rightNode.id}`, from: leftNode.id, to: rightNode.id, label: edgeMatch[2].trim() })
      }
      continue
    }

    edgeMatch = line.match(edgePattern)
    if (edgeMatch) {
      const leftNode = parseNodeToken(edgeMatch[1].trim())
      const rightNode = parseNodeToken(edgeMatch[4].trim())
      setNode(leftNode)
      setNode(rightNode)
      if (leftNode && rightNode) {
        edges.push({ id: `${leftNode.id}-${rightNode.id}`, from: leftNode.id, to: rightNode.id, label: (edgeMatch[3] || '').trim() })
      }
      continue
    }

    // Standalone node
    setNode(parseNodeToken(line))
  }

  // Assign nodes to their boundary's childNodeIds
  for (const node of nodesMap.values()) {
    if (node._boundaryId && boundariesMap.has(node._boundaryId)) {
      boundariesMap.get(node._boundaryId).childNodeIds.push(node.id)
    }
  }

  // Also assign bare-referenced nodes that are inside a boundary
  // (nodes not _defined but referenced in edges within a subgraph context)
  // We handle this by checking: if a node has no _boundaryId but is referenced
  // only within a boundary, assign it. For now, bare refs keep their assignment
  // from the edge context — handled above via setNode.

  // Auto-layout nodes
  const nodeList = Array.from(nodesMap.values())

  // Separate root nodes from boundary nodes
  const rootNodes = nodeList.filter(n => !n._boundaryId)
  const boundaryList = Array.from(boundariesMap.values())

  // Layout root-level boundaries and nodes in a grid
  const rootItems = [...boundaryList.filter(b => !b.parentId), ...rootNodes]
  const cols = Math.max(Math.ceil(Math.sqrt(rootItems.length)), 1)

  // First, layout nodes inside boundaries
  for (const boundary of boundaryList) {
    const childNodes = boundary.childNodeIds
    const childCols = Math.max(Math.ceil(Math.sqrt(childNodes.length)), 1)
    childNodes.forEach((nodeId, i) => {
      const node = nodesMap.get(nodeId)
      if (node) {
        node._localX = BOUNDARY_PADDING + (i % childCols) * (NODE_WIDTH + H_GAP)
        node._localY = BOUNDARY_PADDING + 40 + Math.floor(i / childCols) * (NODE_HEIGHT + V_GAP)
      }
    })
    // Compute boundary size from children
    const childW = Math.max(childCols * (NODE_WIDTH + H_GAP) - H_GAP + BOUNDARY_PADDING * 2, NODE_WIDTH + BOUNDARY_PADDING * 2)
    const childRows = Math.ceil(childNodes.length / childCols) || 1
    const childH = childRows * (NODE_HEIGHT + V_GAP) - V_GAP + BOUNDARY_PADDING * 2 + 40
    boundary._width = childW
    boundary._height = childH
  }

  // Layout root-level items horizontally, using actual sizes to avoid overlap
  const rootBoundaries = boundaryList.filter(b => !b.parentId)
  let cursorX = 40
  for (const boundary of rootBoundaries) {
    boundary._x = cursorX
    boundary._y = 40
    cursorX += (boundary._width || 400) + H_GAP
  }

  // Place root nodes after boundaries
  rootNodes.forEach((node) => {
    node._localX = 0
    node._localY = 0
    node._rootX = cursorX
    node._rootY = 40
    cursorX += NODE_WIDTH + H_GAP
  })

  // Build final nodes with absolute positions
  const nodes = nodeList.map(node => {
    let x, y
    if (node._boundaryId && boundariesMap.has(node._boundaryId)) {
      const boundary = boundariesMap.get(node._boundaryId)
      x = (boundary._x || 40) + (node._localX || 0)
      y = (boundary._y || 40) + (node._localY || 0)
    } else {
      x = node._rootX || (40 + (node._localX || 0))
      y = node._rootY || (40 + (node._localY || 0))
    }
    // Resolve classDef style for this node
    let nodeStyle = null
    const assignedClass = classAssignments.get(node.id) || null
    if (assignedClass && classDefsMap.has(assignedClass)) {
      const cd = classDefsMap.get(assignedClass)
      nodeStyle = {
        fill: cd.fill || 'transparent',  // background; transparent if not mentioned
        stroke: cd.stroke || null,        // font/text color
        color: cd.color || null,          // frame/border color
      }
    }

    return {
      id: node.id,
      type: node.type,
      typeTitle: node.typeTitle,
      title: node.title,
      description: node.description,
      boundaryId: node._boundaryId || null,
      className: assignedClass,
      style: nodeStyle,
      x, y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }
  })

  // Build final boundaries
  const boundaries = boundaryList.map(b => ({
    id: b.id,
    title: b.title,
    typeTitle: b.typeTitle,
    description: b.description,
    parentId: b.parentId,
    childNodeIds: b.childNodeIds,
    childBoundaryIds: b.childBoundaryIds,
    x: b._x || 40,
    y: b._y || 40,
    width: b._width || 400,
    height: b._height || 300,
  }))

  return { nodes, edges, boundaries }
}
