<template>
  <div class="home">
    <!-- 顶部导航栏 -->
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <span class="logo-icon">📚</span>
          <h1 class="logo-text">Neat Reader</h1>
        </div>
      </div>
      <div class="header-center">
        <!-- 搜索框 -->
        <div class="search-container">
          <div class="search-box">
            <input 
              type="text" 
              v-model="searchKeyword" 
              placeholder="输入书名、作者" 
              class="search-input"
              @keyup.enter="performSearch"
            />
            <button class="search-btn" @click="performSearch">
              <Icons.Search :size="18" />
            </button>
          </div>
        </div>
      </div>
      <div class="header-right">
      </div>
    </header>

    <!-- 主要内容区 -->
    <main class="main">
      <div class="content-wrapper">
        <!-- 左侧边栏：分类导航 -->
        <aside class="sidebar">
          <div class="sidebar-section">
            <h3 class="sidebar-title">书架</h3>
            <div class="category-list">
              <button 
                class="category-item" 
                :class="{ 'active': selectedCategory === 'all' }"
                @click="selectedCategory = 'all'"
              >
                <span class="category-icon">
                  <Icons.Library :size="20" />
                </span>
                <span class="category-name">全部书籍</span>
                <span class="category-count">{{ books.length }}</span>
              </button>
              <button 
                v-for="category in categories" 
                :key="category.id"
                class="category-item"
                :class="{ 'active': selectedCategory === category.id }"
                :style="{ '--category-color': category.color }"
                @click="selectedCategory = category.id"
              >
                <span class="category-icon" :style="{ backgroundColor: category.color + '20', color: category.color }">
                  <component :is="getCategoryIcon(category.name)" :size="20" />
                </span>
                <span class="category-name">{{ category.name }}</span>
                <span class="category-count">{{ getBooksByCategory(category.id).length }}</span>
              </button>
              <button class="category-item add-category" @click="showAddCategoryDialog">
                <span class="category-icon add-icon">
                  <Icons.Plus :size="20" />
                </span>
                <span class="category-name">新建分类</span>
              </button>
            </div>
          </div>
          
          <div class="sidebar-section">
            <h3 class="sidebar-title">快捷操作</h3>
            <div class="quick-actions">
              <button class="quick-action-btn" @click="triggerFileImport">
                <Icons.FolderPlus :size="20" class="quick-action-icon" />
                <span class="quick-action-text">添加书籍</span>
              </button>
              <button class="quick-action-btn" @click="performSearch">
                <Icons.Search :size="20" class="quick-action-icon" />
                <span class="quick-action-text">搜索书籍</span>
              </button>
            </div>
          </div>

          <!-- 设置和账户部分 -->
          <div class="sidebar-section settings-section">
            <div class="account-info" v-if="isBaidupanAuthorized">
              <div class="account-avatar">
                <Icons.UserCheck :size="32" />
              </div>
              <div class="account-details">
                <div class="account-name">百度网盘已授权</div>
                <div class="account-status">已连接</div>
              </div>
            </div>
            <div class="account-info" v-else>
              <div class="account-avatar">
                <Icons.UserX :size="32" />
              </div>
              <div class="account-details">
                <div class="account-name">未授权</div>
                <div class="account-status">点击设置授权</div>
              </div>
            </div>
            <button class="settings-btn" @click="goToSettings">
              <span class="settings-icon">
                <Icons.Settings :size="16" />
              </span>
              <span class="settings-text">设置</span>
            </button>
          </div>
        </aside>

        <!-- 右侧内容区：书籍列表 -->
        <section class="content">
          <!-- 内容头部 -->
          <div class="content-header">
            <div class="section-info">
              <h2 class="section-title">
                {{ selectedCategory === 'all' ? '我的书架' : getCategoryName(selectedCategory) }}
              </h2>
              <p class="section-subtitle">
                {{ selectedCategory === 'all' ? `共 ${books.length} 本书籍` : `共 ${getBooksByCategory(selectedCategory).length} 本` }}
              </p>
            </div>
            <div class="view-controls">
              <button 
                class="view-btn" 
                :class="{ 'active': viewMode === 'grid' }"
                @click="viewMode = 'grid'"
              >
                <Icons.LayoutGrid :size="16" />
                网格
              </button>
              <button 
                class="view-btn" 
                :class="{ 'active': viewMode === 'list' }"
                @click="viewMode = 'list'"
              >
                <Icons.List :size="16" />
                列表
              </button>
            </div>
          </div>

          <!-- 搜索结果提示 -->
          <div v-if="isSearching" class="search-loading">
            <div class="loading-spinner"></div>
            <p>正在搜索...</p>
          </div>

          <div v-else-if="searchResults.length > 0 && searchKeyword" class="search-results-info">
            <div class="search-info-content">
              <Icons.SearchCheck :size="24" class="search-info-icon" />
              <div class="search-info-text">
                <h3>搜索结果</h3>
                <p>找到 {{ searchResults.length }} 个结果，关键词: {{ searchKeyword }}</p>
              </div>
              <button class="clear-search-btn" @click="clearSearch">
                <Icons.X :size="16" />
              </button>
            </div>
          </div>

          <!-- 电子书列表 -->
          <div :class="viewMode === 'grid' ? 'books-grid' : 'books-list'">
            <div 
              v-for="book in displayBooks" 
              :key="book.id" 
              class="book-card"
              :class="{ 'has-progress': book.readingProgress > 0 }"
              @click="goToReader(book.id)"
              @contextmenu.prevent="showContextMenu($event, book)"
            >
              <!-- 书籍封面 -->
              <div class="book-cover-container">
                <div class="book-cover" :style="{ backgroundImage: book.cover ? `url(${book.cover})` : 'none' }">
                  <div v-if="!book.cover" class="book-cover-placeholder">
                    <span class="placeholder-icon">📚</span>
                    <span class="placeholder-text">{{ book.title.charAt(0) }}</span>
                  </div>
                  <div class="book-cover-overlay">
                    <div class="book-actions">
                      <button class="book-action-btn" @click.stop="handleUploadToBaidupan(book)">
                        <Icons.UploadCloud :size="16" />
                      </button>
                      <button class="book-action-btn" @click.stop="handleRemoveBook(book)">
                        <Icons.Trash2 :size="16" />
                      </button>
                    </div>
                  </div>
                  <div class="book-format-badge">{{ book.format.toUpperCase() }}</div>
                  <div class="book-storage-badge">
                    {{ book.storageType === 'local' ? '💻' : '☁️' }}
                  </div>
                </div>
              </div>
              
              <!-- 书籍信息 -->
              <div class="book-info">
                <h3 class="book-title">{{ book.title }}</h3>
                <p class="book-author">{{ book.author || '未知作者' }}</p>
                
                <!-- 阅读进度 -->
                <div v-if="book.readingProgress > 0" class="book-progress">
                  <div class="progress-bar-container">
                    <div class="progress-bar" :style="{ width: `${book.readingProgress}%` }"></div>
                  </div>
                  <span class="progress-text">{{ book.readingProgress }}%</span>
                </div>
                
                <!-- 其他信息 -->
                <div class="book-meta">
                  <span class="book-last-read">{{ formatDate(book.lastRead) }}</span>
                  <span v-if="book.categoryId" class="book-category" :style="{ backgroundColor: getCategoryColor(book.categoryId) + '20', color: getCategoryColor(book.categoryId) }">
                    {{ getCategoryName(book.categoryId) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="displayBooks.length === 0 && !isSearching" class="empty-state">
            <Icons.BookOpen :size="64" class="empty-icon" />
            <h3>{{ selectedCategory === 'all' ? '书架是空的' : '该分类下没有书籍' }}</h3>
            <p>{{ selectedCategory === 'all' ? '添加一些电子书开始阅读吧' : '点击左侧添加书籍' }}</p>
            <button class="btn btn-primary add-books-btn" @click="triggerFileImport">
              <Icons.Upload :size="16" />
              添加书籍
            </button>
          </div>

          <!-- 搜索无结果状态 -->
          <div v-if="searchResults.length === 0 && searchKeyword && !isSearching" class="empty-state">
            <Icons.SearchX :size="64" class="empty-icon" />
            <h3>没有找到匹配的书籍</h3>
            <p>尝试其他关键词或检查拼写</p>
            <button class="btn btn-secondary" @click="clearSearch">
              <Icons.X :size="16" />
              清除搜索
            </button>
          </div>
        </section>
      </div>
    </main>

    <!-- 底部添加按钮 -->
    <button class="floating-add-btn" @click="triggerFileImport">
      <Icons.Plus :size="24" />
    </button>
    
    <!-- 隐藏的文件输入框 -->
    <input 
      type="file" 
      ref="fileInputRef"
      @change="handleFileSelect"
      style="display: none"
      accept=".epub,.pdf,.txt"
    />

    <!-- 右键菜单 -->
    <div 
      v-if="showMenu" 
      class="context-menu"
      :style="{ left: menuX + 'px', top: menuY + 'px' }"
      @contextmenu.prevent
    >
      <div class="menu-item" @click="handleUploadToBaidupan(selectedBook)">
        <Icons.UploadCloud :size="18" class="menu-icon" />
        <span class="menu-text">上传到百度网盘</span>
      </div>
      <div class="menu-item" @click="openCategoryMenu">
        <Icons.Folder :size="18" class="menu-icon" />
        <span class="menu-text">分类管理</span>
      </div>
      <div class="menu-item danger" @click="handleRemoveBook(selectedBook)">
        <Icons.Trash2 :size="18" class="menu-icon" />
        <span class="menu-text">删除书籍</span>
      </div>
    </div>

    <!-- 分类管理子菜单 -->
    <div 
      v-if="isCategoryMenuVisible"
      class="context-menu category-submenu"
      :style="{ left: subMenuX + 'px', top: subMenuY + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <div 
        v-for="category in categories" 
        :key="category.id"
        class="menu-item"
        @click="handleMoveToCategory(category.id)"
      >
        <span class="menu-icon" :style="{ color: category.color }">
          <component :is="getCategoryEmoji(category.name)" :size="18" />
        </span>
        <span class="menu-text">{{ category.name }}</span>
      </div>
      <div class="menu-item add-category" @click.stop="showAddCategoryDialog">
        <span class="menu-icon">
          <Icons.Plus :size="18" />
        </span>
        <span class="menu-text">新建分类</span>
      </div>
    </div>

    <!-- 添加分类对话框 -->
    <div v-if="showAddCategory" class="dialog-overlay" @click="closeAddCategoryDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h3 class="dialog-title">新建分类</h3>
          <button class="dialog-close" @click="closeAddCategoryDialog">
            <Icons.X :size="20" />
          </button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label class="form-label">分类名称</label>
            <input 
              type="text" 
              v-model="newCategoryName" 
              placeholder="输入分类名称"
              class="form-input"
              @keyup.enter="addCategory"
            />
          </div>
          <div class="form-group">
            <label class="form-label">分类颜色</label>
            <div class="color-picker-container">
              <input 
                type="color" 
                v-model="newCategoryColor" 
                class="color-picker"
              />
              <span class="color-preview" :style="{ backgroundColor: newCategoryColor }"></span>
              <span class="color-value">{{ newCategoryColor }}</span>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-secondary" @click="closeAddCategoryDialog">取消</button>
          <button class="btn btn-primary" @click="addCategory" :disabled="!newCategoryName.trim()">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { useEbookStore } from '../../stores/ebook'
import { useDialogStore } from '../../stores/dialog'
import * as Icons from 'lucide-vue-next'

// 初始化路由和状态管理
const router = useRouter()
const ebookStore = useEbookStore()
const dialogStore = useDialogStore()

// 响应式数据
const viewMode = ref<'grid' | 'list'>('grid')
const fileInputRef = ref<HTMLInputElement | null>(null)
const searchKeyword = ref('')
const selectedCategory = ref('all')

// 右键菜单相关
const showMenu = ref(false)
const isCategoryMenuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const subMenuX = ref(0)
const subMenuY = ref(0)
const selectedBook = ref<any>(null)

// 分类对话框相关
const showAddCategory = ref(false)
const newCategoryName = ref('')
const newCategoryColor = ref('#4A90E2')

// 搜索相关
const searchResults = ref<any[]>([])
const isSearching = ref(false)

// 百度网盘授权状态
const isBaidupanAuthorized = computed(() => {
  return ebookStore.isBaidupanTokenValid()
})

// 跳转到设置页面
const goToSettings = () => {
  router.push('/settings')
}

// 计算属性：显示所有书籍（本地和百度网盘）
const books = computed(() => {
  return ebookStore.books
})

// 计算属性：分类列表
const categories = computed(() => {
  return ebookStore.categories || []
})

// 计算属性：根据分类筛选书籍
const filteredBooks = computed(() => {
  if (selectedCategory.value === 'all') {
    return books.value
  } else {
    return books.value.filter(book => book.categoryId === selectedCategory.value)
  }
})

// 计算属性：显示的书籍
const displayBooks = computed(() => {
  if (searchKeyword.value && searchResults.value.length > 0) {
    return searchResults.value
  }
  return filteredBooks.value
})

// 优化：缓存常用计算结果
interface CachedResults {
  categoryBooks: Record<string, any[]>;
  categoryNames: Record<string, string>;
  categoryColors: Record<string, string>;
}

const cachedResults = ref<CachedResults>({
  categoryBooks: {},
  categoryNames: {},
  categoryColors: {}
})

// 方法
const goToReader = (bookId: string) => {
  router.push(`/reader/${bookId}`)
}

// 触发文件选择
const triggerFileImport = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// 处理文件选择
const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  // 检查文件扩展名
  const fileExt = file.name.toLowerCase().split('.').pop()
  if (!['epub', 'pdf', 'txt'].includes(fileExt || '')) {
    dialogStore.showErrorDialog('不支持的文件格式', '仅支持 EPUB、PDF 和 TXT 格式的电子书')
    return
  }
  
  try {
    // 显示导入进度
    dialogStore.showDialog({
      title: '正在导入',
      message: `正在导入 ${file.name} ...`,
      type: 'info',
      buttons: []
    })
    
    // 导入文件
    const result = await ebookStore.importEbookFile(file)
    
    if (result) {
      dialogStore.closeDialog()
      dialogStore.showSuccessDialog('导入成功')
    } else {
      dialogStore.closeDialog()
      dialogStore.showErrorDialog('导入失败', '无法导入所选文件')
    }
  } catch (error) {
    dialogStore.closeDialog()
    console.error('导入文件失败:', error)
    dialogStore.showErrorDialog('导入失败', error instanceof Error ? error.message : String(error))
  } finally {
    // 清空文件输入框
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
}

const formatDate = (timestamp: number) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm')
}

// 显示右键菜单
const showContextMenu = (event: MouseEvent, book: any) => {
  event.preventDefault()
  showMenu.value = true
  isCategoryMenuVisible.value = false
  menuX.value = event.clientX
  menuY.value = event.clientY
  selectedBook.value = book
  
  // 点击其他区域关闭菜单
  document.addEventListener('click', closeContextMenu)
}

// 关闭右键菜单
const closeContextMenu = () => {
  showMenu.value = false
  isCategoryMenuVisible.value = false
  selectedBook.value = null
  document.removeEventListener('click', closeContextMenu)
}

// 处理上传到百度网盘
const handleUploadToBaidupan = async (book: any) => {
  if (!book) return
  const targetBook = book
  closeContextMenu()
  await uploadToBaidupan(targetBook)
}

// 处理删除书籍
const handleRemoveBook = (book: any) => {
  if (!book) return
  const targetBook = book
  closeContextMenu()
  removeBook(targetBook)
}

// 上传到百度网盘
const uploadToBaidupan = async (book: any) => {
  if (!book) return
  
  try {
    const result = await ebookStore.uploadLocalBookToBaidupan(book)
    if (result) {
      dialogStore.showSuccessDialog('上传到百度网盘成功')
    } else {
      dialogStore.showErrorDialog('上传到百度网盘失败', '请检查网络连接或授权状态')
    }
  } catch (error) {
    console.error('上传到百度网盘失败:', error)
    dialogStore.showErrorDialog('上传到百度网盘失败', error instanceof Error ? error.message : String(error))
  } finally {
    closeContextMenu()
  }
}

// 删除书籍
const removeBook = async (book: any) => {
  if (!book) return;
  
  // 立即将需要删除的对象锁定在局部变量中，防止被 closeContextMenu 影响
  const targetBookId = book.id;
  const targetTitle = book.title;
  const targetStorage = book.storageType;

  dialogStore.showDialog({
    title: '确认删除',
    message: `确定要删除《${targetTitle}》吗？`,
    type: 'warning',
    buttons: [
      { text: '取消' },
      { 
        text: '删除', 
        primary: true,
        callback: async () => {
          console.log('开始执行删除逻辑, ID:', targetBookId);
          try {
            const result = await ebookStore.removeBook(targetBookId, targetStorage);
            if (result) {
              dialogStore.showSuccessDialog('书籍删除成功');
            } else {
              dialogStore.showErrorDialog('删除失败', '无法删除指定书籍');
            }
          } catch (error) {
            console.error('删除过程报错:', error);
            dialogStore.showErrorDialog('删除失败', error instanceof Error ? error.message : String(error));
          }
        }
      }
    ]
  })
  
  closeContextMenu(); // 这里虽然清空了 selectedBook，但上面的局部变量已锁定数据
}

// 显示分类管理菜单
const openCategoryMenu = () => {
  console.log('打开分类管理菜单')
  console.log('主菜单位置:', menuX.value, menuY.value)
  
  // 设置子菜单位置在主菜单右侧
  subMenuX.value = menuX.value + 180 // 180 是菜单宽度
  subMenuY.value = menuY.value
  
  // 检查是否超出屏幕右侧
  if (subMenuX.value + 180 > window.innerWidth) {
    // 如果右侧空间不足，显示在主菜单左侧
    subMenuX.value = menuX.value - 180
  }
  
  console.log('子菜单位置:', subMenuX.value, subMenuY.value)
  
  // 关闭主菜单，显示子菜单
  showMenu.value = false
  
  // 移除点击外部关闭菜单的监听器，因为子菜单需要单独处理
  document.removeEventListener('click', closeContextMenu)
  
  // 使用 setTimeout 避免事件冲突
  setTimeout(() => {
    isCategoryMenuVisible.value = true
    console.log('子菜单已显示')
    
    // 为子菜单添加点击外部关闭的监听器
    setTimeout(() => {
      document.addEventListener('click', closeSubMenuContextMenu)
    }, 100)
  }, 50)
}

// 关闭子菜单的上下文菜单
const closeSubMenuContextMenu = (event: MouseEvent) => {
  const subMenu = document.querySelector('.category-submenu')
  if (subMenu && !subMenu.contains(event.target as Node)) {
    closeContextMenu()
  }
}

// 移动书籍到分类
const handleMoveToCategory = async (categoryId: string) => {
  if (!selectedBook.value) {
    console.error('selectedBook 为 null，无法移动书籍')
    return
  }
  
  const book = selectedBook.value
  console.log('移动书籍到分类:', book.title, '->', categoryId)
  console.log('selectedBook:', selectedBook.value)
  
  try {
    console.log('调用 ebookStore.addBookToCategory')
    const result = await ebookStore.addBookToCategory(book.id, categoryId)
    console.log('addBookToCategory 返回结果:', result)
    
    if (result) {
      dialogStore.showSuccessDialog('书籍分类更新成功')
      closeContextMenu()
      console.log('书籍分类更新成功，菜单已关闭')
    } else {
      dialogStore.showErrorDialog('分类更新失败', '无法找到指定书籍或分类')
      closeContextMenu()
      console.log('书籍分类更新失败，菜单已关闭')
    }
  } catch (error) {
    console.error('移动书籍到分类失败:', error)
    dialogStore.showErrorDialog('分类更新失败', error instanceof Error ? error.message : String(error))
    closeContextMenu()
  }
}

// 显示添加分类对话框
const showAddCategoryDialog = () => {
  showAddCategory.value = true
  newCategoryName.value = ''
  newCategoryColor.value = '#4A90E2'
  closeContextMenu()
}

// 关闭添加分类对话框
const closeAddCategoryDialog = () => {
  showAddCategory.value = false
  newCategoryName.value = ''
}

// 添加分类
const addCategory = async () => {
  if (!newCategoryName.value.trim()) return
  
  console.log('开始创建分类，名称:', newCategoryName.value.trim(), '颜色:', newCategoryColor.value);
  
  try {
    const result = await ebookStore.addCategory(newCategoryName.value.trim(), newCategoryColor.value)
    console.log('分类创建成功，返回结果:', result);
    
    // 等待一下确保数据已保存
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 验证分类是否真的保存了
    console.log('当前分类列表:', ebookStore.categories);
    console.log('分类数量:', ebookStore.categories.length);
    
    dialogStore.showSuccessDialog('分类创建成功')
    closeAddCategoryDialog()
  } catch (error) {
    console.error('添加分类失败:', error)
    dialogStore.showErrorDialog('分类创建失败', error instanceof Error ? error.message : String(error))
  }
}

// 执行搜索
const performSearch = async () => {
  if (!searchKeyword.value.trim()) {
    clearSearch()
    return
  }
  
  isSearching.value = true
  try {
    const results = await ebookStore.searchBooks(searchKeyword.value.trim())
    searchResults.value = results
  } catch (error) {
    console.error('搜索失败:', error)
    dialogStore.showErrorDialog('搜索失败', error instanceof Error ? error.message : String(error))
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

// 清除搜索
const clearSearch = () => {
  searchKeyword.value = ''
  searchResults.value = []
}

// 获取分类名称
const getCategoryName = (categoryId: string) => {
  // 检查缓存
  if (cachedResults.value.categoryNames[categoryId]) {
    return cachedResults.value.categoryNames[categoryId]
  }
  
  const category = ebookStore.categories.find(cat => cat.id === categoryId)
  const name = category ? category.name : '未分类'
  
  // 缓存结果
  cachedResults.value.categoryNames[categoryId] = name
  return name
}

// 获取分类颜色
const getCategoryColor = (categoryId: string) => {
  // 检查缓存
  if (cachedResults.value.categoryColors[categoryId]) {
    return cachedResults.value.categoryColors[categoryId]
  }
  
  const category = ebookStore.categories.find(cat => cat.id === categoryId)
  const color = category ? category.color : '#4A90E2'
  
  // 缓存结果
  cachedResults.value.categoryColors[categoryId] = color
  return color
}

// 获取分类对应的图标
const getCategoryIcon = (categoryName: string) => {
  const iconMap: Record<string, any> = {
    '技术': Icons.Cpu,
    '小说': Icons.BookOpen,
    '历史': Icons.Scroll,
    '哲学': Icons.Brain,
    '科学': Icons.FlaskConical,
    '艺术': Icons.Palette,
    '健康': Icons.HeartPulse,
    '经济': Icons.Banknote,
    '军事': Icons.Shield,
    '心理': Icons.BrainCircuit,
    '教育': Icons.GraduationCap,
    '计算机': Icons.Laptop,
    '编程': Icons.Code2,
    '医学': Icons.Stethoscope,
    '烹饪': Icons.ChefHat,
    '旅行': Icons.Plane,
    '体育': Icons.Trophy,
    '音乐': Icons.Music,
    '电影': Icons.Film,
    '摄影': Icons.Camera,
    '设计': Icons.PenTool,
    '商业': Icons.Briefcase,
    '金融': Icons.PieChart,
    '法律': Icons.Scale,
    '政治': Icons.Landmark,
    '宗教': Icons.Church,
    '文学': Icons.FileText,
    '传记': Icons.User,
    '科幻': Icons.Rocket,
    '奇幻': Icons.Wand2,
    '悬疑': Icons.Search,
    '爱情': Icons.Heart,
    '恐怖': Icons.Ghost,
    '儿童': Icons.Smile,
    '青春': Icons.Flower2,
    '职场': Icons.Users,
    '励志': Icons.Sparkles,
    '经典': Icons.Star,
    '现代': Icons.Building2,
    '古代': Icons.Castle,
    '外国': Icons.Globe,
    '中国': Icons.Flag
  }
  return iconMap[categoryName] || Icons.Folder
}

// 获取分类对应的 emoji
const getCategoryEmoji = (categoryName: string) => {
  return getCategoryIcon(categoryName)
}

// 获取分类下的书籍数量
const getBooksByCategory = (categoryId: string) => {
  // 检查缓存
  if (cachedResults.value.categoryBooks[categoryId]) {
    return cachedResults.value.categoryBooks[categoryId]
  }
  
  const books = ebookStore.books.filter(book => book.categoryId === categoryId)
  
  // 缓存结果
  cachedResults.value.categoryBooks[categoryId] = books
  return books
}

// 监听书籍或分类变化，清除缓存
watch(
  [() => books.value.length, () => categories.value.length],
  () => {
    cachedResults.value = {
      categoryBooks: {},
      categoryNames: {},
      categoryColors: {}
    }
  }
)

// 生命周期钩子
onMounted(async () => {
  try {
    console.log('首页加载，开始初始化电子书存储...');
    // 初始化电子书存储
    await ebookStore.initialize();
    console.log('电子书存储初始化完成');
    console.log('当前书籍数量:', ebookStore.books.length);
    console.log('当前分类数量:', ebookStore.categories.length);
    
    // 初始化深色模式
    initDarkMode();
  } catch (error) {
    console.error('初始化电子书存储失败:', error);
  }
})

// 初始化深色模式
const initDarkMode = () => {
  const theme = ebookStore.userConfig.reader.theme;
  if (theme === 'dark') {
    document.documentElement.classList.add('theme-dark');
  } else {
    document.documentElement.classList.remove('theme-dark');
  }
}

// 监听主题变化
watch(
  () => ebookStore.userConfig.reader.theme,
  (newTheme) => {
    if (newTheme === 'dark') {
      document.documentElement.classList.add('theme-dark');
    } else {
      document.documentElement.classList.remove('theme-dark');
    }
  }
)
</script>

<style scoped>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --primary-color: #4A90E2;
  --secondary-color: #64748b;
  --background-color: #f8fafc;
  --card-background: #ffffff;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --border-color: #e2e8f0;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --danger-color: #ef4444;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  --border-radius-sm: 0.375rem;
  --border-radius-md: 0.5rem;
  --border-radius-lg: 0.75rem;
  --border-radius-xl: 1rem;
  --border-radius-full: 9999px;
  --transition-fast: 0.2s ease;
  --transition-normal: 0.3s ease;
  --transition-slow: 0.5s ease;
  --hover-scale: 1.02;
}

/* 深色模式 */
.theme-dark {
  --background-color: #1F2937;
  --card-background: #374151;
  --text-primary: #F3F4F6;
  --text-secondary: #9CA3AF;
  --border-color: #4B5563;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.4);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.5);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-primary);
  background-color: var(--background-color);
}

/* 主页容器 */
.home {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--background-color);
}

/* 顶部导航栏 */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  background-color: var(--card-background);
  border-bottom: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  z-index: 100;
  height: 72px;
}

