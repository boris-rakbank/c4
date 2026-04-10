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
const STUB_LENGTH = 24     // px — minimum straight segment perpendicular to
                           // the node side, both leaving source and entering
                           // target. The polyline still terminates on the
                           // perimeter (so the arrow tip touches the node),
                           // but A* routes between "stub" points offset
                           // outward, guaranteeing this straight approach.

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
function nodeCenter(node) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

// Pick which side of source / target each edge should attach to, based on the
// center-to-center vector's dominant axis.
export function pickSides(fromNode, toNode) {
  const f = nodeCenter(fromNode)
  const t = nodeCenter(toNode)
  const dx = t.x - f.x
  const dy = t.y - f.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      startSide: dx >= 0 ? 'right' : 'left',
      endSide:   dx >= 0 ? 'left'  : 'right',
    }
  }
  return {
    startSide: dy >= 0 ? 'bottom' : 'top',
    endSide:   dy >= 0 ? 'top'    : 'bottom',
  }
}

export function chooseEndpoints(fromNode, toNode) {
  const { startSide, endSide } = pickSides(fromNode, toNode)
  return {
    start:    sidePointAt(fromNode, startSide, 0.5),
    end:      sidePointAt(toNode,   endSide,   0.5),
    startDir: sideDir(startSide),
    endDir:   sideDir(endSide), // direction the arrow should approach FROM
  }
}

