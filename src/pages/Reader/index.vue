<template>
  <div class="reader-master" :class="[`theme-${theme}`, { 'controls-visible': showControls }]">
    <!-- 全局加载动画 -->
    <transition name="fade">
      <div v-if="loading" class="global-loader">
        <div class="loader-content">
          <div class="pulse-ring"></div>
          <p>正在精心排版中...</p>
        </div>
      </div>
    </transition>

    <!-- 顶部导航栏 -->
    <transition name="slide-down">
      <nav v-show="showControls" class="glass-bar top-bar">
        <div class="bar-section left">
          <button class="btn-icon" @click="goBack" title="退出阅读">
            <svg viewBox="0 0 24 24" width="24" height="24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor"/></svg>
          </button>
          <div class="book-meta">
            <span class="book-title">{{ book?.title || '未知书籍' }}</span>
            <div class="meta-details">
              <span class="chapter-badge">{{ currentChapterTitle }}</span>
              <span class="reading-stats">
                <span class="stat-item">{{ readingTime }}分钟</span>
                <span class="stat-divider">·</span>
                <span class="stat-item">{{ displayProgress }}%</span>
              </span>
            </div>
          </div>
        </div>
        <div class="bar-section right">
          <div class="quick-actions-header">
            <button class="btn-icon" @click="toggleBookmark" :title="isBookmarked ? '取消书签' : '添加书签'">
              <i :class="['icon', isBookmarked ? 'icon-bookmark-filled' : 'icon-bookmark']"></i>
            </button>
            <button class="btn-icon" @click="openSidebar('search')" title="搜索">
              <i class="icon-search"></i>
            </button>
            <button class="btn-icon" @click="openSidebar('contents')" title="目录">
              <i class="icon-toc"></i>
            </button>
            <button class="btn-icon" @click="openSidebar('settings')" title="设置">
              <i class="icon-settings"></i>
            </button>
          </div>
        </div>
      </nav>
    </transition>

    <!-- 主阅读区域 -->
    <main class="reader-viewport" ref="viewportRef">
      <!-- EPUB渲染 -->
      <div v-if="book?.format === 'epub'" id="epub-render-root" class="render-layer"></div>

      <!-- PDF渲染 -->
      <div v-else-if="book?.format === 'pdf'" class="render-layer pdf-container" @click="toggleControls">
        <canvas ref="pdfCanvas" class="pdf-canvas"></canvas>
      </div>

      <!-- 翻译模式遮罩层 -->
      <transition name="fade">
        <div v-if="translationMode && translationText" class="translation-overlay">
          <div class="translation-content">
            <div class="translation-header">
              <span class="translation-label">翻译</span>
              <button class="btn-icon small" @click="translationMode = false">
                <i class="icon-close"></i>
              </button>
            </div>
            <div class="translation-body">{{ translationText }}</div>
            <div class="translation-footer">
              <select v-model="translationLang" class="lang-select">
                <option value="en">英语</option>
                <option value="ja">日语</option>
                <option value="ko">韩语</option>
                <option value="fr">法语</option>
                <option value="de">德语</option>
              </select>
              <button class="btn-text small" @click="copyTranslation">复制</button>
            </div>
          </div>
        </div>
      </transition>

      <!-- 常驻进度指示器 -->
      <div class="persistent-info">
        <div class="progress-indicator" @click="toggleProgressPopup">
          <span class="percent">{{ displayProgress }}%</span>
          <div class="mini-bar">
            <div class="fill" :style="{ width: displayProgress + '%' }"></div>
          </div>
        </div>
        <div class="page-indicator" v-if="pageMode === 'page'">
          第 {{ currentPage }} / {{ totalPages }} 页
        </div>
      </div>

      <!-- 交互热区 -->
      <div class="interaction-layer">
        <div class="hotspot left" @click="pageMode === 'page' && prevPage()" title="上一页">
          <div class="nav-hint">←</div>
        </div>
        <div class="hotspot center" @click="toggleControls">
          <div class="tap-hint" v-if="showTapHint">点击显示控制栏</div>
        </div>
        <div class="hotspot right" @click="pageMode === 'page' && nextPage()" title="下一页">
          <div class="nav-hint">→</div>
        </div>
      </div>

      <!-- 快速操作悬浮按钮 -->
      <div class="floating-actions" v-show="!showControls">
        <button class="fab" @click="toggleTranslationMode" :class="{ active: translationMode }" title="翻译">
          <i class="icon-translate"></i>
        </button>
        <button class="fab" @click="addNote" title="笔记">
          <i class="icon-note"></i>
        </button>
        <button class="fab" @click="toggleBookmark" :class="{ active: isBookmarked }" title="书签">
          <i class="icon-bookmark"></i>
        </button>
      </div>
    </main>

    <!-- 底部控制栏 -->
    <transition name="slide-up">
      <footer v-show="showControls" class="glass-bar bottom-bar">
        <div class="bottom-layout">
          <!-- 进度条 -->
          <div class="progress-slider-wrapper">
            <div class="progress-labels">
              <span class="label">阅读进度</span>
              <span class="value">{{ displayProgress }}%</span>
            </div>
            <input 
              type="range" 
              v-model="displayProgress" 
              min="0" 
              max="100" 
              @input="onSliderInput"
              @change="onSliderChange"
              class="ios-slider"
            />
            <div class="chapter-progress">
              第 {{ currentChapterIndex + 1 }} / {{ chapters.length }} 章
            </div>
          </div>

          <!-- 快速操作区 -->
          <div class="quick-actions">
            <!-- 主题切换 -->
            <div class="theme-switcher">
              <div class="section-label">主题</div>
              <div class="theme-options">
                <button 
                  v-for="(config, key) in themeConfig" 
                  :key="key"
                  :class="['theme-option', key, { active: theme === key }]"
                  @click="setTheme(key)"
                  :title="config.name"
                >
                  <div class="theme-preview" :style="{ backgroundColor: config.bg }"></div>
                  <span class="theme-name">{{ config.name }}</span>
                </button>
              </div>
            </div>

            <!-- 字号调整 -->
            <div class="font-control">
              <div class="section-label">字号</div>
              <div class="font-stepper">
                <button @click="changeFontSize(-1)" :disabled="fontSize <= 12">
                  <i class="icon-font-smaller"></i>
                </button>
                <div class="font-size-display">{{ fontSize }}px</div>
                <button @click="changeFontSize(1)" :disabled="fontSize >= 30">
                  <i class="icon-font-larger"></i>
                </button>
              </div>
            </div>

            <!-- 阅读模式 -->
            <div class="mode-switcher">
              <div class="section-label">模式</div>
              <div class="mode-options">
                <button 
                  :class="['mode-option', { active: pageMode === 'page' }]"
                  @click="switchPageMode('page')"
                >
                  <i class="icon-page-mode"></i>
                  <span>翻页</span>
                </button>
                <button 
                  :class="['mode-option', { active: pageMode === 'scroll' }]"
                  @click="switchPageMode('scroll')"
                >
                  <i class="icon-scroll-mode"></i>
                  <span>滚动</span>
                </button>
                <button 
                  :class="['mode-option', { active: translationMode }]"
                  @click="toggleTranslationMode"
                >
                  <i class="icon-translate"></i>
                  <span>翻译</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </transition>

    <!-- 侧边栏系统 -->
    <transition name="drawer-right">
      <aside v-if="activeSidebar" class="sidebar-system">
        <div class="sidebar-header">
          <h3>{{ sidebarTitle }}</h3>
          <button class="close-x" @click="closeSidebar">×</button>
        </div>

        <div class="sidebar-scroll-area">
          <!-- 搜索面板 -->
          <div v-if="activeSidebar === 'search'" class="panel-search">
            <div class="search-input-box">
              <input 
                v-model="searchQuery" 
                placeholder="搜索全文内容..." 
                @keyup.enter="doFullTextSearch"
                ref="searchInput"
              >
              <button @click="doFullTextSearch" :disabled="isSearching">
                {{ isSearching ? '搜索中...' : '搜索' }}
              </button>
            </div>
            
            <div class="search-filters">
              <label class="filter-option">
                <input type="checkbox" v-model="searchCaseSensitive"> 区分大小写
              </label>
              <label class="filter-option">
                <input type="checkbox" v-model="searchWholeWord"> 全词匹配
              </label>
            </div>
            
            <div class="search-results">
              <div v-if="searchResults.length > 0" class="results-count">
                找到 {{ searchResults.length }} 个结果
              </div>
              
              <div 
                v-for="(item, idx) in searchResults" 
                :key="idx" 
                class="search-item" 
                @click="jumpTo(item.cfi)"
              >
                <div class="result-chapter">{{ item.chapter }}</div>
                <p v-html="item.excerpt"></p>
                <div class="result-meta">
                  <span class="page">第 {{ item.page }} 页</span>
                </div>
              </div>
              
              <div v-if="hasSearched && searchResults.length === 0" class="empty-tip">
                <i class="icon-search-empty"></i>
                <p>未找到匹配项</p>
                <p class="empty-tip-sub">尝试更换关键词或调整搜索设置</p>
              </div>
            </div>
          </div>

          <!-- 目录面板 -->
          <div v-if="activeSidebar === 'contents'" class="panel-toc">
            <div class="toc-header">
              <h4>目录</h4>
              <span class="toc-count">{{ chapters.length }} 章</span>
            </div>
            
            <div class="toc-scroll-container">
              <div 
                v-for="(item, idx) in chapters" 
                :key="idx"
                :class="['toc-node', { 
                  active: currentChapterIndex === idx,
                  read: item.read
                }]"
                @click="goToChapter(item.href, idx)"
              >
                <div class="toc-node-content">
                  <div class="toc-node-title">{{ item.title }}</div>
                  <div class="toc-node-meta">
                    <span class="toc-node-pages">{{ item.pages || '--' }}页</span>
                    <span class="toc-node-progress" v-if="item.progress > 0">
                      {{ Math.round(item.progress * 100) }}%
                    </span>
                  </div>
                </div>
                <div class="toc-node-indicator">
                  <div class="progress-dot" v-if="item.progress > 0 && item.progress < 1"></div>
                  <i class="icon-check" v-if="item.progress === 1"></i>
                </div>
              </div>
            </div>
          </div>

          <!-- 设置面板 -->
          <div v-if="activeSidebar === 'settings'" class="panel-settings">
            <!-- 亮度设置 -->
            <div class="settings-group">
              <div class="settings-group-header">
                <label>屏幕亮度</label>
                <span class="settings-value">{{ brightness }}%</span>
              </div>
              <input 
                type="range" 
                v-model="brightness" 
                min="10" 
                max="100" 
                class="settings-slider"
              >
            </div>
            
            <!-- 排版设置 -->
            <div class="settings-group">
              <div class="settings-group-header">
                <label>排版设置</label>
              </div>
              <div class="settings-row">
                <span>行间距</span>
                <div class="segment-ctrl">
                  <button 
                    v-for="l in [1.2, 1.5, 1.8, 2.0]" 
                    :key="l" 
                    :class="{ active: lineHeight === l }" 
                    @click="setLineHeight(l)"
                  >
                    {{ l }}
                  </button>
                </div>
              </div>
              
              <div class="settings-row">
                <span>页边距</span>
                <div class="segment-ctrl">
                  <button 
                    v-for="m in ['小', '中', '大']" 
                    :key="m" 
                    :class="{ active: margin === m }" 
                    @click="setMargin(m)"
                  >
                    {{ m }}
                  </button>
                </div>
              </div>
              
              <div class="settings-row">
                <span>对齐方式</span>
                <div class="segment-ctrl">
                  <button 
                    v-for="a in ['左对齐', '两端对齐']" 
                    :key="a" 
                    :class="{ active: alignment === a }" 
                    @click="setAlignment(a)"
                  >
                    {{ a }}
                  </button>
                </div>
              </div>
            </div>
            
            <!-- 高级设置 -->
            <div class="settings-group">
              <div class="settings-group-header">
                <label>高级设置</label>
              </div>
              
              <div class="settings-toggle">
                <label>
                  <span>自动滚动</span>
                  <input type="checkbox" v-model="autoScroll" @change="toggleAutoScroll">
                </label>
              </div>
              
              <div class="settings-toggle">
                <label>
                  <span>翻页动画</span>
                  <input type="checkbox" v-model="pageAnimation">
                </label>
              </div>
              
              <div class="settings-toggle">
                <label>
                  <span>夜间模式定时</span>
                  <input type="checkbox" v-model="autoNightMode">
                </label>
              </div>
              
              <div class="settings-toggle" v-if="autoNightMode">
                <label>
                  <span>夜间模式时间</span>
                  <input type="time" v-model="nightModeTime">
                </label>
              </div>
            </div>
            
            <!-- 数据管理 -->
            <div class="settings-group">
              <button class="btn-settings" @click="exportReadingData">
                <i class="icon-export"></i> 导出阅读数据
              </button>
              <button class="btn-settings" @click="clearCache">
                <i class="icon-clear"></i> 清除缓存
              </button>
            </div>
          </div>
        </div>
      </aside>
    </transition>

    <!-- 亮度遮罩层 -->
    <div class="brightness-overlay" :style="{ opacity: (100 - brightness) / 100 }"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
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
const isSavingProgress = ref(false)
const isLocationsReady = ref(false)
const activeSidebar = ref<'search' | 'contents' | 'settings' | null>(null)
const theme = ref<'light' | 'sepia' | 'dark'>('light')
const fontSize = ref(18)
const lineHeight = ref(1.5)
const brightness = ref(100)
const pageMode = ref<'page' | 'scroll'>('page')
const margin = ref('中')
const alignment = ref('两端对齐')
const autoScroll = ref(false)
const pageAnimation = ref(true)
const autoNightMode = ref(false)
const nightModeTime = ref('22:00')
const showTapHint = ref(false)