.header-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logo-icon {
  font-size: 1.75rem;
}

.logo-text {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary-color);
  margin: 0;
}

.header-center {
  flex: 1;
  max-width: 500px;
  margin: 0 2rem;
}

.search-container {
  position: relative;
}

.search-box {
  display: flex;
  align-items: center;
  background-color: var(--background-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-full);
  padding: 0.5rem 1rem;
  transition: all var(--transition-fast);
}

.search-box:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  padding: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.search-input::placeholder {
  color: var(--text-secondary);
}

.search-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: var(--text-secondary);
  transition: color var(--transition-fast);
}

.search-btn:hover {
  color: var(--primary-color);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* 主要内容区 */
.main {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: stretch;
}

.content-wrapper {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 左侧边栏 */
.sidebar {
  width: 280px;
  background-color: var(--card-background);
  border-right: 1px solid var(--border-color);
  padding: 1.5rem;
  overflow-y: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-section {
  margin-bottom: 2rem;
}

.sidebar-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1rem;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: var(--border-radius-md);
  border: 1px solid transparent;
  background-color: transparent;
  cursor: pointer;
  transition: all var(--transition-normal);
  text-align: left;
  font-size: 0.875rem;
  color: var(--text-primary);
  position: relative;
  overflow: hidden;
}

.category-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(74, 144, 226, 0.1), transparent);
  transition: left var(--transition-slow);
}

