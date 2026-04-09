# Connection routing & path drawing

This document describes how the C4 editor turns a list of
`{ from, to, label }` edges into the polylines you see on the canvas.
All the code lives in
[src/routing/orthogonalRouter.js](../src/routing/orthogonalRouter.js)
and is called from the `routedEdges` computed in
[src/stores/diagramStore.js](../src/stores/diagramStore.js).

The routing runs in **four passes** inside `routeAllEdges(nodes, edges)`:

1. Build the obstacle grid.
2. For each edge, pick which side of source/target it attaches to and
   put it into per-side groups so we can distribute multiple edges
   along a shared side.
3. Route each edge with A* (or a fixed shape for self-loops).
4. Lay out every edge label and resolve horizontal collisions.

---

## Pass 1 — Obstacle grid

`buildObstacleGrid(nodes)` rasterises every node's rectangle into a
uniform grid with cell size `CELL = 20px` (matching the background
pattern) and a margin of `4 * CELL = 80px` around the bounding box of
the whole diagram.

Each node rectangle is inflated by `PADDING_CELLS = 1` cell in every
direction before being marked as blocked, so A* paths can never hug
a node edge — there is always at least one free cell of clearance
between a routed line and any obstacle.

The grid exposes `toCell(x, y)` / `toAbs(cx, cy)` for converting
between absolute SVG pixels and grid coordinates, plus helpers
`block` / `unblock` / `isBlocked`.

When we actually route an edge we temporarily clear the source and
target obstacles with `withNodeUnblocked(grid, node, fn)` — otherwise
A* could not reach the cells under the endpoints.

---

## Pass 2 — Endpoint selection & slot distribution

### Side selection (`pickSides`)

For a non-self-loop edge we pick which side of the source and target
nodes the edge should attach to using a simple center-to-center
dominance rule:

```text
dx, dy = centerOf(to) - centerOf(from)
|dx| >= |dy|   → horizontal: source.right/left, target.left/right
otherwise      → vertical:   source.bottom/top, target.top/bottom
```

This gives every edge a fixed `(startSide, endSide)` pair that the
rest of the pipeline can assume.

### Multi-edge slot distribution

A node often has several edges entering or leaving the same side.
Without distribution they would all attach at the center of that side
and visually stack. We fix this by grouping edges:

```text
groups: Map<`${nodeId}|${side}`, Array<{ edgeId, otherCenter }>>
```

Each edge appears in **two** groups — one for its source side on the
source node, one for its target side on the target node. Both ends
are tracked independently so an edge that shares its source side with
two siblings and its target side with four different siblings is
slotted correctly on both ends.

Within each group we sort by the other endpoint's center coordinate
(by `y` for left/right groups, by `x` for top/bottom groups) so
lines tend not to cross each other. Then slot fractions are assigned
evenly:

```text
slot_i = (i + 1) / (n + 1)     for i = 0..n-1
```

So two edges on a side get slots `0.33` and `0.67`; three get
`0.25 / 0.5 / 0.75`; a single edge stays at `0.5` — identical to the
pre-distribution midpoint behavior. `sidePointAt(node, side, fraction)`
converts a fraction into an absolute perimeter point.

### Unique edge ids

`${from}-${to}` is not unique when a diagram has multiple edges
between the same pair of nodes (common in converted sequence
diagrams — request + response + retries). The parser at
[src/parser/mermaidParser.js](../src/parser/mermaidParser.js)
suffixes repeated pairs with `#2`, `#3`, … via `edgeIdFor`, so each
edge occurrence has a distinct id and therefore a distinct slot.
The `%% @edge` comment rewriter mirrors the same counting so
persisted metadata lines still line up with the right edge.

---

## Pass 3 — Path routing

### Normal edges (`routeOrthogonal`)

Given `(start, end, startDir, endDir)` where the `Dir`s are outward
normals of the attach sides, we do the following:

1. **Stub offsets.** The real start and end points sit on the node
   perimeter. We build `startStub = start + startDir * STUB_LENGTH`
   and `endStub = end + endDir * STUB_LENGTH` (`STUB_LENGTH = 24px`).
   These are the points A* actually routes **between**, which
   guarantees every polyline has a perpendicular straight stub of at
   least 24px entering and leaving each node — no diagonal hooks, no
   path bending right next to the node edge.
2. **A\* search on the grid** between the stubs' grid cells, with:
   - Monotone move cost `1` per step and a `TURN_PENALTY = 5` added
     whenever the direction changes, so paths prefer long straight
     runs over wiggles.
   - State keyed by `(cx, cy, lastDir)` (5 directions counting "none"
     for the start) so the turn penalty is applied correctly.
   - **Cell-reuse penalty**: a per-cell `usage` counter is maintained
     across the whole pass. Each time an edge is routed, every cell
     its polyline passes through is incremented. A\* reads this via
     an `extraCost(cx, cy)` closure and adds `usage[cell] * REUSE_PENALTY`
     (currently `3`) to the step cost. The result is that the
     second edge in a parallel cluster prefers to detour one cell
     sideways rather than reuse the first edge's corridor — this is
     what spreads parallel Z-shaped paths instead of stacking them.
     The penalty is deliberately lower than `TURN_PENALTY` so that
     obvious short routes still win.
   - **Goal-direction constraint**: the goal cell may only be reached
     moving in the direction opposite to `endDir` (i.e. the approach
     direction into the target side). This guarantees the final
     segment is perpendicular to the target side, producing a clean
     Z-shape instead of a wrong-side ram.
   - **Fallback**: if the strict goal-direction A\* finds no path
     (e.g. another obstacle wedged against the entry side), we retry
     without the constraint; if that also fails we fall back to a
     2-segment L-shape.
