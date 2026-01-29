<template>
  <div class="home">
    <!-- 顶部导航栏 -->
    <header class="header">
      <h1 class="title">Neat Reader</h1>
      <div class="header-actions">
        <!-- 搜索框 -->
        <div class="search-box">
          <input 
            type="text" 
            v-model="searchKeyword" 
            placeholder="搜索书名、作者"
            class="search-input"
            @keyup.enter="performSearch"
          />
          <button class="search-btn" @click="performSearch">
            🔍
          </button>
        </div>
        <router-link to="/settings" class="btn btn-secondary">
          设置
        </router-link>
      </div>
    </header>

    <!-- 主要内容区 -->
    <main class="main">
      <!-- 分类筛选 -->
      <div class="category-filter">
        <div class="category-tabs">
          <button 
            class="category-tab" 
            :class="{ 'active': selectedCategory === 'all' }"
            @click="selectedCategory = 'all'"
          >
            全部
          </button>
          <button 
            v-for="category in categories" 
            :key="category.id"
            class="category-tab"
            :class="{ 'active': selectedCategory === category.id }"
            :style="{ borderColor: category.color }"
            @click="selectedCategory = category.id"
          >
            {{ category.name }}
            <span class="category-count">({{ getBooksByCategory(category.id).length }})</span>
          </button>
          <button class="category-tab add-category" @click="showAddCategoryDialog">
            + 新建分类
          </button>
        </div>
      </div>

      <!-- 电子书列表 -->
      <div class="books-section">
        <div class="section-header">
          <h2 class="section-title">
            {{ selectedCategory === 'all' ? '我的书架' : getCategoryName(selectedCategory) }}
          </h2>
          <div class="view-controls">
            <button 
              class="btn btn-secondary" 
              @click="viewMode = 'grid'"
              :class="{ 'active': viewMode === 'grid' }"
            >
              网格
            </button>
            <button 
              class="btn btn-secondary" 
              @click="viewMode = 'list'"
              :class="{ 'active': viewMode === 'list' }"
            >
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
          <p>找到 {{ searchResults.length }} 个结果，关键词: {{ searchKeyword }}</p>
          <button class="btn btn-sm" @click="clearSearch">清除搜索</button>
        </div>

        <!-- 电子书列表 -->
        <div :class="viewMode === 'grid' ? 'grid' : 'list'" class="books-list">
          <div 
            v-for="book in displayBooks" 
            :key="book.id" 
            class="book-item" 
            @click="goToReader(book.id)"
            @contextmenu.prevent="showContextMenu($event, book)"
          >
            <div class="book-cover" :style="{ backgroundImage: `url(${book.cover})` }">
              <div class="book-format">{{ book.format.toUpperCase() }}</div>
              <div class="book-storage">{{ book.storageType === 'local' ? '💻' : '☁️' }}</div>
            </div>
            <div class="book-info">
              <h3 class="book-title">{{ book.title }}</h3>
              <p class="book-author">{{ book.author }}</p>
              <div class="book-progress">
                <div class="progress">
                  <div class="progress-bar" :style="{ width: `${book.readingProgress}%` }"></div>
                </div>
                <span class="progress-text">{{ book.readingProgress }}%</span>
              </div>
              <p class="book-last-read">{{ formatDate(book.lastRead) }}</p>
              <div v-if="book.categoryId" class="book-category">
                {{ getCategoryName(book.categoryId) }}
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="displayBooks.length === 0 && !isSearching" class="empty-state">
          <div class="empty-icon">📚</div>
          <h3>{{ selectedCategory === 'all' ? '书架是空的' : '该分类下没有书籍' }}</h3>
          <p>{{ selectedCategory === 'all' ? '添加一些电子书开始阅读吧' : '点击右上角添加书籍' }}</p>
        </div>

        <!-- 搜索无结果状态 -->
        <div v-if="searchResults.length === 0 && searchKeyword && !isSearching" class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>没有找到匹配的书籍</h3>
          <p>尝试其他关键词或检查拼写</p>
          <button class="btn btn-secondary" @click="clearSearch">清除搜索</button>
        </div>
      </div>
    </main>

    <!-- 底部添加按钮 -->
    <button class="add-btn" @click="triggerFileImport">
      +
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
      <div class="menu-item" @click="handleUploadToBaidupan">
        📤 上传到百度网盘
      </div>
      <div class="menu-item" @click="openCategoryMenu">
        📁 分类管理
      </div>
      <div class="menu-item" @click="handleRemoveBook">
        🗑️ 删除书籍
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
        {{ category.name }}
      </div>
      <div class="menu-item add-category" @click.stop="showAddCategoryDialog">
        + 新建分类
      </div>
    </div>

    <!-- 添加分类对话框 -->
    <div v-if="showAddCategory" class="dialog-overlay" @click="closeAddCategoryDialog">
      <div class="dialog-content" @click.stop>
        <h3>新建分类</h3>
        <div class="dialog-form">
          <div class="form-group">
            <label>分类名称</label>
            <input 
              type="text" 
              v-model="newCategoryName" 
              placeholder="输入分类名称"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label>分类颜色</label>
            <input 
              type="color" 
              v-model="newCategoryColor" 
              class="color-picker"
            />
          </div>
        </div>
        <div class="dialog-buttons">
          <button class="btn btn-secondary" @click="closeAddCategoryDialog">取消</button>
          <button class="btn btn-primary" @click="addCategory" :disabled="!newCategoryName.trim()">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { useEbookStore } from '../../stores/ebook'
