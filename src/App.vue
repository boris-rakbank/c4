<script setup>
import { onMounted } from 'vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { useDiagramStore } from './stores/diagramStore.js'
import EditorPanel from './components/EditorPanel.vue'
import DiagramPanel from './components/DiagramPanel.vue'

const store = useDiagramStore()
onMounted(() => store.init())
</script>

<template>
  <div class="app-root">
    <SplitterGroup direction="horizontal" class="splitter-group">
      <SplitterPanel :default-size="35" :min-size="20" class="panel">
        <EditorPanel />
      </SplitterPanel>
      <SplitterResizeHandle class="splitter-handle" />
      <SplitterPanel :default-size="65" :min-size="30" class="panel">
        <DiagramPanel />
      </SplitterPanel>
    </SplitterGroup>
  </div>
</template>

<style scoped>
.app-root {
  height: 100vh;
  width: 100vw;
  display: flex;
  overflow: hidden;
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
</style>