// 书籍相关
const book = ref<any>(null)
const chapters = ref<any[]>([])
const currentChapterIndex = ref(0)
const currentChapterTitle = ref('正在载入...')
const currentPage = ref(1)
const totalPages = ref(0)
const readingProgress = ref(0)
const displayProgress = ref(0)
const readingTime = ref(0)

// 翻译相关
const translationMode = ref(false)
const translationText = ref('')
const translationLang = ref('en')
const translationPending = ref(false)

// 书签相关
const isBookmarked = ref(false)
const bookmarks = ref<any[]>([])

// 搜索相关
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const isSearching = ref(false)
const hasSearched = ref(false)
const searchCaseSensitive = ref(false)
const searchWholeWord = ref(false)

// 实例引用
const rendition = ref<any>(null)
const bookInstance = ref<any>(null)
const viewportRef = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLElement | null>(null)

// 滚动模式相关
const nextChapterRendition = ref<any>(null)
const prevChapterRendition = ref<any>(null)
const isScrollModeActive = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)
const observer = ref<IntersectionObserver | null>(null)
const nextChapterTrigger = ref<HTMLElement | null>(null)
const prevChapterTrigger = ref<HTMLElement | null>(null)

// 性能优化
let scrollDebounceTimer: number | null = null
let autoScrollTimer: number | null = null
const SCROLL_DEBOUNCE_DELAY = 300
const AUTO_SCROLL_INTERVAL = 50
const isChapterSwitching = ref(false)

