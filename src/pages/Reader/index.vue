<template>
  <div class="reader-master" :class="[`theme-${theme}`, { 'controls-visible': showControls }]">
    <transition name="fade">
      <div v-if="loading" class="global-loader">
        <div class="loader-content">
          <div class="pulse-ring"></div>
          <p>正在精心排版中...</p>
        </div>
      </div>
    </transition>

    <transition name="slide-down">
      <nav v-show="showControls" class="glass-bar top-bar">
        <div class="bar-section left">
          <button class="btn-icon" @click="goBack" title="退出阅读">
            <svg viewBox="0 0 24 24" width="24" height="24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor"/></svg>
          </button>
          <div class="book-meta">
            <span class="book-title">{{ book?.title || '未知书籍' }}</span>
            <span class="chapter-badge">{{ currentChapterTitle }}</span>
          </div>
        </div>
        <div class="bar-section right">
          <button class="btn-text" @click="openSidebar('search')">
            <i class="icon-search"></i> 搜索
          </button>
          <button class="btn-text" @click="openSidebar('contents')">
            <i class="icon-toc"></i> 目录
          </button>
          <button class="btn-text-primary" @click="openSidebar('settings')">
            <i class="icon-settings"></i> 设置
          </button>
        </div>
      </nav>
    </transition>

    <main class="reader-viewport" ref="viewportRef">
      <div v-if="book?.format === 'epub'" id="epub-render-root" class="render-layer"></div>

      <div v-else-if="book?.format === 'pdf'" class="render-layer pdf-container" @click="toggleControls">
        <canvas ref="pdfCanvas" class="pdf-canvas"></canvas>
      </div>

      <div class="persistent-info">
        <div class="progress-indicator">
          <span class="percent">{{ readingProgress }}%</span>
          <div class="mini-bar"><div class="fill" :style="{ width: readingProgress + '%' }"></div></div>
        </div>
      </div>

      <div class="interaction-layer">
        <div class="hotspot left" @click="prevPage" title="上一页"></div>
        <div class="hotspot center" @click="toggleControls"></div>
        <div class="hotspot right" @click="nextPage" title="下一页"></div>
      </div>
    </main>

    <transition name="slide-up">
      <footer v-show="showControls" class="glass-bar bottom-bar">
        <div class="bottom-layout">
          <div class="progress-slider-wrapper">
            <span class="label">进度</span>
            <input type="range" v-model="readingProgress" min="0" max="100" @change="onSliderChange" class="ios-slider">
            <span class="val">{{ readingProgress }}%</span>
          </div>

          <div class="quick-actions">
            <div class="theme-switcher">
              <button v-for="(label, key) in themeConfig" :key="key"
                      :class="['theme-dot', key, { active: theme === key }]"
                      @click="setTheme(key)" :title="label.name">
              </button>
            </div>

            <div class="font-stepper">
              <button @click="changeFontSize(-2)">A-</button>
              <span class="current-fs">{{ fontSize }}</span>
              <button @click="changeFontSize(2)">A+</button>
            </div>

            <button class="btn-pill" @click="togglePageMode">
              {{ pageMode === 'page' ? '翻页模式' : '滚动模式' }}
            </button>
          </div>
        </div>
      </footer>
    </transition>

    <transition name="drawer-right">
      <aside v-if="activeSidebar" class="sidebar-system">
        <div class="sidebar-header">
          <h3>{{ sidebarTitle }}</h3>
          <button class="close-x" @click="closeSidebar">×</button>
        </div>

        <div class="sidebar-scroll-area">
          <div v-if="activeSidebar === 'search'" class="panel-search">
            <div class="search-input-box">
              <input v-model="searchQuery" placeholder="搜索全文内容..." @keyup.enter="doFullTextSearch">
              <button @click="doFullTextSearch" :disabled="isSearching">
                {{ isSearching ? '...' : '搜索' }}
              </button>
            </div>
            <div class="search-results">
              <div v-for="(item, idx) in searchResults" :key="idx" class="search-item" @click="jumpTo(item.cfi)">
                <p v-html="item.excerpt"></p>
              </div>
              <div v-if="hasSearched && searchResults.length === 0" class="empty-tip">未找到匹配项</div>
            </div>
          </div>

          <div v-if="activeSidebar === 'contents'" class="panel-toc">
            <div v-for="(item, idx) in chapters" :key="idx"
                 :class="['toc-node', { active: currentChapterIndex === idx }]"
                 @click="goToChapter(item.href, idx)">
              {{ item.title }}
            </div>
          </div>

          <div v-if="activeSidebar === 'settings'" class="panel-settings">
            <div class="s-group">
              <label>屏幕亮度</label>
              <input type="range" v-model="brightness" min="10" max="100">
            </div>
            <div class="s-group">
              <label>行间距</label>
              <div class="segment-ctrl">
                <button v-for="l in [1.2, 1.5, 1.8]" :key="l" :class="{active: lineHeight === l}" @click="lineHeight = l">
                  {{ l }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </transition>

    <div class="brightness-overlay" :style="{ opacity: (100 - brightness) / 100 }"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ePub from 'epubjs'
import localforage from 'localforage'
import { useEbookStore } from '../../stores/ebook'

const route = useRoute()
const router = useRouter()
const ebookStore = useEbookStore()

// --- 状态变量 ---
const loading = ref(true)
const showControls = ref(true)
const activeSidebar = ref<'search' | 'contents' | 'settings' | null>(null)
const theme = ref<'light' | 'sepia' | 'dark'>('light')
const fontSize = ref(18)
const lineHeight = ref(1.5)
const brightness = ref(100)
const pageMode = ref<'page' | 'scroll'>('page')

const book = ref<any>(null)
const chapters = ref<any[]>([])
const currentChapterIndex = ref(0)
const currentChapterTitle = ref('正在载入...')
const readingProgress = ref(0)

// 搜索逻辑
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const isSearching = ref(false)
const hasSearched = ref(false)

// 实例
const rendition = ref<any>(null)
const bookInstance = ref<any>(null)

const themeConfig = {
  light: { name: '明亮', bg: '#ffffff', text: '#2c3e50' },
  sepia: { name: '护眼', bg: '#f4ecd8', text: '#5b4636' },
  dark: { name: '夜晚', bg: '#1a1a1a', text: '#ffffff' }
}

const sidebarTitle = computed(() => {
  return { search: '全文搜索', contents: '书籍目录', settings: '个性化设置' }[activeSidebar.value || 'search']
})

// --- 1. 核心交互修复：高精度点击算法 ---
const handleGlobalClick = (clientX: number) => {
  const width = window.innerWidth
  const threshold = width * 0.25 // 左右各占 25%

  if (clientX < threshold) {
    prevPage()
  } else if (clientX > width - threshold) {
    nextPage()
  } else {
    toggleControls()
  }
}

const toggleControls = () => {
  showControls.value = !showControls.value
  if (showControls.value) activeSidebar.value = null
}

const prevPage = () => rendition.value?.prev()
const nextPage = () => rendition.value?.next()

const handleWheel = (e: WheelEvent) => {
  if (pageMode.value === 'page') {
    if (Math.abs(e.deltaY) < 10) return
    if (e.deltaY > 0) nextPage()
    else prevPage()
  }
}

// --- 2. 核心样式修复：强制主题同步 ---
const applyStyles = () => {
  if (!rendition.value) return

  // 注入关键 CSS (!important 是修复切不回来问题的核心)
  rendition.value.themes.register('custom', {
    body: {
      'background': `${themeConfig[theme.value].bg} !important`,
      'color': `${themeConfig[theme.value].text} !important`,
      'font-size': `${fontSize.value}px !important`,
      'line-height': `${lineHeight.value} !important`
    }
  })
  rendition.value.themes.select('custom')
}

const setTheme = (key: any) => {
  theme.value = key
  applyStyles()
}

const changeFontSize = (delta: number) => {
  fontSize.value += delta
  applyStyles()
}

// 保存阅读进度内部函数（接受CFI参数）
const saveProgressInternal = async (cfi: string) => {
  if (!book.value || !bookInstance.value) return
  
  try {
    // 计算进度百分比
    let percent = 0
    if (bookInstance.value.locations.length() > 0) {
      percent = bookInstance.value.locations.percentageFromCfi(cfi)
    }
    
    // 构建阅读进度数据
    const progressData = {
      ebookId: book.value.id,
      chapterIndex: currentChapterIndex.value,
      chapterTitle: currentChapterTitle.value,
      position: percent,
      cfi: cfi, // 保存精确的CFI位置
      timestamp: Date.now(),
      deviceId: ebookStore.deviceInfo.id,
      deviceName: ebookStore.deviceInfo.name,
      readingTime: 0 // 可在后续扩展阅读时间统计功能
    }
    
    // 保存进度
    await ebookStore.saveReadingProgress(progressData)
    console.log('阅读进度保存成功:', progressData)
  } catch (error) {
    console.error('保存阅读进度失败:', error)
  }
}

// 保存阅读进度（兼容现有调用）
const saveProgress = async () => {
  if (!book.value || !bookInstance.value || !rendition.value) return
  
  try {
    // 获取当前位置信息
    const currentLocation = rendition.value.currentLocation()
    if (!currentLocation || !currentLocation.start) {
      console.warn('无法获取当前位置信息，跳过进度保存')
      return
    }
    
    const startCfi = currentLocation.start.cfi
    if (!startCfi) {
      console.warn('无法获取CFI位置，跳过进度保存')
      return
    }
    
    // 调用内部函数保存进度
    await saveProgressInternal(startCfi)
  } catch (error) {
    console.error('保存阅读进度失败:', error)
  }
}

// --- 3. 全文搜索逻辑 ---
const doFullTextSearch = async () => {
  if (!searchQuery.value || !bookInstance.value) return
  isSearching.value = true
  hasSearched.value = true
  searchResults.value = []

  const results = await Promise.all(
      bookInstance.value.spine.spineItems.map((item: any) =>
          item.load(bookInstance.value.load.bind(bookInstance.value))
              .then(item.find.bind(item, searchQuery.value))
              .finally(item.unload.bind(item))
      )
  )
  const merged = [].concat.apply([], results)
  searchResults.value = merged.map((r: any) => ({
    cfi: r.cfi,
    excerpt: r.excerpt.replace(searchQuery.value, `<mark>${searchQuery.value}</mark>`)
  }))
  isSearching.value = false
}

const jumpTo = (cfi: string) => {
  rendition.value.display(cfi)
  activeSidebar.value = null
  showControls.value = false
}

// --- 4. 初始化阅读器 ---
const initEpub = async (data: ArrayBuffer) => {
  if (bookInstance.value) bookInstance.value.destroy()

  bookInstance.value = ePub(data)
  rendition.value = bookInstance.value.renderTo('epub-render-root', {
    width: '100%',
    height: '100%',
    flow: pageMode.value === 'page' ? 'paginated' : 'scrolled'
  })

  // 1. 先加载元数据和目录
  const nav = await bookInstance.value.loaded.navigation
  chapters.value = nav.toc.map((t: any) => ({ title: t.label, href: t.href }))

  // 2. 获取保存的进度
  const savedProgress = await ebookStore.loadReadingProgress(book.value.id)

  // 3. 【关键修复】优先使用 CFI 渲染，这不需要等待 locations.generate
  if (savedProgress && savedProgress.cfi) {
    await rendition.value.display(savedProgress.cfi)
  } else {
    await rendition.value.display()
  }

  // 4. 样式应用
  applyStyles()

  // 5. 异步生成位置索引（仅用于更新进度条百分比，不用于定位）
  bookInstance.value.ready.then(() => {
    return bookInstance.value.locations.generate(1000)
  }).then(() => {
    if (savedProgress) {
      // 索引生成后，更新 UI 上的百分比显示
      const percent = bookInstance.value.locations.percentageFromCfi(savedProgress.cfi)
      readingProgress.value = Math.floor(percent * 100)
    }
  })

  // 关键：绑定 iframe 内部事件
  rendition.value.on('click', (e: MouseEvent) => handleGlobalClick(e.clientX))
  rendition.value.on('wheel', handleWheel)

  // 监听位置变化
  rendition.value.on('relocated', (location: any) => {
    // location.start.cfi 是当前页面第一行的精确坐标
    const currentCfi = location.start.cfi
    
    // 仅在 locations 准备好时更新百分比数值（不影响定位精度）
    if (bookInstance.value.locations.length() > 0) {
      const percent = bookInstance.value.locations.percentageFromCfi(currentCfi)
      readingProgress.value = Math.floor(percent * 100)
    }

    // 找到当前章节
    const chapter = chapters.value.find(c => location.start.href.includes(c.href))
    if (chapter) {
      currentChapterTitle.value = chapter.title
      // 更新当前章节索引
      currentChapterIndex.value = chapters.value.findIndex(c => c.href === chapter.href)
    }

    // 执行保存
    saveProgressInternal(currentCfi)
  })

  loading.value = false
}

const loadBookData = async () => {
  const b = ebookStore.getBookById(route.params.id as string)
  if (!b) return
  book.value = b
  const content = await localforage.getItem(`ebook_content_${b.id}`) as ArrayBuffer
  if (content) initEpub(content)
}

const openSidebar = (type: any) => {
  activeSidebar.value = type
  
  // 添加点击外部区域关闭弹窗的事件监听
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick)
  }, 0)
}

