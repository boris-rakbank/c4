<script setup>
import { ref } from 'vue'
import { useDiagramStore } from '../stores/diagramStore.js'

const props = defineProps({
  boundary: { type: Object, required: true },
  svgRef: { type: Object, default: null },
})

const store = useDiagramStore()
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

function toSvgPoint(clientX, clientY) {
  const svg = props.svgRef
  if (!svg) return { x: clientX, y: clientY }
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  return pt.matrixTransform(ctm.inverse())
}

function onPointerDown(e) {
  // Only drag from the title bar area (top 36px of boundary)
  const svg = props.svgRef
  if (!svg) return
  const svgPt = toSvgPoint(e.clientX, e.clientY)
  const localY = svgPt.y - props.boundary.y
  if (localY > 36) return // Click inside content area — don't drag boundary

  isDragging.value = true
  dragOffset.value = {
    x: svgPt.x - props.boundary.x,
    y: svgPt.y - props.boundary.y,
  }
  e.target.setPointerCapture(e.pointerId)
  e.stopPropagation()
}

function onPointerMove(e) {
  if (!isDragging.value) return
  const svgPt = toSvgPoint(e.clientX, e.clientY)
  store.updateBoundaryPosition(
    props.boundary.id,
    svgPt.x - dragOffset.value.x,
    svgPt.y - dragOffset.value.y,
  )
}

function onPointerUp() {
  isDragging.value = false
  store.finishDrag()
}

function typeTag() {
  const b = props.boundary
  if (b.typeTitle) return `[boundary: ${b.typeTitle}]`
  return ''
}
</script>

<template>
  <g
    :transform="`translate(${boundary.x}, ${boundary.y})`"
    class="c4-boundary"
    :class="{ dragging: isDragging }"
    @pointerdown.prevent="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <!-- Dashed boundary rectangle -->
    <rect
      :width="boundary.width"
      :height="boundary.height"
      rx="4"
      fill="none"
      stroke="#1168bd"
      stroke-width="2"
      stroke-dasharray="10 5"
    />

    <!-- Title background -->
    <rect
      x="0" y="0"
      :width="boundary.width"
      height="32"
      rx="4"
      fill="rgba(17, 104, 189, 0.05)"
      stroke="none"
    />

    <!-- Title -->
    <text
      x="12"
      y="22"
      fill="#1168bd"
      font-size="14"
      font-weight="bold"
      font-family="sans-serif"
    >{{ boundary.title }}</text>

    <!-- Type tag -->
    <text
      v-if="typeTag()"
      :x="12 + boundary.title.length * 8 + 8"
      y="22"
      fill="#1168bd"
      font-size="10"
      opacity="0.6"
      font-family="sans-serif"
    >{{ typeTag() }}</text>
  </g>
</template>

<style>
.c4-boundary {
  cursor: default;
}
.c4-boundary rect:first-child {
  cursor: grab;
}
.c4-boundary.dragging rect:first-child {
  cursor: grabbing;
}
</style>
