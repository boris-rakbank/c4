/**
 * Orthogonal edge routing on a uniform grid using A* with a turn penalty.
 *
 * Pure module — no Vue / Pinia dependencies. Coordinates are absolute SVG
 * pixels unless prefixed with `g` (grid cell indices).
 */

const CELL = 20            // grid cell size, matches DiagramPanel grid pattern
const PADDING_CELLS = 1    // inflate every node obstacle by N cells
const MARGIN = CELL * 4    // margin around the bounding box of all nodes
const TURN_PENALTY = 5     // extra cost when A* changes direction
const ENDPOINT_GAP = 12    // px to push the line endpoint outside the node so
                           // the arrow head sits in clear space, not under the node

// Direction vectors: 0=right, 1=down, 2=left, 3=up
const DIRS = [
  { dx:  1, dy:  0 },
  { dx:  0, dy:  1 },
  { dx: -1, dy:  0 },
  { dx:  0, dy: -1 },
]

function dirIndex(dx, dy) {
  if (dx ===  1 && dy ===  0) return 0
  if (dx ===  0 && dy ===  1) return 1
  if (dx === -1 && dy ===  0) return 2
  if (dx ===  0 && dy === -1) return 3
  return -1
}

// ─────────────────────────────────────────────────────────────────────────────
// Min-heap (binary) — small, just enough for A* open set
// ─────────────────────────────────────────────────────────────────────────────
class MinHeap {
  constructor() { this.a = [] }
  push(item) {
    const a = this.a
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].f <= a[i].f) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop() {
    const a = this.a
    if (a.length === 0) return null
    const top = a[0]
    const last = a.pop()
    if (a.length > 0) {
      a[0] = last
      let i = 0
      const n = a.length
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2
        let s = i
        if (l < n && a[l].f < a[s].f) s = l
        if (r < n && a[r].f < a[s].f) s = r
        if (s === i) break
        ;[a[s], a[i]] = [a[i], a[s]]
        i = s
      }
    }
    return top
  }
  get size() { return this.a.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Obstacle grid
// ─────────────────────────────────────────────────────────────────────────────
export function buildObstacleGrid(nodes, opts = {}) {
  const cellSize = opts.cellSize || CELL
  const pad = opts.paddingCells ?? PADDING_CELLS
  const margin = opts.margin ?? MARGIN

  // Bounding box of all nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x + n.width  > maxX) maxX = n.x + n.width
    if (n.y + n.height > maxY) maxY = n.y + n.height
  }
  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = cellSize; maxY = cellSize
  }

  const originX = Math.floor((minX - margin) / cellSize) * cellSize
  const originY = Math.floor((minY - margin) / cellSize) * cellSize
  const cols = Math.ceil((maxX + margin - originX) / cellSize) + 1
  const rows = Math.ceil((maxY + margin - originY) / cellSize) + 1

  const blocked = new Uint8Array(cols * rows)
  const idx = (cx, cy) => cy * cols + cx

  const grid = {
    cellSize, originX, originY, cols, rows, blocked,
    inBounds(cx, cy) { return cx >= 0 && cy >= 0 && cx < cols && cy < rows },
    isBlocked(cx, cy) { return blocked[idx(cx, cy)] === 1 },
    block(cx, cy) { if (this.inBounds(cx, cy)) blocked[idx(cx, cy)] = 1 },
    unblock(cx, cy) { if (this.inBounds(cx, cy)) blocked[idx(cx, cy)] = 0 },
    toCell(x, y) {
      return {
        cx: Math.round((x - originX) / cellSize),
        cy: Math.round((y - originY) / cellSize),
      }
    },
    toAbs(cx, cy) {
      return { x: originX + cx * cellSize, y: originY + cy * cellSize }
    },
    // Apply f to each cell covered by the rect (inclusive of inflation).
    forEachRectCell(x, y, w, h, inflateCells, f) {
      const x0 = x - inflateCells * cellSize
      const y0 = y - inflateCells * cellSize
      const x1 = x + w + inflateCells * cellSize
      const y1 = y + h + inflateCells * cellSize
      const cx0 = Math.floor((x0 - originX) / cellSize)
      const cy0 = Math.floor((y0 - originY) / cellSize)
      const cx1 = Math.ceil ((x1 - originX) / cellSize)
      const cy1 = Math.ceil ((y1 - originY) / cellSize)
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (this.inBounds(cx, cy)) f(cx, cy)
        }
      }
    },
  }

  // Rasterize all nodes as obstacles, inflated by `pad` cells.
  for (const n of nodes) {
    grid.forEachRectCell(n.x, n.y, n.width, n.height, pad, (cx, cy) => grid.block(cx, cy))
  }

  return grid
}