3. **Simplify & align.** A\* returns a cell path; `simplify` collapses
   colinear runs down to corners, `grid.toAbs` maps them back to
   pixels, and `alignFirst` / `alignLast` splice in joiner points if
   needed so the first and last segments are axis-aligned along the
   stub directions (kills any sub-cell diagonals introduced by grid
   rounding). We then prepend the perimeter start and append the
   perimeter end so the arrow tip touches the node.

### Self-loops (`buildSelfLoop`)

An edge where `from === to` cannot be routed by A\* (both cells
coincide) and `pickSides` would return a zero vector. Self-loops are
detected in Pass 2 and skipped past the slot groups entirely. Instead
each self-loop gets a per-node index (first loop = 0, second = 1, …),
and `buildSelfLoop(node, index)` emits a fixed 6-point C-shape
wrapped around the **right** side of the node:

```text
  top side → up → right past node → down past node → back left → bottom side
```

`index` controls two parameters so multiple self-loops on the same
node nest as concentric rectangles rather than stacking:

- bend distance `D = 25 + index * 22` (each loop bends further out
  to the right)
- anchor fraction along top/bottom `f = 0.78 - index * 0.12`
  (each loop's anchor moves leftward along the node)

---

### Dotted (response) edges

The parser tracks each edge's arrow style via a small helper
`isDottedArrow(arrow)` — any arrow token containing a `.` is treated
as dotted, which matches Mermaid's dotted flowchart arrow forms
(`-.->`, `-.-.->`, etc.). The `edge.dotted` boolean flows through
the router unchanged (routing is pure geometry — style doesn't
affect paths) and ends up on the polyline in
[C4Edge.vue](../src/components/C4Edge.vue) where
`stroke-dasharray` is a computed property:

- `edge.dotted === true` → `"2 4"` — short-gap dotted stroke
- otherwise                → `"6 3"` — the default dashed stroke

This is also how the sequence-diagram converter at
[sequenceConverter.js](../src/parser/sequenceConverter.js) preserves
the solid/dashed distinction from the original `sequenceDiagram`:
request messages (`->>`) become solid `-->` edges, response messages
(`-->>`) become dotted `-.->` edges. The rendered graph therefore
retains the visual semantic of the original sequence.

---

## Pass 4 — Label layout & overlap resolution

Each edge's label is drawn as one or more `<tspan>` lines by
[C4Edge.vue](../src/components/C4Edge.vue), anchored at a position
chosen by the router in `assignLabelLayout(edges, routeMap)`.

1. **Initial anchor.** For each edge, walk its polyline and find the
   segment with the greatest length; the label anchor is the midpoint
   of that segment, lifted by `8px + (n-1) * 6.5px` where `n` is the
   number of label lines (so the label block sits centered on the
   segment regardless of how many lines it has).
2. **Bounding box** is computed from the text: `width = maxLineLen * 7`,
   `height = lineCount * 13` (matching the `font-size: 11px` render
   in C4Edge).
3. **Collision sweep.** Labels are sorted left-to-right by anchor `x`.
   For each label `L`, against every previously-placed label `O`, if
   their x-ranges overlap AND their y-distance is less than
   `(L.height + O.height) / 2 + 4px`, `L` is shifted **downward** to
   just below `O`. The check repeats until `L` no longer collides
   with anything (capped at 50 iterations per label as a safety
   guard).

This guarantees that clusters of parallel edges with parallel long
segments (the classic "many DA→MW lines between two nodes" scenario)
end up with stacked, non-overlapping labels instead of a single pile
of text.

---

## Persistence of routing decisions

The fractional slot assignment and the full polyline of every edge
are written back into the Mermaid source as `%% @edge <id> ...`
comments on drag-finish by the store's `persistEdgeRoutesToSource`.
Node positions are persisted the same way as `%% @pos` comments.
Both survive a re-parse, so manual layout work is preserved across
edits.

The parser simply skips any line starting with `%%`, so these
comments are pure metadata — they never feed back into the router
(which always recomputes from current node positions and edge pairs).
They're purely informational for humans reading or diffing the
source.

---

## Constants at a glance

| constant         | value | role                                          |
|------------------|-------|-----------------------------------------------|
| `CELL`           | 20    | A\* grid cell size (matches background grid)  |
| `PADDING_CELLS`  | 1     | obstacle inflation around each node           |
| `MARGIN`         | 80    | grid bounding-box margin (4 cells)            |
| `TURN_PENALTY`   | 5     | A\* cost added per direction change           |
| `REUSE_PENALTY`  | 3     | A\* cost added per already-used cell (spread) |
| `STUB_LENGTH`    | 24    | minimum straight segment at each edge end     |
| `GRID_SIZE`      | 50    | drag-snap grid spacing (UI, not router)       |
| `LABEL_CHAR_W`   | 7     | approx label char width @ font-size 11        |
| `LABEL_LINE_H`   | 13    | label line height                             |
| `LABEL_V_GAP`    | 4     | min vertical gap between stacked labels       |
| `LABEL_Y_LIFT`   | 8     | how much the label sits above its segment     |