.category-item:hover::before {
  left: 100%;
}

.category-item:hover {
  background-color: var(--background-color);
  border-color: var(--border-color);
  transform: translateX(4px);
}

.category-item.active {
  background-color: rgba(74, 144, 226, 0.1);
  border-color: var(--primary-color);
  color: var(--primary-color);
  transform: translateX(4px);
}

.category-item:active {
  transform: translateX(2px) scale(0.98);
  transition: all var(--transition-fast);
}

.category-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--border-radius-sm);
  font-size: 1rem;
  flex-shrink: 0;
}

.category-icon svg {
  width: 20px;
  height: 20px;
}

.category-name {
  flex: 1;
  font-weight: 500;
}

.category-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background-color: var(--background-color);
  padding: 0.125rem 0.5rem;
  border-radius: var(--border-radius-full);
  min-width: 1.5rem;
  text-align: center;
}

.category-item.active .category-count {
  background-color: rgba(74, 144, 226, 0.2);
  color: var(--primary-color);
}

.category-item.add-category {
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
}

.category-item.add-category:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background-color: rgba(74, 144, 226, 0.05);
}

.add-icon {
  background-color: var(--background-color);
  color: var(--text-secondary);
  font-weight: bold;
  font-size: 1.25rem;
}

.category-item.add-category:hover .add-icon {
  background-color: rgba(74, 144, 226, 0.2);
  color: var(--primary-color);
}

