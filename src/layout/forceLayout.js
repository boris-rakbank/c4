/**
 * Fruchterman–Reingold-style force-directed layout with mandatory
 * grid snapping as a post-processing step.
 *
 * Pure module — no Vue / Pinia dependencies.
 *
 * Phase 1: run the physics simulation for `iterations` steps.
 *   - repulsion between every pair of nodes (1/d^2)
 *   - attraction along edges (linear spring relaxed to idealEdgeLength)
 *     - directed: source node feels 1.2x force, target feels 0.4x
 *     - undirected: equal force on both
 *   - light gravity pulling toward canvas center
 *   - velocity damping + Euler integration + bounds clamp
 *
 * Phase 2: snap every node's top-left to the nearest grid point, then
 * resolve collisions greedily (closest snap distance wins the cell;
 * later nodes shift +gridSize along X until free).
 *
 * Returns a list `[{ id, x, y }, ...]` of new top-left positions.
 */

const DEFAULTS = {
  idealEdgeLength:   600,   // center-to-center ≈ 3×NODE_WIDTH (=2×width gap)
  repulsionStrength: 180_000,
  attractionFactor:  0.05,
  damping:           0.85,
  dt:                0.4,
  gravityFactor:     0.002,
  iterations:        300,
  padding:           40,
  // Anisotropy: physics runs in a virtual space where y is multiplied
  // by yScale. The default 2.5 gives horizontal gaps ≈ 2× node width
  // and vertical gaps ≈ 1× node height (600/240 = 2.5), yielding a
  // wide, flat layout rather than a square cloud.
  yScale:            2.5,
}

export function applyForceLayout({
  nodes,
  edges,
  canvas,
  gridSize,
  directed = true,
  options = {},
} = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return []

  const opts = { ...DEFAULTS, ...options }
  const yScale = opts.yScale || 1

  // Simulate on centers, in a virtual space where y is pre-scaled by
  // yScale so a single isotropic idealEdgeLength produces different
  // horizontal vs vertical gaps. h is also scaled so clamp and
  // repulsion treat a node as a taller box in virtual space.
  const state = new Map()
  for (const n of nodes) {
    state.set(n.id, {
      id: n.id,
      x: n.x + n.width / 2,
      y: (n.y + n.height / 2) * yScale,
      vx: 0,
      vy: 0,
      w: n.width,
      h: n.height * yScale,
    })
  }

  const edgeList = []
  for (const e of edges || []) {
    const a = state.get(e.from)
    const b = state.get(e.to)
    if (a && b && a !== b) edgeList.push([a, b])
  }

  // Canvas is given in real coords; scale its y extent so the clamp
  // operates consistently in virtual space.
  const cw = canvas.width
  const ch = canvas.height * yScale
  const centerX = cw / 2
  const centerY = ch / 2
  const padX = opts.padding
  const padY = opts.padding * yScale

  const arr = Array.from(state.values())

  for (let iter = 0; iter < opts.iterations; iter++) {
    // Repulsion — every pair
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i]
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) {
          // exact overlap — jitter a tiny amount so force has a
          // direction
          d2 = 1
          dx = (Math.random() - 0.5)
          dy = (Math.random() - 0.5)
        }
        const d = Math.sqrt(d2)
        const force = opts.repulsionStrength / d2
        const fx = (dx / d) * force
        const fy = (dy / d) * force
        a.vx += fx; a.vy += fy
        b.vx -= fx; b.vy -= fy
      }
    }

    // Attraction — connected pairs only
    for (const [a, b] of edgeList) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.max(Math.hypot(dx, dy), 0.01)
      const force = (d - opts.idealEdgeLength) * opts.attractionFactor
      const fx = (dx / d) * force
      const fy = (dy / d) * force
      if (directed) {
        a.vx += fx * 1.2
        a.vy += fy * 1.2
        b.vx -= fx * 0.4
        b.vy -= fy * 0.4
      } else {
        a.vx += fx; a.vy += fy
        b.vx -= fx; b.vy -= fy
      }
    }

    // Center gravity
    for (const n of arr) {
      n.vx += (centerX - n.x) * opts.gravityFactor
      n.vy += (centerY - n.y) * opts.gravityFactor
    }

    // Integrate + clamp
    for (const n of arr) {
      n.vx *= opts.damping
      n.vy *= opts.damping
      n.x  += n.vx * opts.dt
      n.y  += n.vy * opts.dt
      n.x = Math.max(padX + n.w / 2, Math.min(cw - padX - n.w / 2, n.x))
      n.y = Math.max(padY + n.h / 2, Math.min(ch - padY - n.h / 2, n.y))
    }
  }

  // Phase 2 — convert virtual y back to real space, snap top-left to
  // grid, resolve collisions.
  const snapped = arr.map(n => {
    const topLeftX = n.x - n.w / 2
    // n.h was scaled by yScale on input, so /yScale gives real height
    const realH = n.h / yScale
    const topLeftY = n.y / yScale - realH / 2
    const sx = Math.round(topLeftX / gridSize) * gridSize
    const sy = Math.round(topLeftY / gridSize) * gridSize
    return {
      id: n.id,
      x: sx,
      y: sy,
      dist: Math.hypot(sx - topLeftX, sy - topLeftY),
    }
  })

  // Closest-to-snap nodes get their cell first; conflicts shift right.
  snapped.sort((a, b) => a.dist - b.dist)
  const taken = new Set()
  for (const s of snapped) {
    let key = `${s.x},${s.y}`
    while (taken.has(key)) {
      s.x += gridSize
      key = `${s.x},${s.y}`
    }
    taken.add(key)
  }

  return snapped.map(s => ({ id: s.id, x: s.x, y: s.y }))
}
