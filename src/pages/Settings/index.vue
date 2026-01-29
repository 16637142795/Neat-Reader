<template>
  <div class="settings">
    <header class="header">
      <h1 class="title">设置</h1>
      <router-link to="/" class="btn btn-secondary">← 返回</router-link>
    </header>

    <main class="main">
      <div class="settings-container">
        <section class="setting-section">
          <h2 class="section-title">百度网盘</h2>
          <div class="setting-card">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">授权状态</span>
                <span class="setting-desc" v-if="authUser">已连接：{{ authUser.baidu_name }}</span>
                <span class="setting-desc" v-else>配置百度网盘信息以获取access_token</span>
              </div>
              <div class="setting-control">
                <div class="baidupan-status">
                  <span v-if="authUser" class="status connected">已授权</span>
                  <span v-else class="status disconnected">未授权</span>
                </div>
              </div>
            </div>

            <div class="setting-row" v-if="!authUser">
              <div class="setting-info" style="width: 100%;">
                <input 
                  type="text" 
                  class="form-control" 
                  v-model="baiduClientId" 
                  placeholder="百度网盘 App Key" 
                  style="width: 100%; margin-bottom: 12px;"
                >
                <input 
                  type="text" 
                  class="form-control" 
                  v-model="baiduClientSecret" 
                  placeholder="百度网盘 App Secret" 
                  style="width: 100%; margin-bottom: 12px;"
                >
                <input 
                  type="text" 
                  class="form-control" 
                  v-model="refreshToken" 
                  placeholder="Refresh Token" 
                  style="width: 100%; margin-bottom: 12px;"
                  @paste="handlePaste"
                >
                <button 
                  class="btn btn-primary" 
                  style="width: 100%;"
                  @click="refreshAccessToken" 
                  :disabled="!baiduClientId || !baiduClientSecret || !refreshToken || isLoading"
                >
                  {{ isLoading ? '获取中...' : '获取access_token' }}
                </button>
              </div>
            </div>

            <div class="setting-row" v-else>
              <div class="setting-info" style="width: 100%;">
                <div class="user-info">
                  <img :src="authUser.avatar_url" class="user-avatar" alt="头像">
                  <div class="user-detail">
                    <span class="user-name">{{ authUser.baidu_name }}</span>
                    <span class="user-vip">{{ authUser.vip_type === 2 ? '超级会员' : authUser.vip_type === 1 ? '普通会员' : '普通用户' }}</span>
                  </div>
                </div>
                <button 
                  class="btn btn-danger" 
                  style="width: 100%; margin-top: 12px;"
                  @click="disconnect"
                >
                  取消授权
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="setting-section">
          <h2 class="section-title">阅读</h2>
          <div class="setting-card">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">字体大小</span>
                <span class="setting-desc">调整阅读时的字体大小 ({{ readerConfig.fontSize }}px)</span>
              </div>
              <div class="setting-control">
                <div class="stepper">
                  <button class="btn btn-secondary btn-sm" @click="decreaseFontSize">-</button>
                  <span class="stepper-value">{{ readerConfig.fontSize }}</span>
                  <button class="btn btn-secondary btn-sm" @click="increaseFontSize">+</button>
                </div>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">字体</span>
                <span class="setting-desc">选择阅读时的字体</span>
              </div>
              <div class="setting-control">
                <select class="form-control" :model-value="readerConfig.fontFamily" @change="updateFontFamily">
                  <option value="system">系统默认</option>
                  <option value="sans-serif">无衬线体</option>
                  <option value="serif">衬线体</option>
                  <option value="monospace">等宽字体</option>
                </select>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">主题</span>
                <span class="setting-desc">选择阅读界面的主题</span>
              </div>
              <div class="setting-control">
                <div class="theme-selector">
                  <button 
                    class="theme-btn light" 
                    :class="{ active: readerConfig.theme === 'light' }"
                    @click="updateTheme('light')"
                    title="浅色"
                  ></button>
                  <button 
                    class="theme-btn sepia" 
                    :class="{ active: readerConfig.theme === 'sepia' }"
                    @click="updateTheme('sepia')"
                    title="护眼"
                  ></button>
                  <button 
                    class="theme-btn dark" 
                    :class="{ active: readerConfig.theme === 'dark' }"
                    @click="updateTheme('dark')"
                    title="深色"
                  ></button>
                </div>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">翻页模式</span>
                <span class="setting-desc">选择翻页方式</span>
              </div>
              <div class="setting-control">
                <div class="toggle-group">
                  <button 
                    class="toggle-btn" 
                    :class="{ active: readerConfig.pageMode === 'page' }"
                    @click="updatePageMode('page')"
                  >单页</button>
                  <button 
                    class="toggle-btn" 
                    :class="{ active: readerConfig.pageMode === 'scroll' }"
                    @click="updatePageMode('scroll')"
                  >滚动</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="setting-section">
          <h2 class="section-title">外观</h2>
          <div class="setting-card">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">视图模式</span>
                <span class="setting-desc">书架的显示方式</span>
              </div>
              <div class="setting-control">
                <div class="toggle-group">
                  <button 
                    class="toggle-btn" 
                    :class="{ active: uiConfig.viewMode === 'grid' }"
                    @click="updateViewMode('grid')"
                  >网格</button>
                  <button 
                    class="toggle-btn" 
                    :class="{ active: uiConfig.viewMode === 'list' }"
                    @click="updateViewMode('list')"
                  >列表</button>
                </div>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">语言</span>
                <span class="setting-desc">界面语言</span>
              </div>
              <div class="setting-control">
                <select class="form-control" :model-value="uiConfig.language" @change="updateLanguage">
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useEbookStore } from '../../stores/ebook'
import { useDialogStore } from '../../stores/dialog'