/* 快捷操作 */
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.quick-action-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  background-color: var(--card-background);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.quick-action-btn:hover {
  border-color: var(--primary-color);
  background-color: rgba(74, 144, 226, 0.05);
  color: var(--primary-color);
}

.quick-action-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.quick-action-icon svg {
  width: 20px;
  height: 20px;
}

/* 设置和账户部分 */
.settings-section {
  margin-top: auto;
  border-top: 1px solid var(--border-color);
  padding-top: 1.5rem;
}

.account-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1rem;
  background-color: var(--background-color);
  border-radius: var(--border-radius-md);
  transition: all var(--transition-fast);
}

.account-info:hover {
  background-color: rgba(74, 144, 226, 0.05);
}

.account-avatar {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-color), #6366f1);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(74, 144, 226, 0.3);
}

.account-avatar svg {
  width: 24px;
  height: 24px;
  stroke-width: 2;
}

.account-details {
  flex: 1;
  min-width: 0;
}

.account-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-status {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.settings-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  background-color: var(--card-background);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
  font-size: 0.875rem;
  color: var(--text-primary);
  width: 100%;
}

.settings-btn:hover {
  border-color: var(--primary-color);
  background-color: rgba(74, 144, 226, 0.05);
  color: var(--primary-color);
}

.settings-icon {
  flex-shrink: 0;
}

