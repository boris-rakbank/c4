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

// Place the label at the midpoint of the longest segment in the polyline.
// Long segments are usually horizontal/vertical and give the cleanest reading.
const labelPos = computed(() => {
  const pts = props.edge.points
  if (!pts || pts.length < 2) return null
  let bestLen = -1
  let bestMid = { x: 0, y: 0 }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > bestLen) {
      bestLen = len
      // Center the label block vertically on the segment midpoint.
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
      stroke-dasharray="6 3"
      stroke-linejoin="round"
      stroke-linecap="round"
      marker-end="url(#arrowhead)"
    />
    <rect
      v-if="labelLines.length && labelPos"
      :x="labelPos.x - maxLineLength * 3.5 - 6"
      :y="labelPos.y - 10"
      :width="maxLineLength * 7 + 12"
      :height="18 + (labelLines.length - 1) * LABEL_LINE_H"
      rx="3"
      fill="white"
      stroke="#e2e8f0"
      stroke-width="1"
    />
    <text
      v-if="labelLines.length && labelPos"
      :x="labelPos.x"
      :y="labelPos.y + 3"
      text-anchor="middle"
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
