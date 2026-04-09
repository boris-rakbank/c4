<script setup>
import { useDiagramStore } from '../stores/diagramStore.js'

const store = useDiagramStore()

let debounceTimer = null

function onInput(e) {
  const val = e.target.value
  store.mermaidSource = val
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    store.updateFromSource(val)
  }, 500)
}

// Detect when the user pastes a Mermaid sequenceDiagram and divert it
// into the conversion modal instead of letting the parser silently fail.
const SEQUENCE_HEADER_RE = /^\s*(?:%%[^\n]*\n\s*)*sequenceDiagram\b/

function onPaste(e) {
  const pasted = e.clipboardData?.getData('text') ?? ''
  if (!pasted) return
  const ta = e.target
  const before = ta.value.slice(0, ta.selectionStart)
  const after  = ta.value.slice(ta.selectionEnd)
  const next = before + pasted + after
  if (SEQUENCE_HEADER_RE.test(next)) {
    e.preventDefault()
    store.promptSequenceConversion(next)
  }
}
</script>

<template>
  <div class="editor-panel">
    <div class="editor-header">Mermaid Input</div>
    <textarea
      :value="store.mermaidSource"
      class="editor-textarea"
      spellcheck="false"
      placeholder="Enter mermaid flowchart syntax..."
      @input="onInput"
      @paste="onPaste"
    />
  </div>
</template>

<style scoped>
.editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e2e;
}

.editor-header {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  background: #181825;
  border-bottom: 1px solid #313244;
}

.editor-textarea {
  flex: 1;
  width: 100%;
  padding: 16px;
  background: #1e1e2e;
  color: #cdd6f4;
  border: none;
  outline: none;
  resize: none;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.6;
  tab-size: 2;
}

.editor-textarea::placeholder {
  color: #585b70;
}
</style>