import { useDialogStore } from '../../stores/dialog'

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
const handleUploadToBaidupan = async () => {
  if (!selectedBook.value) return
  const book = selectedBook.value
  closeContextMenu()
  await uploadToBaidupan(book)
}

// 处理删除书籍
const handleRemoveBook = () => {
  if (!selectedBook.value) return
  const book = selectedBook.value
  closeContextMenu()
  removeBook(book)
}

// 上传到百度网盘
const uploadToBaidupan = async (book: any) => {
  if (!book) return
  
  try {
    // 调用 ebookStore 中的上传方法
    await ebookStore.uploadLocalBookToBaidupan(book)
    dialogStore.showSuccessDialog('上传到百度网盘成功')
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
  const category = ebookStore.categories.find(cat => cat.id === categoryId)
  return category ? category.name : '未分类'
}

// 获取分类下的书籍数量
const getBooksByCategory = (categoryId: string) => {
  return ebookStore.books.filter(book => book.categoryId === categoryId)
}

// 生命周期钩子
onMounted(async () => {
  try {
    console.log('首页加载，开始初始化电子书存储...');
    // 初始化电子书存储
    await ebookStore.initialize();
    console.log('电子书存储初始化完成');
    console.log('当前书籍数量:', ebookStore.books.length);
    console.log('当前分类数量:', ebookStore.categories.length);
  } catch (error) {
    console.error('初始化电子书存储失败:', error);
  }
})
</script>

<style scoped>
.home {
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
  align-items: center;
  gap: 12px;
}

/* 搜索框 */
.search-box {
  display: flex;
  align-items: center;
  background-color: #F5F7FA;
  border-radius: 20px;
  padding: 4px 12px;
  min-width: 200px;
}

.search-input {
  border: none;
  background: transparent;
  outline: none;
  padding: 8px;
  flex: 1;
  font-size: 14px;
}

.search-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 16px;
}