.settings-icon svg {
  width: 16px;
  height: 16px;
}

.settings-text {
  flex: 1;
}

/* 右侧内容区 */
.content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
  background-color: var(--background-color);
}

.content-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.section-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.section-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.section-subtitle {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
}

.view-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  padding: 0.25rem;
}

.view-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.view-btn:hover {
  color: var(--text-primary);
  background-color: var(--background-color);
}

.view-btn.active {
  color: var(--primary-color);
  background-color: rgba(74, 144, 226, 0.1);
}

/* 搜索结果信息 */
.search-results-info {
  margin-bottom: 2rem;
}

.search-info-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  background-color: rgba(74, 144, 226, 0.1);
  border: 1px solid rgba(74, 144, 226, 0.2);
  border-radius: var(--border-radius-lg);
  padding: 1rem 1.5rem;
}

.search-info-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.search-info-text {
  flex: 1;
}

.search-info-text h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.25rem 0;
}

.search-info-text p {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
}

.clear-search-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-full);
  padding: 0.5rem;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.clear-search-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background-color: rgba(74, 144, 226, 0.1);
}

/* 搜索加载状态 */
.search-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  color: var(--text-secondary);
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid var(--border-color);
  border-top: 2px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 书籍网格 */
.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

/* 书籍列表 */
.books-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
}

