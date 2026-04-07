<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDiagramStore } from '../stores/diagramStore.js'
import { TYPES, COLORS, COLOR_NAMES, DEFAULT_COLOR, parseClassName } from '../styles/palette.js'

const store = useDiagramStore()
const { selectedNode } = storeToRefs(store)

const currentColorName = computed(() => {
  if (!selectedNode.value) return DEFAULT_COLOR
  return parseClassName(selectedNode.value.className)?.colorName || DEFAULT_COLOR
})

function onTypeChange(e) {
  if (!selectedNode.value) return
  store.setNodeStyle(selectedNode.value.id, { type: e.target.value })
}

function onColorChange(name) {
  if (!selectedNode.value) return
  store.setNodeStyle(selectedNode.value.id, { colorName: name })
}
</script>

<template>
  <div class="style-panel">
    <div class="style-header">Component Style</div>

    <div v-if="!selectedNode" class="empty-state">
      Click a component on the diagram to edit its style.
    </div>

    <div v-else class="style-body">
      <div class="node-info">
        <div class="node-id">{{ selectedNode.id }}</div>
        <div class="node-title">{{ selectedNode.title }}</div>
      </div>

      <div class="field">
        <label>Type</label>
        <select :value="selectedNode.type" @change="onTypeChange">
          <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>

      <div class="field">
        <label>Color</label>
        <div class="swatches">
          <button
            v-for="name in COLOR_NAMES"
            :key="name"
            class="swatch"
            :class="{ active: name === currentColorName }"
            :title="name"
            :style="{ background: COLORS[name].color }"
            @click="onColorChange(name)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.style-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.style-header {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.empty-state {
  padding: 24px 16px;
  font-size: 13px;
  color: #94a3b8;
  text-align: center;
}

.style-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
}

.node-info {
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
}

.node-id {
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.node-title {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.field select {
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #ffffff;
  outline: none;
  cursor: pointer;
}

.field select:focus {
  border-color: #3b82f6;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 2px solid #e2e8f0;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s, border-color 0.1s;
}

.swatch:hover {
  transform: scale(1.08);
}

.swatch.active {
  border-color: #1e293b;
  box-shadow: 0 0 0 2px #ffffff inset;
}
</style>
