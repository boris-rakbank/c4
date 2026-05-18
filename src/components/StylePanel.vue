<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useDiagramStore } from '../stores/diagramStore.js'
import { TYPES, COLORS, COLOR_NAMES, DEFAULT_COLOR, parseClassName } from '../styles/palette.js'

const store = useDiagramStore()
const { selectedNode } = storeToRefs(store)

const currentColorName = computed(() => {
  if (!selectedNode.value) return DEFAULT_COLOR
  return parseClassName(selectedNode.value.className)?.colorName || DEFAULT_COLOR
})

const isFilled = computed(() => {
  if (!selectedNode.value) return true
  const parsed = parseClassName(selectedNode.value.className)
  return parsed?.filled !== false
})

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32]
const DEFAULT_FONT_SIZE = 16

const currentFontSize = computed(() => {
  if (!selectedNode.value) return DEFAULT_FONT_SIZE
  return selectedNode.value.titleFontSize || DEFAULT_FONT_SIZE
})

function onFontSizeChange(e) {
  if (!selectedNode.value) return
  store.setNodeFontSize(selectedNode.value.id, parseInt(e.target.value, 10))
}

function onTypeChange(e) {
  if (!selectedNode.value) return
  store.setNodeStyle(selectedNode.value.id, { type: e.target.value })
}

function onColorChange(name) {
  if (!selectedNode.value) return
  store.setNodeStyle(selectedNode.value.id, { colorName: name })
}

function onFilledChange(e) {
  if (!selectedNode.value) return
  store.setNodeStyle(selectedNode.value.id, { filled: e.target.checked })
}

// Local mirror of bracket-content fields so typing doesn't reparse on
// every keystroke. We debounce-flush 350ms after the last edit and on
// blur. When the selected node changes (or its source-derived value
// changes from elsewhere), we sync the local copy.
const localTitle       = ref('')
const localTypeTitle   = ref('')
const localDescription = ref('')

watch(
  () => selectedNode.value && {
    id: selectedNode.value.id,
    title: selectedNode.value.title,
    typeTitle: selectedNode.value.typeTitle,
    description: selectedNode.value.description,
  },
  (v) => {
    localTitle.value       = v?.title       || ''
    localTypeTitle.value   = v?.typeTitle   || ''
    localDescription.value = v?.description || ''
  },
  { immediate: true }
)

let flushTimer = null
let pendingPatch = {}
let pendingId = null

function flushContent() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!pendingId || Object.keys(pendingPatch).length === 0) return
  store.setNodeContent(pendingId, pendingPatch)
  pendingPatch = {}
  pendingId = null
}

function scheduleContentUpdate(field, value) {
  if (!selectedNode.value) return
  pendingId = selectedNode.value.id
  pendingPatch[field] = value
  clearTimeout(flushTimer)
  flushTimer = setTimeout(flushContent, 350)
}

onBeforeUnmount(() => flushContent())
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

      <div class="field-inline">
        <label class="checkbox">
          <input type="checkbox" :checked="isFilled" @change="onFilledChange" />
          Filled
        </label>
      </div>

      <div class="field">
        <label>Title Font Size</label>
        <select :value="currentFontSize" @change="onFontSizeChange">
          <option v-for="s in FONT_SIZES" :key="s" :value="s">{{ s }}px</option>
        </select>
      </div>

      <div class="field">
        <label>Name</label>
        <input
          type="text"
          v-model="localTitle"
          @input="scheduleContentUpdate('title', localTitle)"
          @blur="flushContent"
        />
      </div>

      <div class="field">
        <label>Container Name</label>
        <input
          type="text"
          v-model="localTypeTitle"
          @input="scheduleContentUpdate('typeTitle', localTypeTitle)"
          @blur="flushContent"
        />
      </div>

      <div class="field">
        <label>Description</label>
        <textarea
          rows="3"
          v-model="localDescription"
          @input="scheduleContentUpdate('description', localDescription)"
          @blur="flushContent"
        />
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

.field select,
.field input[type="text"],
.field textarea {
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #ffffff;
  outline: none;
  font-family: inherit;
}

.field select { cursor: pointer; }

.field textarea {
  resize: vertical;
  min-height: 56px;
  line-height: 1.4;
}

.field select:focus,
.field input[type="text"]:focus,
.field textarea:focus {
  border-color: #3b82f6;
}

.field-inline {
  display: flex;
  align-items: center;
}

.checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}

.checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
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