/* 书籍卡片 */
.book-card {
  background-color: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
  transition: all var(--transition-normal);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-shadow: var(--shadow-sm);
  position: relative;
}

.book-card:hover {
  transform: translateY(-2px) scale(var(--hover-scale));
  box-shadow: var(--shadow-lg);
  border-color: var(--primary-color);
  z-index: 10;
}

.book-card:active {
  transform: translateY(0) scale(0.98);
  transition: all var(--transition-fast);
}

.books-list .book-card {
  flex-direction: row;
  align-items: center;
  padding: 1rem;
  gap: 1rem;
}

.book-cover-container {
  position: relative;
  flex-shrink: 0;
}

.books-grid .book-cover-container {
  width: 100%;
  aspect-ratio: 2/3;
}

.books-list .book-cover-container {
  width: 80px;
  height: 120px;
}

.book-cover {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-color: var(--background-color);
  border-radius: var(--border-radius-md);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.book-cover-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--primary-color)20%, var(--secondary-color)100%);
  color: white;
  text-align: center;
}

.placeholder-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.placeholder-text {
  font-size: 3rem;
  font-weight: bold;
  opacity: 0.8;
}

.book-cover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.book-card:hover .book-cover-overlay {
  opacity: 1;
}

.book-actions {
  display: flex;
  gap: 0.5rem;
}

