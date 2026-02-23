import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import RekaResolver from 'reka-ui/resolver'

export default defineConfig({
  plugins: [
    vue(),
    Components({
      dts: false,
      resolvers: [RekaResolver()],
    }),
  ],
  server: {
    watch: {
      usePolling: true,
    },
  },
})