// 主题配置
const themeConfig = {
  light: { name: '明亮', bg: '#ffffff', text: '#2c3e50', icon: '#4a5568' },
  sepia: { name: '护眼', bg: '#f4ecd8', text: '#5b4636', icon: '#7c6f5a' },
  dark: { name: '夜晚', bg: '#1a1a1a', text: '#e2e8f0', icon: '#a0aec0' }
}

const sidebarTitle = computed(() => {
  const titles = { 
    search: '全文搜索', 
    contents: '书籍目录', 
    settings: '个性化设置' 
  }
  return titles[activeSidebar.value || 'search']
})

// --- 核心交互修复 ---
const handleGlobalClick = (clientX: number) => {
  const width = window.innerWidth
  const threshold = width * 0.3 // 调整热区比例为30%

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
  if (showControls.value) {
    activeSidebar.value = null
  } else {
    showTapHint.value = true
    setTimeout(() => {
      showTapHint.value = false
    }, 500)
  }
}

const prevPage = () => {
  if (rendition.value) {
    rendition.value.prev()
    updatePageInfo()
  }
}

const nextPage = () => {
  if (rendition.value) {
    rendition.value.next()
    updatePageInfo()
  }
}

const handleWheel = (e: WheelEvent) => {
  if (pageMode.value === 'page') {
    e.preventDefault()
    if (Math.abs(e.deltaY) < 15) return
    if (e.deltaY > 0) nextPage()
    else prevPage()
  } else if (pageMode.value === 'scroll' && autoScroll.value) {
    e.preventDefault()
    // 在自动滚动模式下，鼠标滚轮暂停自动滚动
    pauseAutoScroll()
  }
}

// --- 翻译功能优化 ---
const toggleTranslationMode = async () => {
  translationMode.value = !translationMode.value
  
  if (translationMode.value) {
    // 获取当前选中文本或段落
    const selectedText = window.getSelection()?.toString()
    if (selectedText && selectedText.length > 0) {
      await translateText(selectedText)
    } else {
      // 如果没有选中文本，获取当前可见区域的文本
      translationText.value = '请先选择要翻译的文本'
    }
  }
}

const translateText = async (text: string) => {
  if (!text.trim() || translationPending.value) return
  
  translationPending.value = true
  translationText.value = '翻译中...'
  
  try {
    // TODO: 调用翻译API
    // 这里先模拟翻译结果
    await new Promise(resolve => setTimeout(resolve, 500))
    translationText.value = `Translation: ${text} (${translationLang.value})`
  } catch (error) {
    console.error('翻译失败:', error)
    translationText.value = '翻译失败，请稍后重试'
  } finally {
    translationPending.value = false
  }
}

const copyTranslation = () => {
  navigator.clipboard.writeText(translationText.value)
    .then(() => {
      // 可以添加Toast提示
      console.log('翻译文本已复制')
    })
    .catch(err => {
      console.error('复制失败:', err)
    })
}

// --- 书签功能 ---
const toggleBookmark = async () => {
  if (!book.value || !rendition.value) return
  
  const location = rendition.value.currentLocation()
  if (!location) return
  
  const bookmark = {
    id: Date.now(),
    bookId: book.value.id,
    chapterIndex: currentChapterIndex.value,
    chapterTitle: currentChapterTitle.value,
    cfi: location.start?.cfi,
    page: currentPage.value,
    timestamp: Date.now(),
    note: ''
  }
  
  if (isBookmarked.value) {
    // 移除书签
    bookmarks.value = bookmarks.value.filter(b => b.cfi !== bookmark.cfi)
  } else {
    // 添加书签
    bookmarks.value.push(bookmark)
  }
  
  isBookmarked.value = !isBookmarked.value
  await saveBookmarks()
}

const saveBookmarks = async () => {
  if (!book.value) return
  await localforage.setItem(`bookmarks_${book.value.id}`, bookmarks.value)
}

const loadBookmarks = async () => {
  if (!book.value) return
  const saved = await localforage.getItem(`bookmarks_${book.value.id}`) as any[]
  bookmarks.value = saved || []
  
  // 检查当前是否已被书签标记
  if (rendition.value) {
    const location = rendition.value.currentLocation()
    if (location?.start?.cfi) {
      isBookmarked.value = bookmarks.value.some(b => b.cfi === location.start.cfi)
    }
  }
}

// --- 滚动模式修复 ---
const setupScrollMode = async () => {
  if (!rendition.value) return
  
  console.log('设置滚动模式')
  isScrollModeActive.value = true
  
  rendition.value.flow('scrolled')
  
  const container = document.getElementById('epub-render-root')
  if (container) {
    container.style.overflow = 'auto'
    container.style.height = '100%'
    container.style.scrollBehavior = 'smooth'
  }
  
  await nextTick()
  await setupScrollObserver()
}

const cleanupScrollMode = () => {
  console.log('清理滚动模式')
  isScrollModeActive.value = false
  
  try {
    cleanupScrollObserver()
  } catch (e) {
    console.warn('清理滚动观察器失败:', e)
  }
  
  try {
    cleanupNextChapter()
  } catch (e) {
    console.warn('清理下一章失败:', e)
  }
  
  try {
    cleanupPrevChapter()
  } catch (e) {
    console.warn('清理上一章失败:', e)
  }
  
  const container = document.getElementById('epub-render-root')
  if (container) {
    container.style.overflow = 'hidden'
  }
}

// --- 自动滚动功能 ---
const startAutoScroll = () => {
  if (!autoScroll.value || pageMode.value !== 'scroll') return
  
  const container = document.getElementById('epub-render-root')
  if (!container) return
  
  autoScrollTimer = window.setInterval(() => {
    container.scrollTop += 1 // 缓慢滚动
  }, AUTO_SCROLL_INTERVAL)
}

const pauseAutoScroll = () => {
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer)
    autoScrollTimer = null
  }
}

const toggleAutoScroll = () => {
  if (autoScroll.value) {
    startAutoScroll()
  } else {
    pauseAutoScroll()
  }
}

// --- 样式应用优化 ---
const applyStyles = () => {
  if (!rendition.value) return

  // 构建完整的样式对象
  const customTheme = {
    body: {
      'background': `${themeConfig[theme.value].bg} !important`,
      'color': `${themeConfig[theme.value].text} !important`,
      'font-size': `${fontSize.value}px !important`,
      'line-height': `${lineHeight.value} !important`,
      'margin': getMarginValue(margin.value) + ' !important',
      'text-align': getAlignmentValue(alignment.value) + ' !important',
      'transition': 'none !important'
    },
    'p, div': {
      'text-align': getAlignmentValue(alignment.value) + ' !important',
      'line-height': `${lineHeight.value} !important`,
      'transition': 'none !important'
    }
  }

  // 应用到当前章节
  rendition.value.themes.register('custom', customTheme)
  rendition.value.themes.select('custom')

  // 应用到预加载章节
  if (nextChapterRendition.value) {
    nextChapterRendition.value.themes.register('custom', customTheme)
    nextChapterRendition.value.themes.select('custom')
  }
  
  if (prevChapterRendition.value) {
    prevChapterRendition.value.themes.register('custom', customTheme)
    prevChapterRendition.value.themes.select('custom')
  }
  
  // 更新页面信息
  updatePageInfo()
}

