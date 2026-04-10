<script setup>
import { computed } from 'vue'

const props = defineProps({
  edge: { type: Object, required: true },
})

const polylinePoints = computed(() => {
  const pts = props.edge.points
  if (!pts || pts.length < 2) return null
  return pts.map(p => `${p.x},${p.y}`).join(' ')
})

// Split label on literal `\n` or real newlines so multi-line labels
// render as stacked tspans.
const LABEL_LINE_H = 13
const labelLines = computed(() => {
  const raw = props.edge.label
  if (!raw) return []
  return String(raw).split(/\\n|\n/)
})
const maxLineLength = computed(() => {
  let m = 0
  for (const line of labelLines.value) {
    if (line.length > m) m = line.length
  }
  return m
})

// Dotted (response) edges get a short-gap pattern distinct from the
// standard dashed pattern used for request/solid edges.
const strokeDasharray = computed(() =>
  props.edge.dotted ? '2 4' : '6 3'
)

// Label position is precomputed by the router (with overlap
// resolution across all edges). Fall back to a local "longest segment
// midpoint" calculation if the router didn't supply one (e.g. during
// the brief moment routing hasn't run yet).
const labelPos = computed(() => {
  if (props.edge.labelPos) return props.edge.labelPos
  const pts = props.edge.points
  if (!pts || pts.length < 2) return null
  let bestLen = -1
  let bestMid = { x: 0, y: 0 }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > bestLen) {
      bestLen = len
      const n = Math.max(labelLines.value.length, 1)
      const yOffset = 8 + (n - 1) * (LABEL_LINE_H / 2)
      bestMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - yOffset }
    }
  }
  return bestMid
})
</script>

<template>
  <g v-if="polylinePoints" class="c4-edge">
    <polyline
      :points="polylinePoints"
      fill="none"
      stroke="#64748b"
      stroke-width="1.5"
      :stroke-dasharray="strokeDasharray"
      stroke-linejoin="round"
      stroke-linecap="round"
      marker-end="url(#arrowhead)"
    />
    <text
      v-if="labelLines.length && labelPos"
      :x="labelPos.x"
      :y="labelPos.y + 3"
      :text-anchor="edge.labelAnchor || 'middle'"
      fill="#475569"
      font-size="11"
      font-family="sans-serif"
    ><tspan
        v-for="(line, i) in labelLines"
        :key="i"
        :x="labelPos.x"
        :dy="i === 0 ? 0 : LABEL_LINE_H"
      >{{ line }}</tspan></text>
  </g>
</template>
