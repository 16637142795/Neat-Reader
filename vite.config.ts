import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // 核心添加：匹配GitHub Pages仓库访问路径
  base: '/Neat-Reader/',
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true
  }
})