const ebookStore = useEbookStore()
const dialogStore = useDialogStore()

const isBaidupanAuthorized = computed(() => ebookStore.isBaidupanTokenValid())
const storageConfig = computed(() => ebookStore.userConfig.storage)
const readerConfig = computed(() => ebookStore.userConfig.reader)
const uiConfig = computed(() => ebookStore.userConfig.ui)

const baiduClientId = ref('')
const baiduClientSecret = ref('')
const refreshToken = ref('')
const inputAccessToken = ref('')
const isLoading = ref(false)
const authUser = ref<{baidu_name: string; avatar_url: string; vip_type: number} | null>(null)

const handlePaste = (event: ClipboardEvent) => {
  const text = event.clipboardData?.getData('text')
  if (text) {
    refreshToken.value = text
    event.preventDefault()
  }
}

const refreshAccessToken = async () => {
  if (!baiduClientId.value || !baiduClientSecret.value || !refreshToken.value) return
  isLoading.value = true
  
  try {
    const response = await fetch('http://localhost:3001/api/baidu/oauth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: baiduClientId.value,
        client_secret: baiduClientSecret.value,
        refresh_token: refreshToken.value
      })
    })
    const data = await response.json()
    
    if (data.success) {
      inputAccessToken.value = data.access_token
      verifyAndConnect()
    } else {
      dialogStore.showErrorDialog('获取失败', data.message)
    }
  } catch (error) {
    dialogStore.showErrorDialog('获取失败', '网络错误，请重试')
  } finally {
    isLoading.value = false
  }
}

const verifyAndConnect = async () => {
  if (!inputAccessToken.value) return
  isLoading.value = true
  
  try {
    const response = await fetch(`http://localhost:3001/api/baidu/pan/verify?token=${encodeURIComponent(inputAccessToken.value)}`)
    const data = await response.json()
    
    if (data.valid) {
      authUser.value = {
        baidu_name: data.user.baidu_name,
        avatar_url: data.user.avatar_url,
        vip_type: data.user.vip_type
      }
      
      await ebookStore.updateUserConfig({
        storage: {
          ...storageConfig.value,
          baidupan: {
            ...storageConfig.value.baidupan,
            accessToken: inputAccessToken.value,
            userId: String(data.user.uk),
            expiration: Date.now() + 30 * 24 * 60 * 60 * 1000
          }
        }
      })
      dialogStore.showSuccessDialog('百度网盘授权成功')
    } else {
      dialogStore.showErrorDialog('验证失败', data.message || '无效的token')
    }
  } catch (error) {
    dialogStore.showErrorDialog('验证失败', '网络错误，请重试')
  } finally {
    isLoading.value = false
  }
}

const disconnect = async () => {
  await ebookStore.updateUserConfig({
    storage: {
      ...storageConfig.value,
      baidupan: {
        ...storageConfig.value.baidupan,
        accessToken: '',
        userId: ''
      }
    }
  })
  authUser.value = null
  refreshToken.value = ''
  baiduClientId.value = ''
  baiduClientSecret.value = ''
  dialogStore.showSuccessDialog('已取消授权')
}

