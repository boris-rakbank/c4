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

function downloadSvg() {
  const svg = svgRef.value
  if (!svg) return
  // Clone so we can safely mutate (strip grid, add xmlns) without
  // polluting the live DOM.
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  // Drop the grid — both the <pattern> def and the background <rect>
  // that fills with it — so the exported file shows only the diagram.
  const gridPattern = clone.querySelector('#grid')
  if (gridPattern) gridPattern.remove()
  for (const rect of clone.querySelectorAll('rect[fill="url(#grid)"]')) {
    rect.remove()
  }
  const source = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    new XMLSerializer().serializeToString(clone)
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'c4-diagram.svg'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="diagram-panel">
    <div class="diagram-header">
      <span>C4 Diagram</span>
      <div class="header-actions">
        <button class="toolbar-btn" @click="store.runForceLayout" title="Run force-directed auto-layout">Auto Layout</button>
        <button class="toolbar-btn" @click="downloadSvg">Download SVG</button>
        <a
          class="toolbar-link"
          href="https://go-teal.github.io/"
          target="_blank"
          rel="noopener"
          title="go-teal — set of related projects"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
    </div>
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
          <!-- Snap-target dots at each 50px intersection -->
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="1.5" fill="#cbd5e1" />
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  font: inherit;
  text-transform: none;
  letter-spacing: normal;
  padding: 4px 10px;
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  cursor: pointer;
}

.toolbar-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.toolbar-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #334155;
  background: #ffffff;
  cursor: pointer;
  text-decoration: none;
}

.toolbar-link:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #0f766e;
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