const getMarginValue = (margin: string) => {
  const margins = { '小': '10px', '中': '20px', '大': '30px' }
  return margins[margin as keyof typeof margins] || '20px'
}

const getAlignmentValue = (alignment: string) => {
  const alignments = { '左对齐': 'left', '两端对齐': 'justify' }
  return alignments[alignment as keyof typeof alignments] || 'justify'
}

const setTheme = (key: 'light' | 'sepia' | 'dark') => {
  theme.value = key
  applyStyles()
  saveUserConfig()
}

const changeFontSize = (delta: number) => {
  const newSize = fontSize.value + delta
  if (newSize >= 12 && newSize <= 30) {
    fontSize.value = newSize
    applyStyles()
    saveUserConfig()
  }
}

const setLineHeight = (height: number) => {
  lineHeight.value = height
  applyStyles()
  saveUserConfig()
}

const setMargin = (value: string) => {
  margin.value = value
  applyStyles()
  saveUserConfig()
}

const setAlignment = (value: string) => {
  alignment.value = value
  applyStyles()
  saveUserConfig()
}

const switchPageMode = async (mode: 'page' | 'scroll') => {
  if (mode === pageMode.value) return
  
  // 保存当前进度
  await saveProgress()
  
  // 清理当前模式
  if (pageMode.value === 'scroll') {
    cleanupScrollMode()
  }
  
  pageMode.value = mode
  
  // 重新初始化阅读器
  loading.value = true
  setTimeout(async () => {
    await initEpub()
    loading.value = false
  }, 100)
  
  saveUserConfig()
}

const updatePageInfo = () => {
  if (!rendition.value || pageMode.value !== 'page') return
  
  const location = rendition.value.currentLocation()
  if (location) {
    currentPage.value = location.start?.displayed?.page || 1
    totalPages.value = location.start?.displayed?.total || 1
  }
}

// --- 搜索功能优化 ---
const doFullTextSearch = async () => {
  if (!searchQuery.value.trim() || !bookInstance.value) return
  
  isSearching.value = true
  hasSearched.value = true
  searchResults.value = []

  try {
    const results = await Promise.all(
      bookInstance.value.spine.spineItems.map(async (item: any) => {
        await item.load(bookInstance.value.load.bind(bookInstance.value))
        
        const searchOptions = {
          caseSensitive: searchCaseSensitive.value,
          wholeWord: searchWholeWord.value
        }
        
        const matches = await item.find(searchQuery.value, searchOptions)
        await item.unload()
        
        return matches.map((match: any) => ({
          ...match,
          chapter: item.href,
          excerpt: match.excerpt.replace(
            new RegExp(searchQuery.value, searchCaseSensitive.value ? 'g' : 'gi'),
            `<mark>${searchQuery.value}</mark>`
          )
        }))
      })
    )
    
    const mergedResults = results.flat()
    searchResults.value = mergedResults
    
  } catch (error) {
    console.error('搜索失败:', error)
  } finally {
    isSearching.value = false
  }
}

const jumpTo = (cfi: string) => {
  if (rendition.value) {
    rendition.value.display(cfi)
    activeSidebar.value = null
    showControls.value = false
    updatePageInfo()
  }
}

// --- 进度管理优化 ---
const saveProgressInternal = async (cfi: string) => {
  if (!book.value || !bookInstance.value) return
  
  try {
    let percent = 0
    if (isLocationsReady.value && bookInstance.value.locations.length() > 0) {
      percent = bookInstance.value.locations.percentageFromCfi(cfi)
      readingProgress.value = Math.floor(percent * 100)
      displayProgress.value = Math.floor(percent * 100)
    } else if (displayProgress.value > 0) {
      percent = displayProgress.value / 100
    }
    
    readingTime.value = Math.floor(readingTime.value + 0.5)
    
    const progressData = {
      ebookId: book.value.id,
      chapterIndex: currentChapterIndex.value,
      chapterTitle: currentChapterTitle.value,
      position: percent,
      cfi: cfi,
      timestamp: Date.now(),
      readingTime: readingTime.value,
      deviceId: ebookStore.deviceInfo.id,
      deviceName: ebookStore.deviceInfo.name
    }
    
    await ebookStore.saveReadingProgress(progressData)
    console.log('阅读进度保存成功')
    
    if (chapters.value[currentChapterIndex.value]) {
      chapters.value[currentChapterIndex.value].progress = percent
      chapters.value[currentChapterIndex.value].read = percent > 0.9
    }
    
  } catch (error) {
    console.error('保存阅读进度失败:', error)
  }
}

const onSliderInput = () => {
  // 实时更新进度显示
}

const onSliderChange = () => {
  if (bookInstance.value && rendition.value && isLocationsReady.value) {
    const cfi = bookInstance.value.locations.cfiFromPercentage(displayProgress.value / 100)
    if (cfi) {
      rendition.value.display(cfi)
      updatePageInfo()
    }
  }
}

const toggleProgressPopup = () => {
  // 可以扩展为显示进度详情弹窗
  console.log('显示进度详情')
}

// --- 初始化优化 ---
const initEpub = async () => {
  if (!book.value) return
  
  isLocationsReady.value = false
  displayProgress.value = 0
  readingProgress.value = 0
  
  const content = await localforage.getItem(`ebook_content_${book.value.id}`) as ArrayBuffer
  if (!content) {
    console.error('书籍内容加载失败')
    loading.value = false
    return
  }
  
  // 清理旧实例
  if (bookInstance.value) {
    bookInstance.value.destroy()
  }
  
  // 清理滚动模式相关
  cleanupScrollMode()
  
  try {
    await nextTick()
    
    const container = document.getElementById('epub-render-root')
    if (!container) {
      console.error('渲染容器不存在')
      loading.value = false
      return
    }
    
    bookInstance.value = ePub(content)
    
    const renderOptions = {
      width: '100%',
      height: '100%',
      flow: pageMode.value === 'page' ? 'paginated' : 'scrolled',
      manager: 'continuous',
      snap: pageMode.value === 'page',
      spread: 'none',
      minSpreadWidth: 0,
      allowScripts: true,
      allowModals: true
    }
    
    rendition.value = bookInstance.value.renderTo(container, renderOptions)
    
    // 加载元数据和目录
    const nav = await bookInstance.value.loaded.navigation
    chapters.value = nav.toc.map((t: any) => ({ 
      title: t.label, 
      href: t.href,
      progress: 0,
      read: false
    }))
    
    // 获取保存的进度
    const savedProgress = await ebookStore.loadReadingProgress(book.value.id)
    
    // 初始化阅读位置
    if (savedProgress && savedProgress.cfi) {
      await rendition.value.display(savedProgress.cfi)
      currentChapterIndex.value = savedProgress.chapterIndex || 0
      readingTime.value = savedProgress.readingTime || 0
      if (savedProgress.position !== undefined) {
        readingProgress.value = Math.floor(savedProgress.position * 100)
        displayProgress.value = Math.floor(savedProgress.position * 100)
      }
    } else {
      await rendition.value.display()
    }
    
    // 加载书签
    await loadBookmarks()
    
    // 应用样式
    applyStyles()
    
    // 绑定事件
    bindRenditionEvents()
    
    // 如果是滚动模式，需要额外设置
    if (pageMode.value === 'scroll') {
      await setupScrollMode()
    }
    
    // 异步生成位置索引
    bookInstance.value.ready.then(() => {
      return bookInstance.value.locations.generate(1000)
    }).then(() => {
      isLocationsReady.value = true
      
      if (savedProgress && savedProgress.cfi) {
        const percent = bookInstance.value.locations.percentageFromCfi(savedProgress.cfi)
        readingProgress.value = Math.floor(percent * 100)
        displayProgress.value = Math.floor(percent * 100)
      } else {
        const location = rendition.value.currentLocation()
        if (location?.start?.cfi) {
          const percent = bookInstance.value.locations.percentageFromCfi(location.start.cfi)
          readingProgress.value = Math.floor(percent * 100)
          displayProgress.value = Math.floor(percent * 100)
        }
      }
    }).catch(err => {
      console.warn('位置索引生成失败:', err)
    })
    
    loading.value = false
    
  } catch (error) {
    console.error('EPUB初始化失败:', error)
    loading.value = false
  }
}

