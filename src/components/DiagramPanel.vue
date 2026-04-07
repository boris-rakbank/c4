<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDiagramStore } from '../stores/diagramStore.js'
import C4Boundary from './C4Boundary.vue'
import C4Node from './C4Node.vue'
import C4Edge from './C4Edge.vue'

const CANVAS_PADDING = 200

const store = useDiagramStore()
const { nodes, routedEdges, boundaries } = storeToRefs(store)
const svgRef = ref(null)

const canvasWidth = computed(() => {
  let maxR = 0
  for (const n of nodes.value) {
    const r = n.x + n.width
    if (r > maxR) maxR = r
  }
  for (const b of boundaries.value) {
    const r = b.x + b.width
    if (r > maxR) maxR = r
  }
  return Math.max(maxR + CANVAS_PADDING, 1200)
})

const canvasHeight = computed(() => {
  let maxB = 0
  for (const n of nodes.value) {
    const b = n.y + n.height
    if (b > maxB) maxB = b
  }
  for (const b of boundaries.value) {
    const bot = b.y + b.height
    if (bot > maxB) maxB = bot
  }
  return Math.max(maxB + CANVAS_PADDING, 800)
})
</script>

<template>
  <div class="diagram-panel">
    <div class="diagram-header">C4 Diagram</div>
    <div class="diagram-canvas">
      <svg
        ref="svgRef"
        class="diagram-svg"
        :width="canvasWidth"
        :height="canvasHeight"
        xmlns="http://www.w3.org/2000/svg"
        @pointerdown.self="store.clearSelection()"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
          </marker>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="0.5" />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#grid)" @pointerdown="store.clearSelection()" />

        <!-- Boundaries rendered first (behind nodes) -->
        <C4Boundary
          v-for="boundary in boundaries"
          :key="boundary.id"
          :boundary="boundary"
          :svg-ref="svgRef"
        />

        <!-- Edges (orthogonal, A*-routed) -->
        <C4Edge
          v-for="edge in routedEdges"
          :key="edge.id"
          :edge="edge"
        />

        <!-- Nodes on top -->
        <C4Node
          v-for="node in nodes"
          :key="node.id"
          :node="node"
          :svg-ref="svgRef"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.diagram-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
}

.diagram-header {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.diagram-canvas {
  flex: 1;
  overflow: auto;
  position: relative;
}

.diagram-svg {
  display: block;
}
</style>