// 点击外部区域关闭弹窗
const handleOutsideClick = (event: MouseEvent) => {
  const sidebar = document.querySelector('.sidebar-system')
  if (sidebar && activeSidebar.value !== null) {
    // 检查点击是否在弹窗外部
    if (!sidebar.contains(event.target as Node)) {
      closeSidebar()
    }
  }
}

// 关闭侧边栏
const closeSidebar = () => {
  activeSidebar.value = null
  document.removeEventListener('click', handleOutsideClick)
}

const togglePageMode = async () => {
  // 切换翻页模式前保存阅读进度
  await saveProgress()
  pageMode.value = pageMode.value === 'page' ? 'scroll' : 'page'
  loading.value = true
  loadBookData()
}

const goToChapter = (href: string, index: number) => {
  currentChapterIndex.value = index
  rendition.value.display(href)
  activeSidebar.value = null
}

const onSliderChange = () => {
  const cfi = bookInstance.value.locations.cfiFromPercentage(readingProgress.value / 100)
  rendition.value.display(cfi)
}

const goBack = async () => {
  // 退出前保存阅读进度
  await saveProgress()
  router.push('/')
}
// 生命周期钩子
onMounted(async () => {
  // 加载用户配置
  await ebookStore.loadUserConfig()
  
  // 使用用户配置中的默认选项
  theme.value = ebookStore.userConfig.reader.theme
  fontSize.value = ebookStore.userConfig.reader.fontSize
  lineHeight.value = ebookStore.userConfig.reader.lineHeight
  pageMode.value = ebookStore.userConfig.reader.pageMode
  
  // 加载书籍数据
  await loadBookData()
})
onUnmounted(async () => {
  // 卸载前保存阅读进度
  await saveProgress()
  bookInstance.value?.destroy()
})
</script>

