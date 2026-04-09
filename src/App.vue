<script setup>
import { onMounted } from 'vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { useDiagramStore } from './stores/diagramStore.js'
import EditorPanel from './components/EditorPanel.vue'
import DiagramPanel from './components/DiagramPanel.vue'
import StylePanel from './components/StylePanel.vue'
import SequenceDiagramModal from './components/SequenceDiagramModal.vue'

const store = useDiagramStore()
onMounted(() => store.init())
</script>

<template>
  <div class="app-root">
    <div class="app-body">
      <SplitterGroup direction="horizontal" class="splitter-group">
        <SplitterPanel :default-size="35" :min-size="20" class="panel">
          <EditorPanel />
        </SplitterPanel>
        <SplitterResizeHandle class="splitter-handle" />
        <SplitterPanel :default-size="65" :min-size="30" class="panel">
          <SplitterGroup direction="vertical" class="splitter-group">
            <SplitterPanel :default-size="67" :min-size="30" class="panel">
              <DiagramPanel />
            </SplitterPanel>
            <SplitterResizeHandle class="splitter-handle vertical" />
            <SplitterPanel :default-size="33" :min-size="15" class="panel">
              <StylePanel />
            </SplitterPanel>
          </SplitterGroup>
        </SplitterPanel>
      </SplitterGroup>
    </div>
    <footer class="app-footer">
      <span>© 2026 Boris Ershov</span>
      <span class="dot">·</span>
      <a
        href="https://linkedin.com/in/boris-ershov-2a4b9963"
        target="_blank"
        rel="noopener"
      >LinkedIn</a>
      <span class="dot">·</span>
      <a
        href="https://github.com/go-teal"
        target="_blank"
        rel="noopener"
      >go-teal</a>
    </footer>
    <SequenceDiagramModal />
  </div>
</template>

<style scoped>
.app-root {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.app-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  font-size: 12px;
  color: #64748b;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.app-footer a {
  color: #475569;
  text-decoration: none;
}

.app-footer a:hover {
  color: #0f766e;
  text-decoration: underline;
}

.app-footer .dot {
  color: #cbd5e1;
}

.splitter-group {
  width: 100%;
  height: 100%;
}

.panel {
  height: 100%;
  overflow: hidden;
}

.splitter-handle {
  width: 6px;
  background: #e2e8f0;
  transition: background 0.15s;
  cursor: col-resize;
}

.splitter-handle:hover,
.splitter-handle:active {
  background: #94a3b8;
}

.splitter-handle.vertical {
  width: 100%;
  height: 6px;
  cursor: row-resize;
}
</style>