const decreaseFontSize = async () => {
  if (readerConfig.value.fontSize > 12) {
    await ebookStore.updateUserConfig({
      reader: { ...readerConfig.value, fontSize: readerConfig.value.fontSize - 1 }
    })
  }
}

const increaseFontSize = async () => {
  if (readerConfig.value.fontSize < 32) {
    await ebookStore.updateUserConfig({
      reader: { ...readerConfig.value, fontSize: readerConfig.value.fontSize + 1 }
    })
  }
}

const updateFontFamily = async (event: Event) => {
  const target = event.target as HTMLSelectElement
  await ebookStore.updateUserConfig({
    reader: { ...readerConfig.value, fontFamily: target.value }
  })
}

const updateTheme = async (theme: 'light' | 'sepia' | 'dark') => {
  await ebookStore.updateUserConfig({
    reader: { ...readerConfig.value, theme }
  })
}

const updatePageMode = async (mode: 'page' | 'scroll') => {
  await ebookStore.updateUserConfig({
    reader: { ...readerConfig.value, pageMode: mode }
  })
}

const updateViewMode = async (mode: 'grid' | 'list') => {
  await ebookStore.updateUserConfig({
    ui: { ...uiConfig.value, viewMode: mode }
  })
}

const updateLanguage = async (event: Event) => {
  const target = event.target as HTMLSelectElement
  await ebookStore.updateUserConfig({
    ui: { ...uiConfig.value, language: target.value }
  })
}

onMounted(async () => {
  await ebookStore.initialize()
  
  if (storageConfig.value.baidupan?.accessToken) {
    try {
      const response = await fetch(`http://localhost:3001/api/baidu/pan/verify?token=${encodeURIComponent(storageConfig.value.baidupan.accessToken)}`)
      const data = await response.json()
      if (data.valid) {
        authUser.value = {
          baidu_name: data.user.baidu_name,
          avatar_url: data.user.avatar_url,
          vip_type: data.user.vip_type
        }
      }
    } catch {
      console.warn('验证已保存的token失败')
    }
  }
})
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f7fa;
}

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

.main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.settings-container {
  max-width: 600px;
  margin: 0 auto;
}

.setting-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #4A90E2;
}

.setting-card {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 8px 0;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 15px;
  font-weight: 500;
  color: #333;
}

.setting-desc {
  font-size: 13px;
  color: #999;
}

.setting-control {
  flex-shrink: 0;
}

.form-control {
  padding: 8px 12px;
  border: 1px solid #DCDFE6;
  border-radius: 6px;
  font-size: 14px;
  min-width: 150px;
}

.baidupan-status {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status.connected {
  background-color: #F0F9EB;
  color: #67C23A;
}

.status.disconnected {
  background-color: #FEF0F0;
  color: #F56C6C;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stepper-value {
  min-width: 40px;
  text-align: center;
  font-weight: 500;
}

.theme-selector {
  display: flex;
  gap: 8px;
}

.theme-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.theme-btn.light {
  background: linear-gradient(135deg, #fff 50%, #f5f5f5 50%);
}

.theme-btn.sepia {
  background: linear-gradient(135deg, #f4ecd8 50%, #e8dcc8 50%);
}

.theme-btn.dark {
  background: linear-gradient(135deg, #2c2c2c 50%, #1a1a1a 50%);
}

.theme-btn.active {
  border-color: #4A90E2;
  transform: scale(1.1);
}

.toggle-group {
  display: flex;
  background-color: #f5f7fa;
  border-radius: 6px;
  overflow: hidden;
}

.toggle-btn {
  padding: 8px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  transition: all 0.2s;
}

.toggle-btn.active {
  background-color: #4A90E2;
  color: white;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background-color: #4A90E2;
  color: white;
}

.btn-primary:hover {
  background-color: #357ABD;
}

.btn-secondary {
  background-color: #f5f7fa;
  color: #666;
}

.btn-secondary:hover {
  background-color: #e8e8e8;
}

.btn-danger {
  background-color: #F56C6C;
  color: white;
}

.btn-danger:hover {
  background-color: #f23c3c;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.user-detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 500;
  color: #333;
  font-size: 14px;
}

.user-vip {
  font-size: 12px;
  color: #999;
}

@media (max-width: 768px) {
  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .setting-control {
    width: 100%;
  }
  
  .form-control {
    width: 100%;
    min-width: 0;
  }
}
</style>