/* 主要内容区 */
.main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* 分类筛选 */
.category-filter {
  max-width: 1200px;
  margin: 0 auto 24px;
  background-color: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.category-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.category-tab {
  background-color: white;
  border: 2px solid #E8E8E8;
  border-radius: 20px;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.category-tab:hover {
  border-color: #4A90E2;
  background-color: #F0F8FF;
}

.category-tab.active {
  background-color: #4A90E2;
  color: white;
  border-color: #4A90E2;
}

.category-count {
  font-size: 12px;
  opacity: 0.8;
}

.category-tab.add-category {
  border: 2px dashed #4A90E2;
  color: #4A90E2;
  background-color: #F0F8FF;
}

.category-tab.add-category:hover {
  background-color: #E6F2FF;
}

/* 书籍区域 */
.books-section {
  max-width: 1200px;
  margin: 0 auto;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-title {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  margin: 0;
}

.view-controls {
  display: flex;
  gap: 8px;
}

.view-controls .btn.active {
  background-color: #4A90E2;
  color: white;
}

/* 搜索结果信息 */
.search-results-info {
  background-color: #F0F8FF;
  border: 1px solid #4A90E2;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-results-info p {
  margin: 0;
  color: #333;
  font-size: 14px;
}

/* 搜索加载状态 */
.search-loading {
  text-align: center;
  padding: 48px 24px;
  color: #666;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #F0F0F0;
  border-top: 4px solid #4A90E2;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 电子书列表 */
.books-list {
  margin-top: 16px;
}

/* 网格视图 */
.grid .book-item {
  background-color: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.grid .book-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.grid .book-cover {
  width: 100%;
  padding-top: 150%; /* 2:3 比例 */
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
}

.grid .book-format {
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.grid .book-storage {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.grid .book-info {
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.grid .book-title {
        font-size: 16px;
        font-weight: bold;
        color: #333;
        margin: 0 0 4px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        display: box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        box-orient: vertical;
      }

.grid .book-author {
  font-size: 14px;
  color: #666;
  margin: 0 0 8px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grid .book-progress {
  margin: 8px 0;
}

.grid .progress-text {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
  display: block;
  text-align: right;
}

.grid .book-last-read {
  font-size: 12px;
  color: #999;
  margin-top: auto;
}

.grid .book-category {
  font-size: 12px;
  color: #4A90E2;
  margin-top: 4px;
  padding: 2px 8px;
  background-color: #F0F8FF;
  border-radius: 10px;
  align-self: flex-start;
}

/* 列表视图 */
.list .book-item {
  display: flex;
  align-items: center;
  background-color: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;
  gap: 16px;
}

.list .book-item:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.list .book-cover {
  width: 80px;
  height: 120px;
  background-size: cover;
  background-position: center;
  border-radius: 8px;
  position: relative;
  flex-shrink: 0;
}

.list .book-format {
  position: absolute;
  top: 4px;
  right: 4px;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
}

.list .book-storage {
  position: absolute;
  bottom: 4px;
  left: 4px;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
}

.list .book-info {
  flex: 1;
  min-width: 0;
}

.list .book-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  margin: 0 0 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list .book-author {
  font-size: 14px;
  color: #666;
  margin: 0 0 8px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list .book-progress {
  margin: 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.list .progress {
  flex: 1;
  margin: 0;
}

.list .progress-text {
  font-size: 14px;
  color: #666;
  margin: 0;
  min-width: 40px;
  text-align: right;
}

.list .book-last-read {
  font-size: 12px;
  color: #999;
  margin: 0;
}

.list .book-category {
  font-size: 12px;
  color: #4A90E2;
  margin-top: 4px;
  padding: 2px 8px;
  background-color: #F0F8FF;
  border-radius: 10px;
  display: inline-block;
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
  margin: 0 0 16px;
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
  background-color: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

.dialog-content h3 {
  margin: 0 0 20px;
  color: #333;
  font-size: 18px;
}

.dialog-form {
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: #666;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 2px solid #E8E8E8;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.form-input:focus {
  border-color: #4A90E2;
}

.color-picker {
  width: 100%;
  height: 40px;
  border: 2px solid #E8E8E8;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
}

.dialog-buttons {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary {
  background-color: #E8E8E8;
  color: #333;
}

.btn-secondary:hover {
  background-color: #D8D8D8;
}

.btn-primary {
  background-color: #4A90E2;
  color: white;
}

.btn-primary:hover {
  background-color: #357ABD;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

/* 添加按钮 */
.add-btn {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: #4A90E2;
  color: white;
  font-size: 32px;
  font-weight: bold;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(74, 144, 226, 0.4);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-btn:hover {
  background-color: #357ABD;
  transform: translateY(-4px);
  box-shadow: 0 6px 20px rgba(74, 144, 226, 0.5);
}

/* 右键菜单 */
.context-menu {
  position: fixed;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 180px;
  overflow: hidden;
}

.category-submenu {
  margin-left: 4px;
  border-left: 3px solid #4A90E2;
}

.menu-item {
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  color: #333;
}

.menu-item:hover {
  background-color: #F5F7FA;
}

.menu-item:active {
  background-color: #E8E8E8;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header {
    padding: 12px 16px;
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .header-actions {
    justify-content: space-between;
  }

  .search-box {
    min-width: auto;
  }

  .title {
    font-size: 20px;
    text-align: center;
  }

  .main {
    padding: 16px;
  }

  .category-tabs {
    gap: 4px;
  }

  .category-tab {
    padding: 6px 12px;
    font-size: 12px;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }

  .list .book-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .list .book-cover {
    width: 100%;
    padding-top: 150%;
    height: auto;
  }

  .list .book-info {
    width: 100%;
  }

  .list .book-title {
    font-size: 16px;
  }

  .dialog-content {
    padding: 16px;
  }
}
</style>