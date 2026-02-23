<script setup>
import { ref, computed } from 'vue'
import { useDiagramStore } from '../stores/diagramStore.js'

const props = defineProps({
  node: { type: Object, required: true },
  svgRef: { type: Object, default: null },
})

const store = useDiagramStore()
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

// Placeholder colors — user will customize later
const C4_COLORS = {
  person:       { fill: '#ffffff', stroke: '#3a7d28', text: '#3a7d28' },
  system:       { fill: '#ffffff', stroke: '#1168bd', text: '#1168bd' },
  container:    { fill: '#ffffff', stroke: '#1168bd', text: '#1168bd' },
  database:     { fill: '#ffffff', stroke: '#1168bd', text: '#1168bd' },
  s3:           { fill: '#ffffff', stroke: '#1168bd', text: '#1168bd' },
  'server-app': { fill: '#ffffff', stroke: '#1168bd', text: '#1168bd' },
  spa:          { fill: '#ffffff', stroke: '#1168bd', text: '#1168bd' },
  directory:    { fill: '#ffffff', stroke: '#1168bd', text: '#1168bd' },
  boundary:     { fill: '#ffffff', stroke: '#1168bd', text: '#1168bd' },
  aws:          { fill: '#ffffff', stroke: '#cc0000', text: '#cc0000' },
  bus:          { fill: '#ffffff', stroke: '#1168bd', text: '#1168bd' },
}

function getColors() {
  const defaults = C4_COLORS[props.node.type] || C4_COLORS.system
  const s = props.node.style
  if (!s) return defaults
  return {
    fill: s.fill || 'transparent',       // background
    stroke: s.color || defaults.stroke,   // frame/border color
    text: s.stroke || defaults.text,      // font/text color
  }
}

function typeTag() {
  const n = props.node
  if (n.typeTitle) return `[${n.type}: ${n.typeTitle}]`
  return `[${n.type}]`
}

const w = computed(() => props.node.width)
const h = computed(() => props.node.height)

// Person shape: circle head sits on top of the body rectangle
const personBodyTop = 30
const personHeadR = 18

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
  isDragging.value = true
  const svgPt = toSvgPoint(e.clientX, e.clientY)
  dragOffset.value = {
    x: svgPt.x - props.node.x,
    y: svgPt.y - props.node.y,
  }
  e.target.setPointerCapture(e.pointerId)
}

function onPointerMove(e) {
  if (!isDragging.value) return
  const svgPt = toSvgPoint(e.clientX, e.clientY)
  store.updateNodePosition(
    props.node.id,
    svgPt.x - dragOffset.value.x,
    svgPt.y - dragOffset.value.y,
  )
}

function onPointerUp() {
  isDragging.value = false
  store.finishDrag()
}

// Text Y offset: how far down the first text line starts inside the shape
function textStartY() {
  const t = props.node.type
  if (t === 'person') return 66
  if (t === 'database' || t === 's3' || t === 'bus') return 42
  if (t === 'server-app' || t === 'spa') return 38
  if (t === 'directory') return 36
  return 30
}
</script>

