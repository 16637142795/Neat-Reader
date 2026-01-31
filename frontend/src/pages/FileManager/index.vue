<template>
  <div class="file-manager">
    <!-- 顶部导航栏 -->
    <header class="header">
      <h1 class="title">文件管理</h1>
      <div class="header-actions">
        <button class="btn btn-primary" @click="triggerFileUpload">
          📁 上传文件
        </button>
        <button class="btn btn-secondary" @click="toggleStorage">
          {{ currentStorage === 'local' ? '本地文件' : '百度网盘' }}
        </button>
        <router-link to="/" class="btn btn-secondary">
          ← 返回
        </router-link>
        <input 
          ref="fileInput" 
          type="file" 
          multiple 
          accept=".epub,.pdf,.txt" 
          style="display: none" 
          @change="handleFileUpload"
        >
      </div>
    </header>

    <!-- 主要内容区 -->
    <main class="main">
      <div class="file-manager-container">
        <!-- 路径导航 -->
        <div class="path-nav">
          <button class="btn btn-secondary" @click="goToParent" :disabled="isRoot">
            ↑ 上一级
          </button>
          <span class="current-path">{{ currentPath }}</span>
        </div>

        <!-- 文件列表 -->
        <div class="file-list-container">
          <div class="file-list-header">
            <h2 class="section-title">{{ currentStorage === 'local' ? '本地文件' : '百度网盘文件' }}</h2>
            <div class="file-type-filter">
              <button 
                class="btn btn-secondary" 
                :class="{ active: selectedFilter === 'all' }"
                @click="selectedFilter = 'all'"
              >
                全部
              </button>
              <button 
                class="btn btn-secondary" 
                :class="{ active: selectedFilter === 'epub' }"
                @click="selectedFilter = 'epub'"
              >
                EPUB
              </button>
              <button 
                class="btn btn-secondary" 
                :class="{ active: selectedFilter === 'pdf' }"
                @click="selectedFilter = 'pdf'"
              >
                PDF
              </button>
              <button 
                class="btn btn-secondary" 
                :class="{ active: selectedFilter === 'txt' }"
                @click="selectedFilter = 'txt'"
              >
                TXT
              </button>
            </div>
          </div>

          <!-- 文件列表 -->
          <div class="file-list">
            <div 
              v-for="file in filteredFiles" 
              :key="file.id || file.path"
              class="file-item"
              :class="{ directory: file.isDirectory }"
              @click="file.isDirectory ? openDirectory(file) : selectFile(file)"
            >
              <div class="file-icon">
                {{ file.isDirectory ? '📁' : getFileIcon(file) }}
              </div>
              <div class="file-info">
                <div class="file-name">{{ file.name }}</div>
                <div class="file-meta">
                  {{ file.isDirectory ? '目录' : formatFileSize(file.size) }}
                  <span class="file-date">{{ formatDate(file.lastModified) }}</span>
                </div>
              </div>
              <div class="file-actions">
                <button 
                  v-if="!file.isDirectory"
                  class="btn btn-primary"
                  @click.stop="importFile(file)"
                  :disabled="isImporting"
                >
                  {{ isImporting ? '导入中...' : '导入' }}
                </button>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="filteredFiles.length === 0" class="empty-state">
            <div class="empty-icon">{{ currentStorage === 'local' ? '💻' : '☁️' }}</div>
            <h3>{{ currentStorage === 'local' ? '本地没有文件' : '百度网盘没有文件' }}</h3>
            <p>{{ currentStorage === 'local' ? '请浏览到包含电子书的文件夹' : '请上传电子书到百度网盘' }}</p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { useEbookStore } from '../../stores/ebook'

// 初始化
const ebookStore = useEbookStore()

// 响应式数据
const currentStorage = ref<'local' | 'baidupan'>('local')
const currentPath = ref('/')
const selectedFilter = ref<'all' | 'epub' | 'pdf' | 'txt'>('all')
const files = ref<any[]>([])
const isImporting = ref(false)

// 计算属性
const isRoot = computed(() => currentPath.value === '/')

const filteredFiles = computed(() => {
  return files.value.filter(file => {
    if (file.isDirectory) return true
    if (selectedFilter.value === 'all') return true
    return file.name.toLowerCase().endsWith('.' + selectedFilter.value)
  })
})

// 模拟文件数据
const mockLocalFiles = [
  { id: '1', name: '书籍', isDirectory: true, path: '/books', size: 0, lastModified: Date.now() - 3600000 },
  { id: '2', name: 'JavaScript高级程序设计.pdf', isDirectory: false, path: '/js-advanced.pdf', size: 1024 * 1024 * 5, lastModified: Date.now() - 86400000 },
  { id: '3', name: 'Vue.js设计与实现.epub', isDirectory: false, path: '/vue-design.epub', size: 1024 * 1024 * 3, lastModified: Date.now() - 172800000 },
  { id: '4', name: '测试文本.txt', isDirectory: false, path: '/test.txt', size: 1024 * 100, lastModified: Date.now() - 259200000 }
]

const mockBaidupanFiles = [
  { id: '5', name: 'NeatReader', isDirectory: true, path: '/NeatReader', size: 0, lastModified: Date.now() - 3600000 },
  { id: '6', name: 'epub', isDirectory: true, path: '/NeatReader/epub', size: 0, lastModified: Date.now() - 7200000 },
  { id: '7', name: 'pdf', isDirectory: true, path: '/NeatReader/pdf', size: 0, lastModified: Date.now() - 7200000 },
  { id: '8', name: 'txt', isDirectory: true, path: '/NeatReader/txt', size: 0, lastModified: Date.now() - 7200000 },
  { id: '9', name: '深入理解计算机系统.pdf', isDirectory: false, path: '/NeatReader/pdf/csapp.pdf', size: 1024 * 1024 * 8, lastModified: Date.now() - 86400000 }
]

