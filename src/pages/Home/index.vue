<template>
  <div class="home">
    <!-- 顶部导航栏 -->
    <header class="header">
      <h1 class="title">Neat Reader</h1>
      <div class="header-actions">
        <router-link to="/settings" class="btn btn-secondary">
          设置
        </router-link>
      </div>
    </header>

    <!-- 主要内容区 -->
    <main class="main">
      <!-- 电子书列表 -->
      <div class="books-section">
        <div class="section-header">
          <h2 class="section-title">我的书架</h2>
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

        <!-- 电子书列表 -->
        <div :class="viewMode === 'grid' ? 'grid' : 'list'" class="books-list">
          <div 
            v-for="book in books" 
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
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="books.length === 0" class="empty-state">
          <div class="empty-icon">📚</div>
          <h3>书架是空的</h3>
          <p>添加一些电子书开始阅读吧</p>
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
      @click.stop
      @contextmenu.prevent
    >
      <div 
        class="menu-item"
        @click="uploadToBaidupan(selectedBook)"
        v-if="selectedBook"
      >
        📤 上传到百度网盘
      </div>
      <div 
        class="menu-item"
        @click="removeBook(selectedBook)"
        v-if="selectedBook"
      >
        🗑️ 删除书籍
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

// 右键菜单相关
const showMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const selectedBook = ref<any>(null)

// 计算属性：显示所有书籍（本地和百度网盘）
const books = computed(() => {
  return ebookStore.books
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
  menuX.value = event.clientX
  menuY.value = event.clientY
  selectedBook.value = book
  
  // 点击其他区域关闭菜单
  document.addEventListener('click', closeContextMenu)
}

// 关闭右键菜单
const closeContextMenu = () => {
  showMenu.value = false
  selectedBook.value = null
  document.removeEventListener('click', closeContextMenu)
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
const removeBook = async (book: any) => { // 这里的 book 是通过模板传进来的
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

// 生命周期钩子
onMounted(async () => {
  try {
    console.log('首页加载，开始初始化电子书存储...');
    // 初始化电子书存储
    await ebookStore.initialize();
    console.log('电子书存储初始化完成');
    console.log('当前书籍数量:', ebookStore.books.length);
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
  gap: 12px;
}

/* 主要内容区 */
.main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
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
  }

  .title {
    font-size: 20px;
  }

  .main {
    padding: 16px;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
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
}
</style>