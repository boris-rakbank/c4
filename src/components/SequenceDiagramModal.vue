<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useDiagramStore } from '../stores/diagramStore.js'

const store = useDiagramStore()
const { pendingSequenceSource } = storeToRefs(store)

const open = computed(() => pendingSequenceSource.value != null)
const showResponses = ref(false)

// Reset the checkbox each time the modal reopens so the default is stable.
watch(open, (isOpen) => {
  if (isOpen) showResponses.value = false
})

function confirm() {
  store.confirmSequenceConversion({ showResponses: showResponses.value })
}

function cancel() {
  store.cancelSequenceConversion()
}

function onKey(e) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="cancel">
    <div class="modal">
      <h2 class="modal-title">Sequence diagram detected</h2>
      <div class="modal-body">
        <p>
          The text you pasted is a Mermaid <strong>sequenceDiagram</strong>, but
          this app renders C4 / flowchart graphs. The sequence will be converted
          into a <code>graph TD</code> before rendering.
        </p>
        <p class="muted">
          Control flow (<code>alt</code>, <code>loop</code>, <code>par</code>,
          <code>opt</code>) is flattened, and notes / activate / deactivate
          blocks are dropped.
        </p>
        <label class="checkbox-row">
          <input type="checkbox" v-model="showResponses" />
          <span>Include response arrows (dashed <code>--&gt;&gt;</code> / <code>--&gt;</code>) in the converted diagram</span>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn" @click="cancel">Cancel</button>
        <button class="btn btn-primary" @click="confirm">Convert</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #1e1e2e;
  color: #cdd6f4;
  border: 1px solid #313244;
  border-radius: 8px;
  width: min(520px, 92vw);
  padding: 20px 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  font-family: system-ui, -apple-system, sans-serif;
}

.modal-title {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #f5e0dc;
}

.modal-body p {
  margin: 0 0 10px 0;
  font-size: 13px;
  line-height: 1.5;
}

.modal-body .muted {
  color: #94a3b8;
}

.modal-body code {
  background: #181825;
  color: #f9e2af;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
}

.checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 14px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.checkbox-row input {
  margin-top: 2px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn {
  font: inherit;
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid #45475a;
  background: #313244;
  color: #cdd6f4;
  cursor: pointer;
}

.btn:hover {
  background: #45475a;
}

.btn-primary {
  background: #89b4fa;
  border-color: #89b4fa;
  color: #1e1e2e;
  font-weight: 600;
}

.btn-primary:hover {
  background: #74a7f5;
  border-color: #74a7f5;
}
</style>