// --- 侧边栏管理 ---
const openSidebar = (type: 'search' | 'contents' | 'settings') => {
  activeSidebar.value = type
  
  // 如果是搜索面板，自动聚焦输入框
  if (type === 'search') {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
  
  // 添加外部点击监听
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick)
  }, 0)
}

const handleOutsideClick = (event: MouseEvent) => {
  const sidebar = document.querySelector('.sidebar-system')
  if (sidebar && activeSidebar.value !== null) {
    if (!sidebar.contains(event.target as Node)) {
      closeSidebar()
    }
  }
}

const closeSidebar = () => {
  activeSidebar.value = null
  document.removeEventListener('click', handleOutsideClick)
}

const goToChapter = (href: string, index: number) => {
  currentChapterIndex.value = index
  if (rendition.value) {
    rendition.value.display(href)
    activeSidebar.value = null
    showControls.value = false
    updatePageInfo()
  }
}

// --- 数据管理 ---
const saveUserConfig = async () => {
  const config = {
    theme: theme.value,
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    pageMode: pageMode.value,
    margin: margin.value,
    alignment: alignment.value,
    autoScroll: autoScroll.value,
    pageAnimation: pageAnimation.value,
    autoNightMode: autoNightMode.value,
    nightModeTime: nightModeTime.value
  }
  
  await localforage.setItem('reader_config', config)
}

const loadUserConfig = async () => {
  const config = await localforage.getItem('reader_config') as any
  if (config) {
    theme.value = config.theme || 'light'
    fontSize.value = config.fontSize || 18
    lineHeight.value = config.lineHeight || 1.5
    pageMode.value = config.pageMode || 'page'
    margin.value = config.margin || '中'
    alignment.value = config.alignment || '两端对齐'
    autoScroll.value = config.autoScroll || false
    pageAnimation.value = config.pageAnimation !== false
    autoNightMode.value = config.autoNightMode || false
    nightModeTime.value = config.nightModeTime || '22:00'
  }
}