// Temporarily clear obstacle cells under a node so the path can attach to it.
function withNodeUnblocked(grid, node, fn) {
  const cells = []
  grid.forEachRectCell(node.x, node.y, node.width, node.height, PADDING_CELLS, (cx, cy) => {
    if (grid.isBlocked(cx, cy)) {
      cells.push([cx, cy])
      grid.unblock(cx, cy)
    }
  })
  try { return fn() }
  finally { for (const [cx, cy] of cells) grid.block(cx, cy) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint selection
// ─────────────────────────────────────────────────────────────────────────────
export function chooseEndpoints(fromNode, toNode) {
  const fcx = fromNode.x + fromNode.width  / 2
  const fcy = fromNode.y + fromNode.height / 2
  const tcx = toNode.x   + toNode.width    / 2
  const tcy = toNode.y   + toNode.height   / 2
  const dx = tcx - fcx
  const dy = tcy - fcy

  let startSide, endSide
  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal dominance
    startSide = dx >= 0 ? 'right' : 'left'
    endSide   = dx >= 0 ? 'left'  : 'right'
  } else {
    // Vertical dominance
    startSide = dy >= 0 ? 'bottom' : 'top'
    endSide   = dy >= 0 ? 'top'    : 'bottom'
  }

  return {
    start:    sidePoint(fromNode, startSide),
    end:      sidePoint(toNode,   endSide),
    startDir: sideDir(startSide),
    endDir:   sideDir(endSide), // direction the arrow should approach FROM
  }
}

function sidePoint(node, side) {
  switch (side) {
    case 'right':  return { x: node.x + node.width,     y: node.y + node.height / 2 }
    case 'left':   return { x: node.x,                  y: node.y + node.height / 2 }
    case 'top':    return { x: node.x + node.width / 2, y: node.y }
    case 'bottom': return { x: node.x + node.width / 2, y: node.y + node.height }
  }
}

function sideDir(side) {
  switch (side) {
    case 'right':  return { dx:  1, dy:  0 }
    case 'left':   return { dx: -1, dy:  0 }
    case 'top':    return { dx:  0, dy: -1 }
    case 'bottom': return { dx:  0, dy:  1 }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A*
// ─────────────────────────────────────────────────────────────────────────────
function aStar(grid, startCx, startCy, goalCx, goalCy, startDirIdx) {
  const cols = grid.cols
  const rows = grid.rows

  // State key: cy * cols * 4 + cx * 4 + dir   (dir 0..3, or 4 for "no direction yet")
  // Use 5 directions to allow start with no direction.
  const NDIR = 5
  const stateKey = (cx, cy, d) => (cy * cols + cx) * NDIR + d

  const gScore = new Map()
  const cameFrom = new Map() // key → { px, py, pd }

  const heap = new MinHeap()
  const startD = startDirIdx ?? 4
  const startKey = stateKey(startCx, startCy, startD)
  gScore.set(startKey, 0)
  heap.push({
    f: Math.abs(goalCx - startCx) + Math.abs(goalCy - startCy),
    g: 0, cx: startCx, cy: startCy, d: startD,
  })

  while (heap.size > 0) {
    const cur = heap.pop()
    if (cur.cx === goalCx && cur.cy === goalCy) {
      // Reconstruct path
      const path = []
      let key = stateKey(cur.cx, cur.cy, cur.d)
      let { cx, cy, d } = cur
      while (true) {
        path.push({ cx, cy })
        const prev = cameFrom.get(key)
        if (!prev) break
        cx = prev.px; cy = prev.py; d = prev.pd
        key = stateKey(cx, cy, d)
      }
      path.reverse()
      return path
    }

    const curG = gScore.get(stateKey(cur.cx, cur.cy, cur.d))
    if (curG === undefined || curG < cur.g) continue // stale entry

    for (let nd = 0; nd < 4; nd++) {
      const ncx = cur.cx + DIRS[nd].dx
      const ncy = cur.cy + DIRS[nd].dy
      if (!grid.inBounds(ncx, ncy)) continue
      if (grid.isBlocked(ncx, ncy) && !(ncx === goalCx && ncy === goalCy)) continue

      let step = 1
      if (cur.d !== 4 && cur.d !== nd) step += TURN_PENALTY

      const ng = cur.g + step
      const nkey = stateKey(ncx, ncy, nd)
      const prevG = gScore.get(nkey)
      if (prevG !== undefined && prevG <= ng) continue
      gScore.set(nkey, ng)
      cameFrom.set(nkey, { px: cur.cx, py: cur.cy, pd: cur.d })
      heap.push({
        f: ng + Math.abs(goalCx - ncx) + Math.abs(goalCy - ncy),
        g: ng, cx: ncx, cy: ncy, d: nd,
      })
    }
  }

  return null
}

// Collapse colinear runs into segment endpoints (keep only corners).
function simplify(cells) {
  if (cells.length < 3) return cells.slice()
  const out = [cells[0]]
  for (let i = 1; i < cells.length - 1; i++) {
    const a = cells[i - 1], b = cells[i], c = cells[i + 1]
    const dx1 = b.cx - a.cx, dy1 = b.cy - a.cy
    const dx2 = c.cx - b.cx, dy2 = c.cy - b.cy
    if (dx1 !== dx2 || dy1 !== dy2) out.push(b)
  }
  out.push(cells[cells.length - 1])
  return out
}

// Same as `simplify` but in absolute (x,y) space — used after we splice in
// alignment joiners that may produce colinear triples.
function simplifyAbs(pts) {
  if (pts.length < 3) return pts.slice()
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1]
    // Drop if duplicate of previous
    if (b.x === a.x && b.y === a.y) continue
    // Drop if colinear
    const horizontal1 = a.y === b.y
    const horizontal2 = b.y === c.y
    const vertical1   = a.x === b.x
    const vertical2   = b.x === c.x
    if ((horizontal1 && horizontal2) || (vertical1 && vertical2)) continue
    out.push(b)
  }
  const last = pts[pts.length - 1]
  if (last.x !== out[out.length - 1].x || last.y !== out[out.length - 1].y) {
    out.push(last)
  }
  return out
}

// Replace pts[0] with `start`, and ensure the first segment is axis-aligned
// along `dir` by splicing in a joiner if needed.
function alignFirst(pts, start, dir) {
  if (pts.length === 0) return [start]
  pts[0] = { x: start.x, y: start.y }
  if (pts.length < 2) return pts
  const next = pts[1]
  const horizontal = dir.dx !== 0
  const aligned = horizontal ? (next.y === start.y) : (next.x === start.x)
  if (!aligned) {
    const joiner = horizontal
      ? { x: next.x, y: start.y }
      : { x: start.x, y: next.y }
    pts.splice(1, 0, joiner)
  }
  return pts
}

// Replace pts[last] with `end`, and ensure the final segment is axis-aligned
// perpendicular to `dir` (which is the outward normal of the entry side).
function alignLast(pts, end, dir) {
  if (pts.length === 0) return [end]
  pts[pts.length - 1] = { x: end.x, y: end.y }
  if (pts.length < 2) return pts
  const prev = pts[pts.length - 2]
  const horizontal = dir.dx !== 0
  const aligned = horizontal ? (prev.y === end.y) : (prev.x === end.x)
  if (!aligned) {
    const joiner = horizontal
      ? { x: prev.x, y: end.y }
      : { x: end.x, y: prev.y }
    pts.splice(pts.length - 1, 0, joiner)
  }
  return pts
}

// L-shape fallback: 2 segments meeting at a corner.
function lShape(start, end, startDir) {
  // If exit is horizontal, corner = (end.x, start.y); else (start.x, end.y)
  const horizontal = startDir.dx !== 0
  const corner = horizontal
    ? { x: end.x,   y: start.y }
    : { x: start.x, y: end.y   }
  return [start, corner, end]
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: route a single edge
// ─────────────────────────────────────────────────────────────────────────────
export function routeOrthogonal(grid, start, end, startDir, endDir) {
  const { cx: scx, cy: scy } = grid.toCell(start.x, start.y)
  const { cx: gcx, cy: gcy } = grid.toCell(end.x,   end.y)

  if (!grid.inBounds(scx, scy) || !grid.inBounds(gcx, gcy)) {
    return lShape(start, end, startDir)
  }

  const path = aStar(grid, scx, scy, gcx, gcy, dirIndex(startDir.dx, startDir.dy))
  if (!path || path.length === 0) {
    return lShape(start, end, startDir)
  }

  const corners = simplify(path)
  // Convert grid cells to absolute coords, then align first/last segments to
  // the exact perimeter points using axis-aligned joiners so we never produce
  // a diagonal stub.
  let pts = corners.map(c => grid.toAbs(c.cx, c.cy))
  // Push endpoints OUT of the node along the side normal so the arrow head
  // renders in free space rather than under the next node.
  const startOut = {
    x: start.x + startDir.dx * ENDPOINT_GAP,
    y: start.y + startDir.dy * ENDPOINT_GAP,
  }
  // endDir is the outward normal of the target's entry side (e.g. {-1,0} for
  // left side), so adding it pushes the endpoint OUT of the node.
  const endOut = {
    x: end.x + endDir.dx * ENDPOINT_GAP,
    y: end.y + endDir.dy * ENDPOINT_GAP,
  }
  pts = alignFirst(pts, startOut, startDir)
  pts = alignLast(pts, endOut, endDir)
  pts = simplifyAbs(pts)
  return pts
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: route every edge in one pass
// ─────────────────────────────────────────────────────────────────────────────
export function routeAllEdges(nodes, edges) {
  const out = new Map()
  if (!nodes.length || !edges.length) return out

  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const grid = buildObstacleGrid(nodes)

  for (const edge of edges) {
    const from = nodeById.get(edge.from)
    const to   = nodeById.get(edge.to)
    if (!from || !to) continue

    const { start, end, startDir, endDir } = chooseEndpoints(from, to)

    const pts = withNodeUnblocked(grid, from, () =>
      withNodeUnblocked(grid, to, () =>
        routeOrthogonal(grid, start, end, startDir, endDir)
      )
    )
    out.set(edge.id, pts)
  }

  return out
}