// 方法
const toggleStorage = () => {
  currentStorage.value = currentStorage.value === 'local' ? 'baidupan' : 'local'
  currentPath.value = '/'
  loadFiles()
}

const loadFiles = () => {
  // 模拟加载文件
  console.log(`加载${currentStorage.value}文件: ${currentPath.value}`)
  // 这里应该调用存储服务加载文件
  files.value = currentStorage.value === 'local' ? mockLocalFiles : mockBaidupanFiles
}

const goToParent = () => {
  if (currentPath.value === '/') return
  const pathParts = currentPath.value.split('/').filter(Boolean)
  pathParts.pop()
  currentPath.value = '/' + pathParts.join('/')
  loadFiles()
}

const openDirectory = (file: any) => {
  currentPath.value = file.path
  loadFiles()
}

const selectFile = (file: any) => {
  console.log('选择文件:', file)
  // 这里可以实现文件预览或其他功能
}

const importFile = async (file: any) => {
  try {
    isImporting.value = true
    console.log('导入文件:', file)
    
    // 模拟文件对象（实际项目中应该从本地文件系统或网络获取）
    // 这里创建一个模拟的 File 对象，实际项目中应该使用真实的文件
    const mockFile = new File([''], file.name, { type: getFileMimeType(file.name) })
    
    // 调用电子书服务导入文件
    const importedBook = await ebookStore.importEbookFile(mockFile)
    
    if (importedBook) {
      alert(`已成功导入文件: ${importedBook.title}`)
    } else {
      alert('导入文件失败')
    }
  } catch (error) {
    console.error('导入文件失败:', error)
    alert('导入文件失败，请重试')
  } finally {
    isImporting.value = false
  }
}

const getFileMimeType = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'epub':
      return 'application/epub+zip'
    case 'pdf':
      return 'application/pdf'
    case 'txt':
      return 'text/plain'
    default:
      return 'application/octet-stream'
  }
}

// 文件上传功能
const fileInput = ref<HTMLInputElement | null>(null)

const triggerFileUpload = () => {
  fileInput.value?.click()
}

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      await importFileFromUpload(files[i])
    }
  }
}

const importFileFromUpload = async (file: File) => {
  try {
    isImporting.value = true
    console.log('导入上传的文件:', file.name)
    
    // 调用电子书服务导入文件
    const importedBook = await ebookStore.importEbookFile(file)
    
    if (importedBook) {
      alert(`已成功导入文件: ${importedBook.title}`)
    } else {
      alert('导入文件失败')
    }
  } catch (error) {
    console.error('导入文件失败:', error)
    alert('导入文件失败，请重试')
  } finally {
    isImporting.value = false
  }
}

const getFileIcon = (file: any) => {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'epub':
      return '📚'
    case 'pdf':
      return '📄'
    case 'txt':
      return '📝'
    default:
      return '📄'
  }
}

const formatFileSize = (size: number) => {
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB'
  return (size / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

const formatDate = (timestamp: number) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm')
}

// 生命周期钩子
onMounted(async () => {
  // 初始化电子书存储
  await ebookStore.initialize()
  loadFiles()
})
</script>

<style scoped>
.file-manager {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f7fa;
}

/* 顶部导航栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background-color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.title {
  font-size: 24px;
  font-weight: bold;
  color: #4A90E2;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

/* 主要内容区 */
.main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* 文件管理容器 */
.file-manager-container {
  max-width: 1200px;
  margin: 0 auto;
}

/* 路径导航 */
.path-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 12px 16px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.current-path {
  font-size: 14px;
  color: #666;
  font-weight: bold;
}

/* 文件列表区 */
.file-list-container {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 24px;
}

/* 文件列表头部 */
.file-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #E4E7ED;
}

.section-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  margin: 0;
}

/* 文件类型过滤 */
.file-type-filter {
  display: flex;
  gap: 8px;
}

.file-type-filter .btn.active {
  background-color: #4A90E2;
  color: white;
}

/* 文件列表 */
.file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 文件项 */
.file-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: #F5F7FA;
}

.file-item:hover {
  background-color: #E4E7ED;
}

.file-item.directory {
  background-color: #F0F9EB;
}

.file-item.directory:hover {
  background-color: #D9F7BE;
}

/* 文件图标 */
.file-icon {
  font-size: 24px;
  flex-shrink: 0;
}

/* 文件信息 */
.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 16px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: 12px;
  color: #666;
  display: flex;
  gap: 12px;
  align-items: center;
}

.file-date {
  font-size: 12px;
  color: #999;
}

/* 文件操作 */
.file-actions {
  flex-shrink: 0;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 64px 24px;
  color: #666;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-state h3 {
  font-size: 20px;
  font-weight: bold;
  margin: 0 0 8px 0;
  color: #333;
}

.empty-state p {
  font-size: 16px;
  margin: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header {
    padding: 12px 16px;
  }

  .title {
    font-size: 20px;
  }

  .main {
    padding: 16px;
  }

  .file-manager-container {
    width: 100%;
  }

  .path-nav {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .file-list-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .file-type-filter {
    flex-wrap: wrap;
  }

  .file-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    text-align: left;
  }

  .file-info {
    width: 100%;
  }

  .file-actions {
    align-self: stretch;
    display: flex;
    justify-content: flex-end;
  }
}
</style>