.book-action-btn {
  background-color: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: var(--border-radius-full);
  padding: 0.5rem;
  cursor: pointer;
  color: var(--text-primary);
  transition: all var(--transition-fast);
}

.book-action-btn:hover {
  background-color: var(--primary-color);
  color: white;
  transform: scale(1.1);
}

.book-format-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: var(--border-radius-sm);
  text-transform: uppercase;
}

.book-storage-badge {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 0.875rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--border-radius-sm);
}

.book-info {
  padding: 1rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.books-list .book-info {
  flex: 1;
  min-width: 0;
}

.book-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  box-orient: vertical;
}

.books-list .book-title {
  font-size: 1rem;
  -webkit-line-clamp: 1;
  line-clamp: 1;
}

.book-author {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.25rem 0;
}

.progress-bar-container {
  flex: 1;
  height: 4px;
  background-color: var(--background-color);
  border-radius: var(--border-radius-full);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background-color: var(--primary-color);
  border-radius: var(--border-radius-full);
  transition: width var(--transition-normal);
}

.progress-text {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 2.5rem;
  text-align: right;
}

.book-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: auto;
  font-size: 0.625rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

.book-last-read {
  flex-shrink: 0;
}

.book-category {
  padding: 0.125rem 0.5rem;
  border-radius: var(--border-radius-full);
  font-size: 0.625rem;
  font-weight: 500;
  flex-shrink: 0;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 6rem 2rem;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1.5rem;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
}