// Return a point on `side` of `node`, at `fraction` (0..1) along that side.
// For horizontal sides (top/bottom) the fraction runs along X (0 = left edge,
// 1 = right edge). For vertical sides (left/right) it runs along Y.
function sidePointAt(node, side, fraction) {
  const f = Math.max(0, Math.min(1, fraction))
  switch (side) {
    case 'right':  return { x: node.x + node.width,       y: node.y + node.height * f }
    case 'left':   return { x: node.x,                    y: node.y + node.height * f }
    case 'top':    return { x: node.x + node.width * f,   y: node.y }
    case 'bottom': return { x: node.x + node.width * f,   y: node.y + node.height }
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
function aStar(grid, startCx, startCy, goalCx, goalCy, startDirIdx, goalDirIdx, extraCost) {
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
    if (cur.cx === goalCx && cur.cy === goalCy &&
        (goalDirIdx == null || cur.d === goalDirIdx)) {
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
      // Soft penalty for cells already used by previously routed
      // edges — spreads parallel Z-shaped paths apart.
      if (extraCost) step += extraCost(ncx, ncy)

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

// Rectangular self-loop wrapping around the right side of `node`.
// Exits the top side at `topFrac`, travels up, out to the right past
// the node, down to below the node, then back in to the bottom side
// at `bottomFrac` — a C-shape around the right edge.
//
// `topFrac` / `bottomFrac` are slot fractions assigned by the normal
// per-side distribution pass, so the loop's anchors coexist with any
// non-self-loop edges attached to the same sides. `index` is the
// 0-based self-loop index on this node and controls only the bend
// distance D, so multiple self-loops on one node nest as concentric
// rectangles to the right of the node instead of overlapping.
function buildSelfLoop(node, index = 0, topFrac = 0.75, bottomFrac = 0.75) {
  const BASE_D = 25  // initial bend distance past the node edge
  const STEP_D = 22  // added bend distance per nested loop
  const D = BASE_D + index * STEP_D

  const x = node.x, y = node.y, w = node.width, h = node.height
  const topX    = x + w * topFrac
  const bottomX = x + w * bottomFrac
  return [
    { x: topX,       y: y         },   // start at top side
    { x: topX,       y: y - D     },   // up
    { x: x + w + D,  y: y - D     },   // right past the node
    { x: x + w + D,  y: y + h + D },   // down past the node
    { x: bottomX,    y: y + h + D },   // back left
    { x: bottomX,    y: y + h     },   // end at bottom side
  ]
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
export function routeOrthogonal(grid, start, end, startDir, endDir, extraCost) {
  // Route A* between "stub" points offset outside each node along the side
  // normal. The actual perimeter points (`start`, `end`) are prepended /
  // appended afterwards, so the polyline still terminates on the node edge
  // (arrow tip touches the node) but is guaranteed to have a straight
  // perpendicular stub of length STUB_LENGTH at each end.
  const startStub = {
    x: start.x + startDir.dx * STUB_LENGTH,
    y: start.y + startDir.dy * STUB_LENGTH,
  }
  const endStub = {
    x: end.x + endDir.dx * STUB_LENGTH,
    y: end.y + endDir.dy * STUB_LENGTH,
  }

  const { cx: scx, cy: scy } = grid.toCell(startStub.x, startStub.y)
  const { cx: gcx, cy: gcy } = grid.toCell(endStub.x,   endStub.y)

  if (!grid.inBounds(scx, scy) || !grid.inBounds(gcx, gcy)) {
    return lShape(start, end, startDir)
  }

  const startDirIdx = dirIndex(startDir.dx, startDir.dy)
  // Force A* to arrive at the goal stub from the direction opposite to
  // endDir (endDir is the outward normal of the target's entry side, so
  // the approach direction is its inverse). This guarantees the final
  // segment is perpendicular to the target side — a clean Z-shape rather
  // than a bend that slams into the node from the wrong side.
  const goalDirIdx = dirIndex(-endDir.dx, -endDir.dy)
  let path = aStar(grid, scx, scy, gcx, gcy, startDirIdx, goalDirIdx, extraCost)
  // Fallback: if the strict entry direction is unreachable, relax the
  // constraint.
  if (!path || path.length === 0) {
    path = aStar(grid, scx, scy, gcx, gcy, startDirIdx, undefined, extraCost)
  }
  if (!path || path.length === 0) {
    return lShape(start, end, startDir)
  }

  const corners = simplify(path)
  // Convert grid cells to absolute coords, align first/last segments to the
  // exact stub points (to kill any diagonal caused by grid rounding), then
  // prepend the perimeter start and append the perimeter end.
  let pts = corners.map(c => grid.toAbs(c.cx, c.cy))
  pts = alignFirst(pts, startStub, startDir)
  pts = alignLast(pts, endStub, endDir)
  pts.unshift({ x: start.x, y: start.y })
  pts.push({ x: end.x, y: end.y })
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

  // Per-cell "usage" counter: each time we route an edge we increment
  // the cells that edge's polyline passes through, and A* reads this
  // via `extraCost` to add a soft penalty for reusing a line. This
  // spreads parallel Z-shaped paths apart — edges that would
  // naturally pick the same middle segment get pushed one cell aside
  // if the detour cost is below the reuse penalty.
  const REUSE_PENALTY = 3
  const usage = new Uint8Array(grid.cols * grid.rows)
  const cellUsageExtra = (cx, cy) => usage[cy * grid.cols + cx] * REUSE_PENALTY
  const markCellsUsed = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = grid.toCell(pts[i].x, pts[i].y)
      const b = grid.toCell(pts[i + 1].x, pts[i + 1].y)
      if (a.cx === b.cx) {
        const lo = Math.min(a.cy, b.cy), hi = Math.max(a.cy, b.cy)
        for (let cy = lo; cy <= hi; cy++) {
          if (cy >= 0 && cy < grid.rows && a.cx >= 0 && a.cx < grid.cols) {
            usage[cy * grid.cols + a.cx]++
          }
        }
      } else if (a.cy === b.cy) {
        const lo = Math.min(a.cx, b.cx), hi = Math.max(a.cx, b.cx)
        for (let cx = lo; cx <= hi; cx++) {
          if (a.cy >= 0 && a.cy < grid.rows && cx >= 0 && cx < grid.cols) {
            usage[a.cy * grid.cols + cx]++
          }
        }
      }
    }
  }

  // ── Pass 1: pick sides, collect per-(node, side) groups ───────────────────
  // groups: Map<`${nodeId}|${side}`, Array<{ edgeId, otherCenter }>>
  const groups = new Map()
  const edgeMeta = new Map() // edgeId → { from, to, startSide, endSide }

  const addToGroup = (nodeId, side, edgeId, otherCenter) => {
    const key = `${nodeId}|${side}`
    let arr = groups.get(key)
    if (!arr) { arr = []; groups.set(key, arr) }
    arr.push({ edgeId, otherCenter })
  }

  // Per-node counter of how many self-loops we've already seen. Each
  // self-loop gets a sequential index so buildSelfLoop can nest their
  // rectangles at different bend distances (the D parameter).
  const selfLoopIndex = new Map() // nodeId → next index

  for (const edge of edges) {
    const from = nodeById.get(edge.from)
    const to   = nodeById.get(edge.to)
    if (!from || !to) continue
    // Self-loops get a fixed nested-rectangle loop on the right side
    // of the node — A* cannot route source === target cleanly (every
    // A* cell pair degenerates), and pickSides' center-to-center
    // vector is zero.
    //
    // To pick anchor fractions along the top/bottom that don't collide
    // with non-self-loop edges on those sides, we still add the
    // self-loop to the top and bottom groups with a virtual
    // "otherCenter" pushed far off the node's right — which sorts the
    // loop to the end of each group. We nudge successive self-loops
    // further right so their otherCenters stay ordered and they each
    // get their own slot fraction from the generic distribution pass.
    if (from === to) {
      const idx = selfLoopIndex.get(from.id) || 0
      selfLoopIndex.set(from.id, idx + 1)
      edgeMeta.set(edge.id, {
        from, to,
        startSide: 'top', endSide: 'bottom',
        selfLoop: true,
        selfLoopIndex: idx,
      })
      // Virtual "other side" well off to the right so the slot
      // distribution sorts self-loops to the rightmost slots of the
      // top and bottom groups, *after* all normal edges.
      const virtualX = from.x + from.width + 10_000 + idx
      const topY     = from.y - 1
      const bottomY  = from.y + from.height + 1
      addToGroup(from.id, 'top',    edge.id, { x: virtualX, y: topY })
      addToGroup(from.id, 'bottom', edge.id, { x: virtualX, y: bottomY })
      continue
    }
    const { startSide, endSide } = pickSides(from, to)
    edgeMeta.set(edge.id, { from, to, startSide, endSide })
    addToGroup(from.id, startSide, edge.id, nodeCenter(to))
    addToGroup(to.id,   endSide,   edge.id, nodeCenter(from))
  }

  // ── Assign slot fractions within each group ───────────────────────────────
  // slotFor: Map<`${edgeId}|${role}`, fraction>  (role = 'start' | 'end')
  // We key by nodeId+side to keep source/target slots separate even when the
  // same edge appears in two groups.
  const slotFor = new Map()
  for (const [key, arr] of groups) {
    const [, side] = key.split('|')
    const horizontal = side === 'top' || side === 'bottom'
    arr.sort((a, b) =>
      horizontal ? a.otherCenter.x - b.otherCenter.x
                 : a.otherCenter.y - b.otherCenter.y
    )
    const n = arr.length
    for (let i = 0; i < n; i++) {
      const fraction = (i + 1) / (n + 1)
      slotFor.set(`${arr[i].edgeId}|${key}`, fraction)
    }
  }

  // ── Pass 2: route each edge with its slotted attachment points ────────────
  for (const edge of edges) {
    const meta = edgeMeta.get(edge.id)
    if (!meta) continue
    const { from, to, startSide, endSide } = meta

    const startFrac = slotFor.get(`${edge.id}|${from.id}|${startSide}`) ?? 0.5
    const endFrac   = slotFor.get(`${edge.id}|${to.id}|${endSide}`)   ?? 0.5

    if (meta.selfLoop) {
      // startFrac / endFrac were assigned by the normal slot
      // distribution — they already avoid the slots taken by
      // non-self-loop edges on the top and bottom sides. The
      // self-loop index controls only the rectangle bend distance D
      // (nested loops), not the anchor fractions anymore.
      const loopPts = buildSelfLoop(from, meta.selfLoopIndex, startFrac, endFrac)
      out.set(edge.id, {
        points:      loopPts,
        slotOut:     { side: startSide, fraction: startFrac },
        slotIn:      { side: endSide,   fraction: endFrac },
        // selfLabelX pins the label's left edge just past the node's right
        // side; assignLabelLayout uses it to override midX while still
        // computing and collision-resolving y normally.
        selfLabelX:  from.x + from.width + 6,
        labelAnchor: 'start',
      })
      continue
    }

    const start    = sidePointAt(from, startSide, startFrac)
    const end      = sidePointAt(to,   endSide,   endFrac)
    const startDir = sideDir(startSide)
    const endDir   = sideDir(endSide)

    const points = withNodeUnblocked(grid, from, () =>
      withNodeUnblocked(grid, to, () =>
        routeOrthogonal(grid, start, end, startDir, endDir, cellUsageExtra)
      )
    )
    // Mark this edge's cells as used so the next edge's A* prefers
    // fresh corridors — this is what spreads parallel Z paths.
    if (points && points.length > 1) markCellsUsed(points)
    out.set(edge.id, {
      points,
      slotOut: { side: startSide, fraction: startFrac },
      slotIn:  { side: endSide,   fraction: endFrac },
    })
  }

  // ── Pass 3: compute and distribute edge label positions ─────────────────
  // Each label is anchored at the midpoint of the longest polyline
  // segment. Labels whose bounding boxes horizontally overlap AND sit at
  // similar Y end up stacked on top of each other in the render — so we
  // sweep through them left-to-right and shift colliding labels downward
  // by a line-height at a time until no overlap remains.
  assignLabelLayout(edges, out)

  return out
}

// Label bounding-box constants — match the render in C4Edge.vue.
const LABEL_CHAR_W = 7      // approx char width in px at font-size 11
const LABEL_LINE_H = 13
const LABEL_V_GAP  = 4      // minimum gap between stacked labels
const LABEL_Y_LIFT = 8      // same lift applied in C4Edge

function assignLabelLayout(edges, routeMap) {
  const labels = []
  for (const edge of edges) {
    const info = routeMap.get(edge.id)
    if (!info || !info.points || info.points.length < 2) continue
    const rawLines = String(edge.label || '').split(/\\n|\n/).filter(Boolean)
    if (rawLines.length === 0) continue

    const maxLen = rawLines.reduce((m, l) => Math.max(m, l.length), 0)
    const width  = maxLen * LABEL_CHAR_W
    const height = rawLines.length * LABEL_LINE_H
    const n      = rawLines.length

    // Anchor at the midpoint of the longest polyline segment.
    const pts = info.points
    let bestLen = -1, midX = 0, midY = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len > bestLen) {
        bestLen = len
        const yLift = LABEL_Y_LIFT + (n - 1) * (LABEL_LINE_H / 2)
        midX = info.selfLabelX ?? (a.x + b.x) / 2
        midY = (a.y + b.y) / 2 - yLift
      }
    }
    labels.push({ info, x: midX, y: midY, width, height })
  }

  // Greedy collision resolution: process labels left-to-right, for each
  // one check against all previously placed labels; if horizontally
  // overlapping AND too-close vertically, shift this label just below
  // the colliding one.
  labels.sort((a, b) => a.x - b.x)
  for (let i = 0; i < labels.length; i++) {
    const L = labels[i]
    let changed = true
    let guard = 0
    while (changed && guard++ < 50) {
      changed = false
      for (let j = 0; j < i; j++) {
        const O = labels[j]
        const xOverlap = Math.abs(L.x - O.x) < (L.width + O.width) / 2
        if (!xOverlap) continue
        const yDist = Math.abs(L.y - O.y)
        const yNeeded = (L.height + O.height) / 2 + LABEL_V_GAP
        if (yDist < yNeeded) {
          L.y = O.y + yNeeded
          changed = true
          break
        }
      }
    }
    L.info.labelPos = { x: L.x, y: L.y }
  }
}
