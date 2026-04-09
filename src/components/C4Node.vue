<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDiagramStore } from '../stores/diagramStore.js'
import { COLORS, DEFAULT_COLOR } from '../styles/palette.js'

const props = defineProps({
  node: { type: Object, required: true },
  svgRef: { type: Object, default: null },
})

const store = useDiagramStore()
const { selectedNodeId } = storeToRefs(store)
const isDragging = ref(false)
const didDrag = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const dragOffset = ref({ x: 0, y: 0 })
const DRAG_THRESHOLD = 3

const isSelected = computed(() => selectedNodeId.value === props.node.id)

function getColors() {
  // Default: blue palette, with `aws` defaulting to red and `person` to green
  // (preserves visual continuity with the previous hardcoded defaults).
  const typeDefault =
    props.node.type === 'aws' ? COLORS.Red :
    props.node.type === 'person' ? COLORS.Green :
    COLORS[DEFAULT_COLOR]

  const s = props.node.style
  if (!s) {
    return { fill: typeDefault.fill, stroke: typeDefault.color, text: typeDefault.stroke }
  }
  return {
    fill: s.fill || 'transparent',         // background
    stroke: s.color || typeDefault.color,  // frame/border color
    text: s.stroke || typeDefault.stroke,  // font/text color
  }
}

function typeTag() {
  const n = props.node
  if (n.typeTitle) return `[${n.type}: ${n.typeTitle}]`
  return `[${n.type}]`
}

// Build the type-tag line set, wrapping the bracketed form around the
// (possibly multi-line) typeTitle: first line is `[type: firstLine`,
// intermediate lines are plain, the last line gets the closing `]`.
function buildTypeTagLines(n) {
  if (!n.typeTitle) return [`[${n.type}]`]
  const parts = splitLines(n.typeTitle)
  if (parts.length <= 1) return [`[${n.type}: ${n.typeTitle}]`]
  const out = []
  for (let i = 0; i < parts.length; i++) {
    if (i === 0) out.push(`[${n.type}: ${parts[i]}`)
    else if (i === parts.length - 1) out.push(`${parts[i]}]`)
    else out.push(parts[i])
  }
  return out
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
  didDrag.value = false
  const svgPt = toSvgPoint(e.clientX, e.clientY)
  dragStart.value = { x: svgPt.x, y: svgPt.y }
  dragOffset.value = {
    x: svgPt.x - props.node.x,
    y: svgPt.y - props.node.y,
  }
  // Capture on the <g> (currentTarget), not the inner shape, so pointerup
  // reliably fires on this same element.
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
  e.stopPropagation()
}

function onPointerMove(e) {
  if (!isDragging.value) return
  const svgPt = toSvgPoint(e.clientX, e.clientY)
  if (!didDrag.value) {
    const dx = svgPt.x - dragStart.value.x
    const dy = svgPt.y - dragStart.value.y
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    didDrag.value = true
  }
  store.updateNodePosition(
    props.node.id,
    svgPt.x - dragOffset.value.x,
    svgPt.y - dragOffset.value.y,
  )
}

function onPointerUp(e) {
  if (!isDragging.value) return
  isDragging.value = false
  if (didDrag.value) {
    store.finishDrag()
  } else {
    store.selectNode(props.node.id)
    e.stopPropagation()
  }
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

// Split a label string on both literal `\n` (backslash-n) and real
// newlines, so users writing either form in the source get multi-line
// text rendering.
function splitLines(s) {
  if (s == null || s === '') return []
  return String(s).split(/\\n|\n/)
}

const titleLines = computed(() => splitLines(props.node.title))
const descriptionLines = computed(() => splitLines(props.node.description))
const typeTagLines = computed(() => buildTypeTagLines(props.node))
const TITLE_LINE_H = 16
const TYPE_LINE_H = 12
const DESC_LINE_H = 12

const typeTagY = computed(() => {
  const extraTitleLines = Math.max(titleLines.value.length - 1, 0)
  return textStartY() + 18 + extraTitleLines * TITLE_LINE_H
})
const descriptionStartY = computed(() => {
  const extraTypeLines = Math.max(typeTagLines.value.length - 1, 0)
  return typeTagY.value + 16 + extraTypeLines * TYPE_LINE_H
})
</script>

<template>
  <g
    :transform="`translate(${node.x}, ${node.y})`"
    class="c4-node"
    :class="{ dragging: isDragging, selected: isSelected }"
    @pointerdown.prevent="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <!-- Selection halo -->
    <rect
      v-if="isSelected"
      x="-8" y="-8"
      :width="w + 16"
      :height="h + 16"
      rx="10"
      fill="none"
      stroke="#3b82f6"
      stroke-width="2"
      stroke-dasharray="6 4"
    />

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

    <!-- Title (bold) — supports \n-separated multi-line -->
    <text
      :x="w / 2"
      :y="textStartY()"
      text-anchor="middle"
      :fill="getColors().text"
      font-size="14"
      font-weight="bold"
      font-family="sans-serif"
    ><tspan
        v-for="(line, i) in titleLines"
        :key="i"
        :x="w / 2"
        :dy="i === 0 ? 0 : TITLE_LINE_H"
      >{{ line }}</tspan></text>

    <!-- [type: type_title] — supports \n-separated multi-line -->
    <text
      :x="w / 2"
      :y="typeTagY"
      text-anchor="middle"
      :fill="getColors().text"
      font-size="10"
      opacity="0.8"
      font-family="sans-serif"
    ><tspan
        v-for="(line, i) in typeTagLines"
        :key="i"
        :x="w / 2"
        :dy="i === 0 ? 0 : TYPE_LINE_H"
      >{{ line }}</tspan></text>

    <!-- Description — supports \n-separated multi-line -->
    <text
      v-if="descriptionLines.length"
      :x="w / 2"
      :y="descriptionStartY"
      text-anchor="middle"
      :fill="getColors().text"
      font-size="10"
      opacity="0.6"
      font-family="sans-serif"
    ><tspan
        v-for="(line, i) in descriptionLines"
        :key="i"
        :x="w / 2"
        :dy="i === 0 ? 0 : DESC_LINE_H"
      >{{ line }}</tspan></text>
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
