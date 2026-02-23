<script setup>
import { computed } from 'vue'
import { useDiagramStore } from '../stores/diagramStore.js'

const props = defineProps({
  edge: { type: Object, required: true },
})

const store = useDiagramStore()

const line = computed(() => {
  const fromNode = store.getNodeById(props.edge.from)
  const toNode = store.getNodeById(props.edge.to)
  if (!fromNode || !toNode) return null

  const fromCx = fromNode.x + fromNode.width / 2
  const fromCy = fromNode.y + fromNode.height / 2
  const toCx = toNode.x + toNode.width / 2
  const toCy = toNode.y + toNode.height / 2

  // Calculate intersection with node bounding box
  const from = getBoxEdgePoint(fromCx, fromCy, fromNode.width, fromNode.height, toCx, toCy)
  const to = getBoxEdgePoint(toCx, toCy, toNode.width, toNode.height, fromCx, fromCy)

  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y }
})

const labelPos = computed(() => {
  if (!line.value) return { x: 0, y: 0 }
  return {
    x: (line.value.x1 + line.value.x2) / 2,
    y: (line.value.y1 + line.value.y2) / 2 - 8,
  }
})

function getBoxEdgePoint(cx, cy, w, h, targetX, targetY) {
  const dx = targetX - cx
  const dy = targetY - cy

  if (dx === 0 && dy === 0) return { x: cx, y: cy }

  const halfW = w / 2
  const halfH = h / 2
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  let scale
  if (absDx * halfH > absDy * halfW) {
    // Intersects left or right edge
    scale = halfW / absDx
  } else {
    // Intersects top or bottom edge
    scale = halfH / absDy
  }

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
  }
}
</script>

<template>
  <g v-if="line" class="c4-edge">
    <line
      :x1="line.x1"
      :y1="line.y1"
      :x2="line.x2"
      :y2="line.y2"
      stroke="#64748b"
      stroke-width="1.5"
      stroke-dasharray="6 3"
      marker-end="url(#arrowhead)"
    />
    <rect
      v-if="edge.label"
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
      v-if="edge.label"
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