const exportReadingData = async () => {
  const data = {
    book: book.value,
    progress: displayProgress.value,
    chapters: chapters.value,
    bookmarks: bookmarks.value,
    config: {
      theme: theme.value,
      fontSize: fontSize.value,
      pageMode: pageMode.value
    }
  }
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${book.value?.title || 'book'}_reading_data.json`
  a.click()
  URL.revokeObjectURL(url)
}

const clearCache = async () => {
  if (confirm('确定要清除阅读器缓存吗？这不会删除您的阅读进度。')) {
    await localforage.removeItem(`bookmarks_${book.value.id}`)
    // 可以添加更多缓存清理
    alert('缓存已清除')
  }
}

const goBack = async () => {
  if (isSavingProgress.value) {
    bookInstance.value?.destroy()
    bookInstance.value = null
    rendition.value = null
    router.push('/')
    return
  }
  
  isSavingProgress.value = true
  isLocationsReady.value = false
  
  try {
    await saveProgress()
  } catch (e) {
    console.warn('保存进度失败:', e)
  }

  if (ebookStore.isBaidupanTokenValid() && book.value) {
    ebookStore.syncCurrentBookProgress(book.value.id)
  }
  
  bookInstance.value?.destroy()
  bookInstance.value = null
  rendition.value = null

  router.push('/')
}

// --- 生命周期 ---
onMounted(async () => {
  isLocationsReady.value = false
  
  await loadUserConfig()
  
  const bookId = route.params.id as string
  book.value = ebookStore.getBookById(bookId)
  
  if (book.value) {
    await initEpub()
  } else {
    console.error('书籍不存在')
    router.push('/')
  }
  
  if (autoNightMode.value) {
    checkNightMode()
    setInterval(checkNightMode, 60000)
  }
})

onBeforeUnmount(async () => {
  if (isSavingProgress.value) {
    if (autoScrollTimer) {
      clearInterval(autoScrollTimer)
      autoScrollTimer = null
    }
    return
  }
  
  console.log('组件卸载，保存阅读进度...')
  isSavingProgress.value = true
  isLocationsReady.value = false
  
  try {
    await saveProgress()
  } catch (e) {
    console.warn('保存进度失败:', e)
  }
  
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer)
    autoScrollTimer = null
  }
  
  if (ebookStore.isBaidupanTokenValid() && book.value) {
    ebookStore.syncCurrentBookProgress(book.value.id)
  }
})

onUnmounted(async () => {
  try {
    cleanupNextChapter()
  } catch (e) {
    console.warn('清理下一章失败:', e)
  }
  
  try {
    cleanupPrevChapter()
  } catch (e) {
    console.warn('清理上一章失败:', e)
  }
  
  try {
    cleanupScrollObserver()
  } catch (e) {
    console.warn('清理滚动观察器失败:', e)
  }
  
  try {
    bookInstance.value?.destroy()
  } catch (e) {
    console.warn('销毁书籍实例失败:', e)
  }
  
  bookInstance.value = null
  rendition.value = null
})

// --- 辅助函数 ---
const checkNightMode = () => {
  if (!autoNightMode.value) return
  
  const now = new Date()
  const [hours, minutes] = nightModeTime.value.split(':').map(Number)
  const nightTime = new Date()
  nightTime.setHours(hours, minutes, 0, 0)
  
  if (now >= nightTime && theme.value !== 'dark') {
    setTheme('dark')
  } else if (now < nightTime && theme.value === 'dark') {
    setTheme('light')
  }
}

const setupScrollObserver = async () => {
  if (!rendition.value) return
  
  const container = document.getElementById('epub-render-root')
  if (!container) return
  
  observer.value = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (entry.target === nextChapterTrigger.value) {
            loadNextChapter()
          } else if (entry.target === prevChapterTrigger.value) {
            loadPrevChapter()
          }
        }
      })
    },
    { threshold: 0.1 }
  )
  
  if (nextChapterTrigger.value) {
    observer.value.observe(nextChapterTrigger.value)
  }
  if (prevChapterTrigger.value) {
    observer.value.observe(prevChapterTrigger.value)
  }
}

const cleanupScrollObserver = () => {
  if (observer.value) {
    observer.value.disconnect()
    observer.value = null
  }
}

const preloadNextChapter = async () => {
  if (!bookInstance.value || currentChapterIndex.value >= chapters.value.length - 1) return
  
  const nextChapter = chapters.value[currentChapterIndex.value + 1]
  if (!nextChapter) return
  
  try {
    if (nextChapterRendition.value) {
      nextChapterRendition.value.destroy()
    }
    
    const container = document.getElementById('epub-render-root')
    if (!container) return
    
    nextChapterRendition.value = bookInstance.value.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: 'scrolled',
      manager: 'continuous',
      allowScripts: true
    })
    
    await nextChapterRendition.value.display(nextChapter.href)
    applyStyles()
  } catch (error) {
    console.error('预加载下一章失败:', error)
  }
}

const loadNextChapter = async () => {
  if (isChapterSwitching.value || currentChapterIndex.value >= chapters.value.length - 1) return
  
  isChapterSwitching.value = true
  
  const container = document.getElementById('epub-render-root')
  
  currentChapterIndex.value++
  
  await rendition.value.display(chapters.value[currentChapterIndex.value].href)
  
  await nextTick()
  
  if (container) {
    container.scrollTop = 0
  }
  
  await preloadNextChapter()
  
  isChapterSwitching.value = false
}

const loadPrevChapter = async () => {
  if (isChapterSwitching.value || currentChapterIndex.value <= 0) return
  
  isChapterSwitching.value = true
  
  const container = document.getElementById('epub-render-root')
  
  currentChapterIndex.value--
  
  await rendition.value.display(chapters.value[currentChapterIndex.value].href)
  
  await nextTick()
  
  if (container) {
    container.scrollTop = container.scrollHeight
  }
  
  isChapterSwitching.value = false
}

const cleanupNextChapter = () => {
  if (nextChapterRendition.value) {
    nextChapterRendition.value.destroy()
    nextChapterRendition.value = null
  }
}

const cleanupPrevChapter = () => {
  if (prevChapterRendition.value) {
    prevChapterRendition.value.destroy()
    prevChapterRendition.value = null
  }
}

const bindRenditionEvents = () => {
  if (!rendition.value) return
  
  rendition.value.on('relocated', (location: any) => {
    updatePageInfo()
    if (location.start?.cfi) {
      saveProgressInternal(location.start.cfi)
    }
  })
  
  rendition.value.on('rendered', (section: any) => {
    currentChapterTitle.value = section.document.title || chapters.value[currentChapterIndex.value]?.title || '未知章节'
  })
}

const saveProgress = async () => {
  if (!rendition.value) return
  
  const location = rendition.value.currentLocation()
  if (location?.start?.cfi) {
    await saveProgressInternal(location.start.cfi)
  }
}

const addNote = () => {
  console.log('添加笔记功能待实现')
}

</script>

<style scoped>
/* 核心容器 */
.reader-master {
  width: 100vw; height: 100vh;
  position: relative; overflow: hidden;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  transition: background 0.5s ease;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.theme-light { 
  background: #ffffff; 
  color: #2c3e50; 
  --glass: rgba(255,255,255,0.92);
  --glass-border: rgba(0,0,0,0.08);
}
.theme-sepia { 
  background: #f4ecd8; 
  color: #5b4636; 
  --glass: rgba(244,236,216,0.92);
  --glass-border: rgba(91,70,54,0.08);
}
.theme-dark { 
  background: #1a1a1a; 
  color: #e2e8f0; 
  --glass: rgba(26,26,26,0.92);
  --glass-border: rgba(255,255,255,0.08);
}

/* 毛玻璃工具栏 */
.glass-bar {
  position: fixed; left: 0; right: 0; z-index: 1000;
  background: var(--glass);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--glass-border);
  display: flex; align-items: center;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.top-bar { 
  top: 0; 
  height: 70px; 
  justify-content: space-between; 
  padding: 0 24px;
  box-shadow: 0 4px 30px rgba(0,0,0,0.08);
}

.bottom-bar { 
  bottom: 0; 
  height: auto; 
  padding: 24px 30px; 
  flex-direction: column; 
  box-shadow: 0 -4px 30px rgba(0,0,0,0.08);
  gap: 24px;
}

/* UI 细节 */
.bar-section { 
  display: flex; 
  align-items: center; 
  gap: 16px; 
}

.book-meta { 
  display: flex; 
  flex-direction: column; 
  gap: 4px;
}

.book-title { 
  font-weight: 700; 
  font-size: 16px; 
  line-height: 1.2;
}

.meta-details {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  opacity: 0.8;
}

.chapter-badge {
  font-size: 11px;
  background: rgba(74,144,226,0.1);
  padding: 2px 8px;
  border-radius: 10px;
  color: #4a90e2;
}

.reading-stats {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-item {
  font-size: 11px;
  opacity: 0.6;
}

.stat-divider {
  opacity: 0.3;
}

.quick-actions-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-icon {
  background: none; 
  border: none; 
  color: inherit; 
  cursor: pointer; 
  padding: 10px; 
  border-radius: 50%; 
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover { 
  background: rgba(128,128,128,0.1); 
  transform: scale(1.05);
}

.btn-icon:active {
  transform: scale(0.95);
}

.btn-icon.small {
  padding: 6px;
}

.btn-icon i {
  font-size: 20px;
}

.btn-text {
  background: none; 
  border: none; 
  color: inherit; 
  cursor: pointer; 
  padding: 8px 16px; 
  border-radius: 8px; 
  font-size: 14px;
  transition: all 0.2s ease;
}

.btn-text:hover { 
  background: rgba(128,128,128,0.1); 
}

.btn-text.small {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-text-primary { 
  background: none; 
  border: none; 
  color: #4a90e2; 
  cursor: pointer; 
  padding: 8px 16px; 
  border-radius: 8px; 
  font-size: 14px; 
  font-weight: 600; 
  transition: all 0.2s ease;
}

.btn-text-primary:hover { 
  background: rgba(74, 144, 226, 0.1); 
}

.btn-pill {
  background: rgba(128,128,128,0.1); 
  border: 1px solid rgba(128,128,128,0.2);
  padding: 8px 20px; 
  border-radius: 20px; 
  color: inherit; 
  cursor: pointer; 
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-pill:hover {
  background: rgba(128,128,128,0.15);
  transform: translateY(-1px);
}

/* 阅读视口与热区 */
.reader-viewport { 
  width: 100%; 
  height: 100%; 
  position: relative; 
  overflow: hidden;
}

.render-layer { 
  width: 100%; 
  height: 100%; 
}

.pdf-container {
  display: flex;
  align-items: center;
  justify-content: center;
}

.pdf-canvas {
  max-width: 100%;
  max-height: 100%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.1);
}

/* 翻译遮罩层 */
.translation-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(10px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.translation-content {
  background: var(--glass);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 24px;
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

.translation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.translation-label {
  font-size: 14px;
  font-weight: 600;
  color: #4a90e2;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.theme-dark .translation-label {
  color: #5b9bd5;
}

.translation-body {
  flex: 1;
  overflow-y: auto;
  font-size: 16px;
  line-height: 1.6;
  padding: 12px;
  background: rgba(128,128,128,0.05);
  border-radius: 8px;
  max-height: 300px;
  color: inherit;
}

.translation-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.lang-select {
  flex: 1;
  background: rgba(128,128,128,0.1);
  border: 1px solid rgba(128,128,128,0.2);
  border-radius: 8px;
  padding: 8px 12px;
  color: inherit;
  font-size: 14px;
  outline: none;
}

.lang-select:focus {
  border-color: #4a90e2;
}

/* 交互热区 */
.interaction-layer {
  position: absolute; 
  inset: 0; 
  pointer-events: none;
  display: flex; 
  z-index: 100;
}

.hotspot { 
  pointer-events: auto; 
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.hotspot.left { 
  width: 25%; 
  cursor: w-resize;
}

.hotspot.center { 
  width: 50%; 
  cursor: pointer;
}

.hotspot.right { 
  width: 25%; 
  cursor: e-resize;
}

.hotspot:hover {
  background: transparent;
}

.nav-hint {
  opacity: 0;
  font-size: 32px;
  font-weight: 300;
  color: rgba(128,128,128,0.3);
  transition: opacity 0.2s ease;
}

.hotspot:hover .nav-hint {
  opacity: 0.01;
}

.tap-hint {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.7);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  opacity: 1;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

/* 常驻信息 */
.persistent-info {
  position: fixed; 
  bottom: 20px; 
  left: 20px; 
  z-index: 500;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-indicator { 
  display: flex; 
  align-items: center; 
  gap: 12px; 
  font-family: 'SF Mono', monospace;
  pointer-events: auto;
  cursor: pointer;
  background: var(--glass);
  backdrop-filter: blur(10px);
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--glass-border);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: all 0.3s ease;
}

.progress-indicator:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}

.percent { 
  font-size: 14px; 
  font-weight: 700; 
  color: #4a90e2;
  min-width: 40px;
}

.mini-bar { 
  width: 80px; 
  height: 4px; 
  background: rgba(128,128,128,0.2); 
  border-radius: 2px; 
  overflow: hidden;
}

.mini-bar .fill { 
  height: 100%; 
  background: #4a90e2; 
  border-radius: 2px; 
  transition: width 0.3s ease;
}

.page-indicator {
  font-size: 12px;
  opacity: 0.7;
  background: var(--glass);
  backdrop-filter: blur(10px);
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid var(--glass-border);
  align-self: flex-start;
}

/* 悬浮按钮 */
.floating-actions {
  position: fixed;
  bottom: 100px;
  right: 24px;
  z-index: 500;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--glass);
  backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fab:hover {
  transform: translateY(-4px) scale(1.1);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}

.fab:active {
  transform: translateY(-2px) scale(1.05);
}

.fab.active {
  background: #4a90e2;
  color: white;
  border-color: #4a90e2;
}

/* 底部布局 */
.bottom-layout { 
  width: 100%; 
  max-width: 900px; 
  margin: 0 auto; 
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.progress-slider-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-labels .label {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.8;
}

.progress-labels .value {
  font-size: 14px;
  font-weight: 700;
  color: #4a90e2;
}

.chapter-progress {
  font-size: 12px;
  opacity: 0.6;
  text-align: center;
}

.ios-slider { 
  width: 100%;
  height: 6px; 
  appearance: none; 
  background: rgba(128,128,128,0.2); 
  border-radius: 3px; 
  outline: none;
}

.ios-slider::-webkit-slider-thumb { 
  appearance: none; 
  width: 24px; 
  height: 24px; 
  border-radius: 50%; 
  background: #4a90e2; 
  cursor: pointer; 
  box-shadow: 0 4px 12px rgba(74,144,226,0.3);
  border: 3px solid white;
  transition: all 0.2s ease;
}

.ios-slider::-webkit-slider-thumb:hover { 
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(74,144,226,0.4);
}

/* 快速操作区 */
.quick-actions { 
  display: grid; 
  grid-template-columns: repeat(3, 1fr); 
  gap: 32px;
}

.theme-switcher,
.font-control,
.mode-switcher {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: inherit;
}

.theme-options {
  display: flex;
  gap: 12px;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 12px;
  transition: all 0.2s ease;
}

.theme-option:hover {
  background: rgba(128,128,128,0.1);
}

.theme-option.active {
  background: rgba(74,144,226,0.1);
}

.theme-preview {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.theme-option.active .theme-preview {
  border-color: #4a90e2;
  transform: scale(1.1);
}

.theme-name {
  font-size: 11px;
  opacity: 0.8;
  color: inherit;
}

.font-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(128,128,128,0.1);
  border-radius: 12px;
  padding: 8px;
}

.font-stepper button {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  color: inherit;
  font-size: 18px;
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.font-stepper button:hover {
  background: rgba(128,128,128,0.2);
}

.font-stepper button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.font-stepper button:disabled:hover {
  background: none;
}

.font-size-display {
  font-size: 14px;
  font-weight: 600;
  min-width: 50px;
  text-align: center;
}

.mode-options {
  display: flex;
  gap: 8px;
}

.mode-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: rgba(128,128,128,0.1);
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 12px 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-option:hover {
  background: rgba(128,128,128,0.15);
  transform: translateY(-2px);
}

.mode-option.active {
  background: rgba(74,144,226,0.1);
  border-color: #4a90e2;
  color: #4a90e2;
}

.mode-option i {
  font-size: 20px;
  margin-bottom: 4px;
}

.mode-option span {
  font-size: 12px;
  font-weight: 500;
}

/* 侧边栏系统 */
.sidebar-system {
  position: fixed; 
  top: 0; 
  right: 0; 
  bottom: 0; 
  width: 360px;
  background: var(--glass); 
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  z-index: 2000; 
  box-shadow: -10px 0 40px rgba(0,0,0,0.15);
  display: flex; 
  flex-direction: column;
  border-left: 1px solid var(--glass-border);
}

.sidebar-header { 
  padding: 24px; 
  border-bottom: 1px solid rgba(128,128,128,0.1); 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
}

.sidebar-header h3 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.close-x {
  background: none;
  border: none;
  font-size: 28px;
  color: inherit;
  cursor: pointer;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.close-x:hover {
  background: rgba(128,128,128,0.1);
}

.sidebar-scroll-area { 
  flex: 1; 
  overflow-y: auto; 
  padding: 20px; 
  scroll-behavior: smooth;
}

/* 搜索面板 */
.search-input-box { 
  display: flex; 
  gap: 10px; 
  margin-bottom: 20px; 
}

.search-input-box input { 
  flex: 1; 
  background: rgba(128,128,128,0.1); 
  border: 1px solid rgba(128,128,128,0.2);
  padding: 12px 16px; 
  border-radius: 12px; 
  color: inherit; 
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.search-input-box input:focus {
  border-color: #4a90e2;
  background: rgba(74,144,226,0.05);
}

.search-input-box button { 
  background: #4a90e2;
  color: white;
  border: none;
  padding: 0 20px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.search-input-box button:hover:not(:disabled) {
  background: #3a80d2;
  transform: translateY(-1px);
}

.search-input-box button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-filters {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(128,128,128,0.1);
}

.filter-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  opacity: 0.8;
  cursor: pointer;
}

.filter-option input {
  width: 16px;
  height: 16px;
}

.results-count {
  font-size: 12px;
  opacity: 0.6;
  margin-bottom: 12px;
  padding-left: 4px;
}

.search-item { 
  padding: 16px; 
  border-radius: 12px;
  cursor: pointer; 
  font-size: 14px; 
  margin-bottom: 8px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.search-item:hover { 
  background: rgba(128,128,128,0.1);
  border-color: rgba(128,128,128,0.2);
  transform: translateX(4px);
}

.result-chapter {
  font-size: 12px;
  font-weight: 600;
  color: #4a90e2;
  margin-bottom: 8px;
}

.search-item p {
  margin: 8px 0;
  line-height: 1.6;
}

.search-item mark { 
  background: #ffeb3b; 
  color: #000; 
  padding: 1px 4px;
  border-radius: 3px;
}

.result-meta {
  font-size: 11px;
  opacity: 0.6;
  margin-top: 8px;
}

.empty-tip {
  text-align: center;
  padding: 40px 20px;
  opacity: 0.5;
}

.empty-tip i {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-tip p {
  margin: 8px 0;
}

.empty-tip-sub {
  font-size: 12px;
  opacity: 0.7;
}

/* 目录面板 */
.toc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(128,128,128,0.1);
}

.toc-header h4 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.toc-count {
  font-size: 12px;
  opacity: 0.6;
  background: rgba(128,128,128,0.1);
  padding: 4px 8px;
  border-radius: 10px;
}

.toc-scroll-container {
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

.toc-node { 
  padding: 16px; 
  border-radius: 12px; 
  cursor: pointer; 
  margin-bottom: 4px; 
  transition: 0.2s; 
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid transparent;
}

.toc-node:hover { 
  background: rgba(128,128,128,0.1);
  border-color: rgba(128,128,128,0.1);
}

.toc-node.active { 
  color: #4a90e2; 
  font-weight: 700; 
  background: rgba(74,144,226,0.1);
  border-color: rgba(74,144,226,0.2);
}

.toc-node.read {
  opacity: 0.7;
}

.toc-node-content {
  flex: 1;
}

.toc-node-title {
  font-size: 14px;
  margin-bottom: 4px;
}

.toc-node-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  opacity: 0.6;
}

.toc-node-indicator {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a90e2;
  opacity: 0.6;
}

.toc-node-indicator .icon-check {
  color: #4a90e2;
  font-size: 14px;
}

/* 设置面板 */
.panel-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-group {
  background: rgba(128,128,128,0.05);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid rgba(128,128,128,0.1);
}

.settings-group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.settings-group-header label {
  font-size: 14px;
  font-weight: 600;
  color: inherit;
}

.settings-value {
  font-size: 14px;
  color: #4a90e2;
  font-weight: 600;
}

.theme-dark .settings-value {
  color: #5b9bd5;
}

.settings-slider {
  width: 100%;
  height: 6px;
  appearance: none;
  background: rgba(128,128,128,0.2);
  border-radius: 3px;
  outline: none;
}

.settings-slider::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #4a90e2;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(74,144,226,0.3);
  border: 3px solid white;
}

.settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid rgba(128,128,128,0.1);
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-row span {
  font-size: 14px;
  color: inherit;
}

.segment-ctrl {
  display: flex;
  gap: 8px;
  background: rgba(128,128,128,0.1);
  border-radius: 10px;
  padding: 4px;
}

.segment-ctrl button {
  padding: 8px 16px;
  border: none;
  background: none;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  min-width: 60px;
}

.segment-ctrl button:hover {
  background: rgba(128,128,128,0.2);
}

.segment-ctrl button.active {
  background: #4a90e2;
  color: white;
  font-weight: 600;
}

.settings-toggle {
  padding: 12px 0;
  border-bottom: 1px solid rgba(128,128,128,0.1);
}

.settings-toggle:last-child {
  border-bottom: none;
}

.settings-toggle label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-size: 14px;
  color: inherit;
}

.settings-toggle input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.settings-toggle input[type="time"] {
  background: rgba(128,128,128,0.1);
  border: 1px solid rgba(128,128,128,0.2);
  border-radius: 8px;
  padding: 8px 12px;
  color: inherit;
  font-size: 14px;
  outline: none;
}

.btn-settings {
  width: 100%;
  padding: 14px;
  background: rgba(128,128,128,0.1);
  border: 1px solid rgba(128,128,128,0.2);
  border-radius: 12px;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.2s ease;
  margin-bottom: 8px;
}

.btn-settings:last-child {
  margin-bottom: 0;
}

.btn-settings:hover {
  background: rgba(128,128,128,0.15);
  transform: translateY(-2px);
}

.btn-settings i {
  font-size: 16px;
}

/* 加载动画 */
.global-loader { 
  position: absolute; 
  inset: 0; 
  background: inherit; 
  z-index: 5000; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
}

.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.pulse-ring { 
  width: 60px; 
  height: 60px; 
  border: 3px solid #4a90e2; 
  border-radius: 50%; 
  animation: pulse 1.5s infinite; 
}

@keyframes pulse { 
  0% { transform: scale(0.8); opacity: 0.5; } 
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.8); opacity: 0.5; } 
}

.global-loader p {
  font-size: 14px;
  opacity: 0.8;
  letter-spacing: 1px;
}

/* 动画系统 */
.fade-enter-active, .fade-leave-active,
.slide-down-enter-active, .slide-down-leave-active,
.slide-up-enter-active, .slide-up-leave-active,
.drawer-right-enter-active, .drawer-right-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-down-enter-from { transform: translateY(-100%); }
.slide-down-leave-to { transform: translateY(-100%); }

.slide-up-enter-from { transform: translateY(100%); }
.slide-up-leave-to { transform: translateY(100%); }

.drawer-right-enter-from { transform: translateX(100%); }
.drawer-right-leave-to { transform: translateX(100%); }

/* 亮度遮罩层 */
.brightness-overlay { 
  position: fixed; 
  inset: 0; 
  background: #000; 
  pointer-events: none; 
  z-index: 10000; 
}

/* 响应式设计 */
@media (max-width: 768px) {
  .top-bar {
    height: 60px;
    padding: 0 16px;
  }
  
  .bottom-bar {
    padding: 20px;
  }
  
  .sidebar-system {
    width: 100%;
  }
  
  .quick-actions {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  
  .book-title {
    font-size: 14px;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .floating-actions {
    bottom: 80px;
    right: 16px;
  }
  
  .fab {
    width: 48px;
    height: 48px;
    font-size: 20px;
  }
}

@media (max-width: 480px) {
  .top-bar .book-meta {
    display: none;
  }
  
  .interaction-layer .hotspot {
    width: 33.33%;
  }
  
  .persistent-info {
    left: 10px;
    bottom: 10px;
  }
}

/* 暗色主题优化 */
.theme-dark {
  --glass: rgba(26,26,26,0.95);
}

.theme-dark .glass-bar {
  border-color: rgba(255,255,255,0.1);
}

.theme-dark .settings-group {
  background: rgba(255,255,255,0.05);
}

.theme-dark .segment-ctrl {
  background: rgba(255,255,255,0.1);
}

/* 滚动条美化 */
.sidebar-scroll-area::-webkit-scrollbar,
.toc-scroll-container::-webkit-scrollbar {
  width: 6px;
}

.sidebar-scroll-area::-webkit-scrollbar-track,
.toc-scroll-container::-webkit-scrollbar-track {
  background: rgba(128,128,128,0.1);
  border-radius: 3px;
}

.sidebar-scroll-area::-webkit-scrollbar-thumb,
.toc-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(128,128,128,0.3);
  border-radius: 3px;
}

.sidebar-scroll-area::-webkit-scrollbar-thumb:hover,
.toc-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(128,128,128,0.5);
}

/* 图标字体（示例） */
.icon {
  font-family: 'ReaderIcons', sans-serif;
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.icon-search::before { content: '🔍'; }
.icon-toc::before { content: '📑'; }
.icon-settings::before { content: '⚙️'; }
.icon-bookmark::before { content: '🔖'; }
.icon-bookmark-filled::before { content: '📌'; }
.icon-note::before { content: '📝'; }
.icon-translate::before { content: '🌐'; }
.icon-close::before { content: '✕'; }
.icon-font-smaller::before { content: 'A-'; }
.icon-font-larger::before { content: 'A+'; }
.icon-page-mode::before { content: '📄'; }
.icon-scroll-mode::before { content: '📜'; }
.icon-search-empty::before { content: '🔍'; }
.icon-check::before { content: '✓'; }
.icon-export::before { content: '📤'; }
.icon-clear::before { content: '🗑️'; }
.icon-scroll-hint::before { content: '👇'; }
</style>