<style scoped>
/* 核心容器 */
.reader-master {
  width: 100vw; height: 100vh;
  position: relative; overflow: hidden;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  transition: background 0.5s ease;
}

.theme-light { background: #ffffff; color: #2c3e50; --glass: rgba(255,255,255,0.8); }
.theme-sepia { background: #f4ecd8; color: #5b4636; --glass: rgba(244,236,216,0.85); }
.theme-dark { background: #1a1a1a; color: #b0b0b0; --glass: rgba(26,26,26,0.85); }

/* 毛玻璃工具栏 */
.glass-bar {
  position: fixed; left: 0; right: 0; z-index: 1000;
  background: var(--glass);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border: 1px solid rgba(128,128,128,0.1);
  display: flex; align-items: center; padding: 0 24px;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.top-bar { top: 0; height: 64px; justify-content: space-between; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
.bottom-bar { bottom: 0; height: auto; padding: 20px 30px; flex-direction: column; box-shadow: 0 -4px 20px rgba(0,0,0,0.05); }

/* UI 细节 */
.bar-section { display: flex; align-items: center; gap: 15px; }
.book-meta { display: flex; flex-direction: column; }
.book-title { font-weight: 700; font-size: 15px; }
.chapter-badge { font-size: 11px; opacity: 0.6; }

.btn-icon { background: none; border: none; color: inherit; cursor: pointer; padding: 8px; border-radius: 50%; }
.btn-icon:hover { background: rgba(128,128,128,0.1); }

.btn-text { background: none; border: none; color: inherit; cursor: pointer; padding: 8px 12px; border-radius: 6px; font-size: 14px; }
.btn-text:hover { background: rgba(128,128,128,0.1); }

.btn-text-primary { background: none; border: none; color: #4a90e2; cursor: pointer; padding: 8px 12px; border-radius: 6px; font-size: 14px; font-weight: 700; }
.btn-text-primary:hover { background: rgba(74, 144, 226, 0.1); }

.btn-pill {
  background: rgba(128,128,128,0.1); border: 1px solid rgba(128,128,128,0.2);
  padding: 6px 16px; border-radius: 20px; color: inherit; cursor: pointer; font-size: 13px;
}

/* 阅读视口与热区 */
.reader-viewport { width: 100%; height: 100%; position: relative; }
.render-layer { width: 100%; height: 100%; }

.interaction-layer {
  position: absolute; inset: 0; pointer-events: none;
  display: flex; z-index: 10;
}
.hotspot { pointer-events: auto; height: 100%; }
.hotspot.left { width: 25%; }
.hotspot.center { width: 50%; }
.hotspot.right { width: 25%; }

/* 常驻进度条 */
.persistent-info {
  position: fixed; bottom: 15px; left: 20px; z-index: 500;
  pointer-events: none;
}
.progress-indicator { display: flex; align-items: center; gap: 8px; font-family: monospace; }
.percent { font-size: 12px; font-weight: bold; opacity: 0.5; }
.mini-bar { width: 40px; height: 3px; background: rgba(128,128,128,0.2); border-radius: 2px; }
.mini-bar .fill { height: 100%; background: #4a90e2; border-radius: 2px; }

/* 底部功能排布 */
.bottom-layout { width: 100%; max-width: 800px; margin: 0 auto; }
.progress-slider-wrapper { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; width: 100%; }
.ios-slider { flex: 1; height: 4px; appearance: none; background: rgba(128,128,128,0.2); border-radius: 2px; }
.ios-slider::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #4a90e2; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }

.quick-actions { display: flex; justify-content: space-between; align-items: center; }
.theme-switcher { display: flex; gap: 12px; }
.theme-dot { width: 24px; height: 24px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.theme-dot.active { border-color: #4a90e2; transform: scale(1.1); }
.theme-dot.light { background: #fff; box-shadow: inset 0 0 2px rgba(0,0,0,0.2); }
.theme-dot.sepia { background: #f4ecd8; }
.theme-dot.dark { background: #1a1a1a; }

.font-stepper { display: flex; align-items: center; gap: 15px; background: rgba(128,128,128,0.1); border-radius: 20px; padding: 4px 12px; }
.font-stepper button { border: none; background: none; color: inherit; font-size: 18px; cursor: pointer; }

/* 侧边栏 */
.sidebar-system {
  position: fixed; top: 0; right: 0; bottom: 0; width: 340px;
  background: var(--glass); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  z-index: 2000; box-shadow: -10px 0 30px rgba(0,0,0,0.1);
  display: flex; flex-direction: column;
}
.sidebar-header { padding: 25px; border-bottom: 1px solid rgba(128,128,128,0.1); display: flex; justify-content: space-between; align-items: center; }
.sidebar-scroll-area { flex: 1; overflow-y: auto; padding: 20px; }

.search-input-box { display: flex; gap: 10px; margin-bottom: 20px; }
.search-input-box input { flex: 1; background: rgba(128,128,128,0.1); border: none; padding: 10px; border-radius: 8px; color: inherit; }
.search-item { padding: 15px 0; border-bottom: 1px solid rgba(128,128,128,0.05); cursor: pointer; font-size: 13px; }
.search-item mark { background: #ffeb3b; color: #000; }

.toc-node { padding: 12px 15px; border-radius: 8px; cursor: pointer; margin-bottom: 4px; transition: 0.2s; }
.toc-node:hover { background: rgba(128,128,128,0.1); }
.toc-node.active { color: #4a90e2; font-weight: 700; background: rgba(74,144,226,0.1); }

/* 加载动画 */
.global-loader { position: absolute; inset: 0; background: inherit; z-index: 5000; display: flex; align-items: center; justify-content: center; }
.pulse-ring { width: 40px; height: 40px; border: 3px solid #4a90e2; border-radius: 50%; animation: pulse 1.5s infinite; }
@keyframes pulse { 0% { transform: scale(0.8); opacity: 0.5; } 100% { transform: scale(1.5); opacity: 0; } }

/* 动画系统 */
.slide-down-enter-from { transform: translateY(-100%); }
.slide-up-enter-from { transform: translateY(100%); }
.drawer-right-enter-from { transform: translateX(100%); }
.fade-enter-active, .slide-down-enter-active, .slide-up-enter-active, .drawer-right-enter-active { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }

.brightness-overlay { position: fixed; inset: 0; background: #000; pointer-events: none; z-index: 10000; }
</style>