.empty-state p {
  font-size: 1rem;
  margin: 0 0 2rem 0;
  max-width: 400px;
}

.add-books-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* 浮动添加按钮 */
.floating-add-btn {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background-color: var(--primary-color);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-lg);
  transition: all var(--transition-fast);
  z-index: 50;
}

.floating-add-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 12px 20px rgba(74, 144, 226, 0.4);
  background-color: #357ABD;
}

/* 右键菜单 */
.context-menu {
  position: fixed;
  background-color: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  min-width: 200px;
  overflow: hidden;
}

.category-submenu {
  margin-left: 0.25rem;
  border-left: 3px solid var(--primary-color);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: 0.875rem;
  color: var(--text-primary);
}

.menu-item:hover {
  background-color: var(--background-color);
}

.menu-item.danger:hover {
  background-color: rgba(239, 68, 68, 0.1);
  color: var(--danger-color);
}

.menu-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.menu-text {
  flex: 1;
}

.menu-item.add-category {
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.menu-item.add-category:hover {
  color: var(--primary-color);
}

/* 对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog-content {
  background-color: var(--card-background);
  border-radius: var(--border-radius-xl);
  padding: 1.5rem;
  max-width: 450px;
  width: 90%;
  box-shadow: var(--shadow-xl);
  max-height: 90vh;
  overflow-y: auto;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.dialog-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.dialog-close {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  color: var(--text-secondary);
  transition: color var(--transition-fast);
}

.dialog-close:hover {
  color: var(--text-primary);
}

.dialog-body {
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  font-size: 0.875rem;
  color: var(--text-primary);
  transition: all var(--transition-fast);
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
}

.color-picker-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.color-picker {
  width: 3rem;
  height: 3rem;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  cursor: pointer;
  padding: 0;
  background: transparent;
}

.color-preview {
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
}

.color-value {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-family: 'Courier New', monospace;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}

/* 按钮样式 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-radius: var(--border-radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-normal);
  text-decoration: none;
  position: relative;
  overflow: hidden;
}

.btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  transition: left var(--transition-slow);
}

.btn:hover::before {
  left: 100%;
}

.btn:active {
  transform: scale(0.96);
  transition: all var(--transition-fast);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.btn-primary:hover:not(:disabled) {
  background-color: #357ABD;
  border-color: #357ABD;
}

.btn-secondary {
  background-color: var(--background-color);
  color: var(--text-primary);
  border-color: var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background-color: #e2e8f0;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  /* 平板设备 */
  .sidebar {
    width: 240px;
  }
  
  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1.25rem;
  }
  
  .header {
    padding: 1rem 1.5rem;
  }
  
  .content {
    padding: 1.5rem;
  }
}

@media (max-width: 768px) {
  /* 移动端设备 */
  .header {
    padding: 1rem;
    height: auto;
    flex-wrap: wrap;
    gap: 1rem;
  }
  
  .header-center {
    order: 3;
    flex: 1 0 100%;
    margin: 0;
  }
  
  .logo-text {
    font-size: 1.25rem;
  }
  
  .content-wrapper {
    flex-direction: column;
  }
  
  .sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
    padding: 1rem;
    overflow-x: auto;
    white-space: nowrap;
  }
  
  .sidebar-section {
    margin-bottom: 1rem;
  }
  
  .category-list {
    flex-direction: row;
    gap: 0.75rem;
  }
  
  .category-item {
    white-space: nowrap;
    padding: 0.5rem 0.75rem;
  }
  
  .quick-actions {
    flex-direction: row;
  }
  
  .quick-action-btn {
    padding: 0.5rem 0.75rem;
  }
  
  .content {
    padding: 1rem;
  }
  
  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }
  
  .books-list .book-card {
    padding: 0.75rem;
    gap: 0.75rem;
  }
  
  .books-list .book-cover-container {
    width: 60px;
    height: 90px;
  }
  
  .floating-add-btn {
    bottom: 1.5rem;
    right: 1.5rem;
    width: 2.5rem;
    height: 2.5rem;
  }
  
  .section-title {
    font-size: 1.25rem;
  }
  
  .content-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .view-controls {
    align-self: stretch;
    justify-content: space-around;
  }
  
  .search-info-content {
    padding: 0.75rem 1rem;
  }
  
  .book-title {
    font-size: 0.75rem;
  }
  
  .book-author {
    font-size: 0.625rem;
  }
  
  .book-progress {
    margin: 0.125rem 0;
  }
  
  .book-meta {
    font-size: 0.5rem;
  }
}

@media (max-width: 480px) {
  /* 小屏幕移动端 */
  .books-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.75rem;
  }
  
  .book-cover-overlay {
    opacity: 1;
  }
  
  .book-actions {
    position: static;
    margin-top: 0.5rem;
  }
  
  .empty-state {
    padding: 4rem 1rem;
  }
  
  .empty-icon {
    font-size: 3rem;
  }
  
  .empty-state h3 {
    font-size: 1rem;
  }
  
  .empty-state p {
    font-size: 0.875rem;
  }
}
</style>