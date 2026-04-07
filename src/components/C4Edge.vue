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
      bestMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 8 }
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
      v-if="edge.label && labelPos"
      :x="labelPos.x - edge.label.length * 3.5 - 6"
      :y="labelPos.y - 10"
      :width="edge.label.length * 7 + 12"
      :height="18"
      rx="3"
      fill="white"
      stroke="#e2e8f0"
      stroke-width="1"
    />
    <text
      v-if="edge.label && labelPos"
      :x="labelPos.x"
      :y="labelPos.y + 3"
      text-anchor="middle"
      fill="#475569"
      font-size="11"
      font-family="sans-serif"
    >
      {{ edge.label }}
    </text>
  </g>
</template>