<template>
  <g
    :transform="`translate(${node.x}, ${node.y})`"
    class="c4-node"
    :class="{ dragging: isDragging }"
    @pointerdown.prevent="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <!-- ==================== PERSON ==================== -->
    <!-- Circle head on top, body shape below (matching C4 person icon) -->
    <template v-if="node.type === 'person'">
      <!-- Body rectangle -->
      <rect
        x="10"
        y="42"
        :width="w - 20"
        :height="h - 42"
        rx="6"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
      <!-- Head circle (on top of body) -->
      <circle
        :cx="w / 2"
        cy="24"
        r="22"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
    </template>

    <!-- ==================== DATABASE (Cylinder) ==================== -->
    <template v-else-if="node.type === 'database'">
      <!-- Cylinder body (path: two vertical sides + bottom arc) -->
      <path
        :d="`M 0,16 L 0,${h - 16} A ${w / 2},16 0 0,0 ${w},${h - 16} L ${w},16`"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
      <!-- Top ellipse (full visible lid) -->
      <ellipse
        :cx="w / 2"
        cy="16"
        :rx="w / 2"
        ry="16"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
    </template>

    <!-- ==================== S3 (Bucket) ==================== -->
    <template v-else-if="node.type === 's3'">
      <!-- Bucket: wide top ellipse, tapered sides, arc bottom -->
      <path
        :d="`M 20,${h - 10} L 0,16 A ${w / 2},16 0 0,1 ${w},16 L ${w - 20},${h - 10} A ${(w - 40) / 2},10 0 0,1 20,${h - 10} Z`"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
      <!-- Top ellipse (full visible lid) -->
      <ellipse
        :cx="w / 2"
        cy="16"
        :rx="w / 2"
        ry="16"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
    </template>

    <!-- ==================== BUS (Horizontal cylinder) ==================== -->
    <template v-else-if="node.type === 'bus'">
      <!-- Body (path: two horizontal sides + right arc) -->
      <path
        :d="`M 16,0 L ${w - 16},0 A 16,${h / 2} 0 0,1 ${w - 16},${h} L 16,${h}`"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
      <!-- Left ellipse (visible cap) -->
      <ellipse
        cx="16"
        :cy="h / 2"
        rx="16"
        :ry="h / 2"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
    </template>

    <!-- ==================== SERVER-APP (Terminal window) ==================== -->
    <template v-else-if="node.type === 'server-app'">
      <rect
        :width="w" :height="h" rx="4"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
      <!-- Top bar -->
      <line x1="0" y1="24" :x2="w" y2="24" :stroke="getColors().stroke" stroke-width="1" />
      <!-- Terminal prompt >_ -->
      <text x="10" y="17" :fill="getColors().stroke" font-size="14" font-weight="bold" font-family="monospace">
        &gt;_
      </text>
    </template>

    <!-- ==================== SPA (Browser window) ==================== -->
    <template v-else-if="node.type === 'spa'">
      <rect
        :width="w" :height="h" rx="4"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
      <!-- Top bar -->
      <line x1="0" y1="24" :x2="w" y2="24" :stroke="getColors().stroke" stroke-width="1" />
      <!-- Browser dots -->
      <circle cx="14" cy="12" r="4" :fill="getColors().stroke" />
      <circle cx="28" cy="12" r="4" :fill="getColors().stroke" />
      <circle cx="42" cy="12" r="4" :fill="getColors().stroke" />
    </template>

    <!-- ==================== DIRECTORY (Folder tab) ==================== -->
    <template v-else-if="node.type === 'directory'">
      <!-- Folder tab -->
      <path
        :d="`M0,16 L0,4 Q0,0 4,0 L60,0 L68,16 Z`"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
      <!-- Main body -->
      <rect
        x="0" y="16"
        :width="w"
        :height="h - 16"
        rx="0"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
      <!-- Cover overlap between tab and body -->
      <line x1="1" y1="16" x2="67" y2="16" :stroke="getColors().fill" stroke-width="3" />
    </template>

    <!-- ==================== BOUNDARY (Dashed rect) ==================== -->
    <template v-else-if="node.type === 'boundary'">
      <rect
        :width="w" :height="h" rx="4"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
        stroke-dasharray="8 4"
      />
    </template>

    <!-- ==================== SYSTEM / CONTAINER / AWS (Plain rectangle) ==================== -->
    <template v-else>
      <rect
        :width="w" :height="h" rx="4"
        :fill="getColors().fill"
        :stroke="getColors().stroke"
        stroke-width="2"
      />
    </template>

    <!-- ==================== TEXT LABELS ==================== -->

    <!-- Title (bold) -->
    <text
      :x="w / 2"
      :y="textStartY()"
      text-anchor="middle"
      :fill="getColors().text"
      font-size="14"
      font-weight="bold"
      font-family="sans-serif"
    >{{ node.title }}</text>

    <!-- [type: type_title] -->
    <text
      :x="w / 2"
      :y="textStartY() + 18"
      text-anchor="middle"
      :fill="getColors().text"
      font-size="10"
      opacity="0.8"
      font-family="sans-serif"
    >{{ typeTag() }}</text>

    <!-- Description -->
    <text
      v-if="node.description"
      :x="w / 2"
      :y="textStartY() + 34"
      text-anchor="middle"
      :fill="getColors().text"
      font-size="10"
      opacity="0.6"
      font-family="sans-serif"
    >{{ node.description }}</text>
  </g>
</template>

<style>
.c4-node {
  cursor: grab;
  user-select: none;
}
.c4-node.dragging {
  cursor: grabbing;
}
</style>
