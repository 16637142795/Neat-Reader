import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import localforage from 'localforage'
import ePub from 'epubjs'
import { v4 as uuidv4 } from 'uuid'

// 定义电子书元数据类型
export interface EbookMetadata {
  id: string;
  title: string;
  author: string;
  cover: string;
  path: string;
  format: string;
  size: number;
  lastRead: number;
  totalChapters: number;
  readingProgress: number;
  storageType: 'local' | 'baidupan';
  baidupanPath?: string;
  addedAt: number;
}

// 定义阅读进度类型
export interface ReadingProgress {
  ebookId: string;
  chapterIndex: number;
  chapterTitle: string;
  position: number;
  timestamp: number;
  deviceId: string;
  deviceName: string;
  readingTime: number;
}

// 定义用户配置类型
export interface UserConfig {
  storage: {
    default: 'local' | 'baidupan';
    localPath: string;
    autoSync: boolean;
    syncInterval: number;
    baidupan: {
      accessToken: string;
      refreshToken: string;
      expiration: number;
      rootPath: string;
      userId: string;
    };
  };
  reader: {
    fontSize: number;
    fontFamily: string;
    theme: 'light' | 'sepia' | 'dark';
    pageMode: 'page' | 'scroll';
    brightness: number;
    lineSpacing: number;
    paragraphSpacing: number;
    autoSaveInterval: number;
  };
  ui: {
    viewMode: 'grid' | 'list';
    language: string;
  };
}

// 定义设备信息类型
export interface DeviceInfo {
  id: string;
  name: string;
  type: 'desktop' | 'mobile' | 'tablet';
  platform: string;
  lastSync: number;
}

// 初始化localforage配置
localforage.config({
  name: 'NeatReader',
  storeName: 'ebookStore',
  description: 'Neat Reader电子书阅读器数据存储'
});

// 定义电子书状态管理
export const useEbookStore = defineStore('ebook', () => {
  // 状态
  const books = ref<EbookMetadata[]>([]);
  const currentBook = ref<EbookMetadata | null>(null);
  const readingProgress = ref<ReadingProgress | null>(null);
  const userConfig = ref<UserConfig>({
    storage: {
      default: 'local',
      localPath: '',
      autoSync: true,
      syncInterval: 15,
      baidupan: {
        accessToken: '',
        refreshToken: '',
        expiration: 0,
        rootPath: '/NeatReader',
        userId: ''
      }
    },
    reader: {
      fontSize: 18,
      fontFamily: 'system',
      theme: 'light',
      pageMode: 'page',
      brightness: 100,
      lineSpacing: 1.5,
      paragraphSpacing: 8,
      autoSaveInterval: 10
    },
    ui: {
      viewMode: 'grid',
      language: 'zh-CN'
    }
  });
  const deviceInfo = ref<DeviceInfo>({
    id: 'device-1',
    name: '本地设备',
    type: 'desktop',
    platform: 'windows',
    lastSync: Date.now()
  });

  // 计算属性
  const localBooks = computed(() => {
    return books.value.filter(book => book.storageType === 'local');
  });

  const baidupanBooks = computed(() => {
    return books.value.filter(book => book.storageType === 'baidupan');
  });

  const recentBooks = computed(() => {
    return [...books.value]
      .sort((a, b) => b.lastRead - a.lastRead)
      .slice(0, 10);
  });

  // 方法
  const loadBooks = async () => {
    try {
      const savedBooks = await localforage.getItem<EbookMetadata[]>('books');
      if (savedBooks) {
        books.value = savedBooks;
      }
    } catch (error) {
      console.error('加载电子书列表失败:', error);
    }
  };

  const saveBooks = async () => {
    try {
      // 保存书籍列表，但不包含blob URL形式的封面
      const booksWithoutBlobCovers = books.value.map(book => {
        // 如果封面是blob URL，我们不保存它，因为它无法序列化
        // 当重新加载时，我们会重新生成封面
        if (book.cover && typeof book.cover === 'string' && book.cover.startsWith('blob:')) {
          return { ...book, cover: '' };
        }
        return book;
      });
      await localforage.setItem('books', booksWithoutBlobCovers);
    } catch (error) {
      console.error('保存电子书列表失败:', error);
    }
  };

  const addBook = async (book: EbookMetadata) => {
    books.value.push(book);
    await saveBooks();
  };

  const updateBook = async (bookId: string, updates: Partial<EbookMetadata>) => {
    const index = books.value.findIndex(book => book.id === bookId);
    if (index !== -1) {
      books.value[index] = { ...books.value[index], ...updates };
      await saveBooks();
    }
  };

  const removeBook = async (bookId: string, storageType?: 'local' | 'baidupan') => {
    try {
      console.log('正在删除书籍:', bookId, '存储类型:', storageType);
      
      // 1. 找到要删除的书籍，获取其存储类型（如果未提供）
      const bookToRemove = books.value.find(book => book.id === bookId);
      const actualStorageType = storageType || bookToRemove?.storageType;
      
      console.log('实际存储类型:', actualStorageType);
      
      // 2. 过滤掉要删除的书籍，重新赋值触发响应式
      const initialLength = books.value.length;
      books.value = books.value.filter(book => book.id !== bookId);
      
      if (books.value.length === initialLength) {
        console.error('未找到要删除的书籍:', bookId);
        throw new Error('未找到要删除的书籍');
      }
      
      // 3. 同步到本地数据库
      await saveBooks();
      
      // 4. 清理该书籍关联的物理文件
      if (actualStorageType === 'local') {
        console.log('清理本地存储的书籍文件:', bookId);
        await localforage.removeItem(`ebook_content_${bookId}`);
        // 清理封面
        await localforage.removeItem(`ebook_cover_${bookId}`);
      }
      
      console.log('书籍删除成功');
      return true;
    } catch (error) {
      console.error('删除书籍失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      return false;
    }
  };

  const getBookById = (bookId: string) => {
    return books.value.find(book => book.id === bookId) || null;
  };

  const setCurrentBook = (book: EbookMetadata | null) => {
    currentBook.value = book;
  };

  const loadReadingProgress = async (ebookId: string) => {
    try {
      const progress = await localforage.getItem<ReadingProgress>(`progress_${ebookId}`);
      readingProgress.value = progress || null;
      return progress;
    } catch (error) {
      console.error('加载阅读进度失败:', error);
      return null;
    }
  };

  const saveReadingProgress = async (progress: ReadingProgress) => {
    try {
      readingProgress.value = progress;
      await localforage.setItem(`progress_${progress.ebookId}`, progress);
      
      // 更新电子书的阅读进度
      await updateBook(progress.ebookId, {
        lastRead: progress.timestamp,
        readingProgress: Math.round(progress.position)
      });
    } catch (error) {
      console.error('保存阅读进度失败:', error);
    }
  };

  const loadUserConfig = async () => {
    try {
      const config = await localforage.getItem<UserConfig>('userConfig');
      if (config) {
        userConfig.value = config;
      }
    } catch (error) {
      console.error('加载用户配置失败:', error);
    }
  };

  const saveUserConfig = async () => {
    try {
      // 深拷贝userConfig，确保所有对象都是可序列化的
      const serializableConfig = JSON.parse(JSON.stringify(userConfig.value));
      await localforage.setItem('userConfig', serializableConfig);
    } catch (error) {
      console.error('保存用户配置失败:', error);
    }
  };

  const updateUserConfig = async (updates: Partial<UserConfig>) => {
    userConfig.value = { ...userConfig.value, ...updates };
    await saveUserConfig();
  };

  // 百度网盘 API 配置
  const baidupanApiConfig = {
    clientId: 'WreV7F9LXSzyYOQzzP7Ih1UmvuDxN763', // 替换为真实的 App Key
    clientSecret: 'hNAobFVEevG7kseZry9xq3LM6jxoWSLz', // 替换为真实的 App Secret
    redirectUri: 'http://localhost:8080/callback', // 替换为真实的回调地址
    apiUrl: 'http://localhost:3001/api/baidu/pan', // 使用代理服务
    oauthUrl: 'http://localhost:3001/api/baidu/oauth' // 使用代理服务
  };

  // 更新百度网盘 API 配置
  const updateBaidupanApiConfig = (clientId: string, clientSecret: string) => {
    baidupanApiConfig.clientId = clientId;
    baidupanApiConfig.clientSecret = clientSecret;
  };

  // 百度网盘授权
  const authorizeBaidupan = async (): Promise<boolean> => {
    try {
      // 生成授权 URL
      const authUrl = `https://openapi.baidu.com/oauth/2.0/authorize?client_id=${baidupanApiConfig.clientId}&response_type=code&redirect_uri=${encodeURIComponent(baidupanApiConfig.redirectUri)}&scope=basic,netdisk`;
      
      // 打开授权窗口
      const authWindow = window.open(authUrl, '百度网盘授权', 'width=800,height=600');
      if (!authWindow) {
        console.error('无法打开授权窗口');
        return false;
      }
      
      // 监听授权回调
      return new Promise((resolve) => {
        const handleMessage = async (event: MessageEvent) => {
          try {
            console.log('收到授权回调消息:', event.data);
            console.log('消息来源:', event.origin);
            
            if (event.origin === window.location.origin) {
              const { code } = event.data;
              if (code) {
                console.log('获取到授权码:', code);
                
                // 使用授权码获取访问令牌
                const token = await getBaidupanToken(code);
                console.log('获取令牌结果:', token ? '成功' : '失败');
                
                if (token) {
                  // 保存令牌到用户配置
                  await updateUserConfig({
                    storage: {
                      ...userConfig.value.storage,
                      baidupan: {
                        ...userConfig.value.storage.baidupan,
                        accessToken: token.access_token,
                        refreshToken: token.refresh_token,
                        expiration: Date.now() + (token.expires_in * 1000),
                        userId: token.userid
                      }
                    }
                  });
                  console.log('令牌保存成功');
                  resolve(true);
                } else {
                  console.error('获取令牌失败');
                  resolve(false);
                }
              } else {
                console.error('未获取到授权码:', event.data);
                resolve(false);
              }
            } else {
              console.error('消息来源不匹配:', event.origin);
              resolve(false);
            }
          } catch (error) {
            console.error('处理授权回调失败:', error);
            if (error instanceof Error) {
              console.error('错误详情:', error.message);
            }
            resolve(false);
          } finally {
            window.removeEventListener('message', handleMessage);
          }
        };
        
        window.addEventListener('message', handleMessage);
        
        // 监听授权窗口关闭
        const checkWindowClosed = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkWindowClosed);
            window.removeEventListener('message', handleMessage);
            resolve(false);
          }
        }, 1000);
      });
    } catch (error) {
      console.error('百度网盘授权失败:', error);
      return false;
    }
  };

  // 获取百度网盘访问令牌
  const getBaidupanToken = async (code: string): Promise<any> => {
    try {
      console.log('开始获取百度网盘令牌，授权码:', code);
      
      // 构建GET请求URL，使用代理服务
      const params = new URLSearchParams({
        client_id: baidupanApiConfig.clientId,
        client_secret: baidupanApiConfig.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: baidupanApiConfig.redirectUri
      });
      
      const requestUrl = `${baidupanApiConfig.oauthUrl}/token?${params.toString()}`;
      console.log('请求URL:', requestUrl);
      
      // 使用GET方法请求代理服务
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('请求状态:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('获取百度网盘令牌失败，响应状态:', response.status, '响应内容:', errorText);
        return null;
      }
      
      const data = await response.json();
      console.log('获取百度网盘令牌成功:', {
        access_token: data.access_token ? '***' : null, // 隐藏令牌
        refresh_token: data.refresh_token ? '***' : null, // 隐藏令牌
        expires_in: data.expires_in,
        userid: data.userid
      });
      
      if (data.error_code) {
        console.error('百度网盘 API 错误:', data.error_code, data.error_msg);
        return null;
      }
      
      return data;
      
    } catch (error) {
      console.error('获取百度网盘令牌失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      return null;
    }
  };

  // 刷新百度网盘访问令牌
  const refreshBaidupanToken = async (): Promise<boolean> => {
    try {
      const { refreshToken } = userConfig.value.storage.baidupan;
      if (!refreshToken) {
        return false;
      }
      
      // 构建GET请求URL，使用代理服务
      const params = new URLSearchParams({
        client_id: baidupanApiConfig.clientId,
        client_secret: baidupanApiConfig.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });
      
      const requestUrl = `${baidupanApiConfig.oauthUrl}/token?${params.toString()}`;
      console.log('刷新令牌请求URL:', requestUrl);
      
      // 使用GET方法请求代理服务
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('刷新令牌请求状态:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('刷新百度网盘令牌失败，响应状态:', response.status, '响应内容:', errorText);
        return false;
      }
      
      const data = await response.json();
      console.log('刷新百度网盘令牌成功:', {
        access_token: data.access_token ? '***' : null, // 隐藏令牌
        refresh_token: data.refresh_token ? '***' : null, // 隐藏令牌
        expires_in: data.expires_in
      });
      
      if (data.error_code) {
        console.error('百度网盘 API 错误:', data.error_code, data.error_msg);
        return false;
      }
      
      if (data.access_token) {
        // 保存新令牌到用户配置
        await updateUserConfig({
          storage: {
            ...userConfig.value.storage,
            baidupan: {
              ...userConfig.value.storage.baidupan,
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiration: Date.now() + (data.expires_in * 1000)
            }
          }
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('刷新百度网盘令牌失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      return false;
    }
  };

  // 检查百度网盘令牌是否有效
  const isBaidupanTokenValid = (): boolean => {
    const { accessToken, expiration } = userConfig.value.storage.baidupan;
    // 确保所有必要的令牌信息都存在且未过期
    return !!accessToken && !!userConfig.value.storage.baidupan.refreshToken && expiration > Date.now();
  };

  // 确保百度网盘令牌有效
  const ensureBaidupanToken = async (): Promise<boolean> => {
    if (isBaidupanTokenValid()) {
      return true;
    }
    return await refreshBaidupanToken();
  };

  // 上传文件到百度网盘
  const uploadToBaidupan = async (file: File, path: string): Promise<boolean> => {
    try {
      // 确保令牌有效
      if (!await ensureBaidupanToken()) {
        return false;
      }
      
      const { accessToken } = userConfig.value.storage.baidupan;
      
      // 第一步：预创建文件（使用代理服务）
      const precreateUrl = `${baidupanApiConfig.apiUrl}/precreate`;
      console.log('预创建上传请求URL:', precreateUrl);
      
      const precreateResponse = await fetch(precreateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          path: `${path}/${file.name}`,
          size: file.size,
          isdir: 0,
          autoinit: 1,
          rtype: 1
        })
      });
      
      const precreateData = await precreateResponse.json();
      console.log('预创建上传响应:', precreateData);
      
      if (precreateData.error_code) {
        console.error('预创建文件失败:', precreateData);
        return false;
      }
      
      // 检查是否需要上传分片
      if (precreateData.return_type === 1) {
        // 文件已存在或秒传成功
        console.log('文件秒传成功');
        return true;
      } else if (precreateData.return_type === 2) {
        // 需要上传分片
        const { upload_list } = precreateData;
        if (upload_list && upload_list.length > 0) {
          // 对于简单情况，我们直接上传整个文件作为一个分片
          const chunk = file.slice(0, file.size);
          const chunkFile = new File([chunk], file.name, { type: file.type });
          
          // 上传分片
          const uploadUrl = `${baidupanApiConfig.apiUrl}/upload`;
          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            body: chunkFile
          });
          
          if (!uploadResponse.ok) {
            console.error('上传分片失败:', uploadResponse.status);
            return false;
          }
          
          const uploadData = await uploadResponse.json();
          console.log('上传分片响应:', uploadData);
        }
        
        // 创建文件
        const createUrl = `${baidupanApiConfig.apiUrl}/create`;
        const createResponse = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            path: `${path}/${file.name}`,
            size: file.size,
            isdir: 0,
            block_list: [], // 实际使用中应包含上传的块信息
            uploadid: precreateData.uploadid,
            rtype: 1
          })
        });
        
        const createData = await createResponse.json();
        if (createData.error_code) {
          console.error('创建文件失败:', createData);
          return false;
        }
        
        console.log('文件创建成功');
        return true;
      }
      
      return true;
    } catch (error) {
      console.error('上传文件到百度网盘失败:', error);
      return false;
    }
  };
  
  // 将本地书籍上传到百度网盘
  const uploadLocalBookToBaidupan = async (book: EbookMetadata): Promise<boolean> => {
    try {
      // 确保书籍是本地存储类型
      if (book.storageType !== 'local') {
        console.error('书籍已经是百度网盘存储类型');
        return false;
      }
      
      // 确保令牌有效
      if (!await ensureBaidupanToken()) {
        console.error('百度网盘令牌无效，无法上传');
        return false;
      }
      
      // 从 IndexedDB 获取文件内容
      console.log('尝试从 IndexedDB 获取文件内容，键名:', `ebook_content_${book.id}`);
      const fileContent = await localforage.getItem<ArrayBuffer>(`ebook_content_${book.id}`);
      if (!fileContent) {
        console.error('无法获取书籍文件内容');
        return false;
      }
      console.log('获取文件内容成功，大小:', fileContent.byteLength);
      
      // 将 ArrayBuffer 转换为 File 对象
      const fileName = `${book.title}.${book.format}`;
      const file = new File([fileContent], fileName, { 
        type: `application/${book.format === 'epub' ? 'epub+zip' : book.format}` 
      });
      console.log('创建 File 对象成功:', fileName);
      
      // 上传到百度网盘
      const uploadPath = userConfig.value.storage.baidupan.rootPath || '/NeatReader';
      console.log('开始上传到百度网盘，路径:', `${uploadPath}/${fileName}`);
      const uploadResult = await uploadToBaidupan(file, uploadPath);
      
      if (uploadResult) {
        console.log('上传成功，更新书籍存储类型');
        // 更新书籍的存储类型为百度网盘，确保保留封面信息
        await updateBook(book.id, {
          storageType: 'baidupan',
          baidupanPath: `${uploadPath}/${fileName}`,
          cover: book.cover
        });
        
        return true;
      }
      
      console.error('上传失败，uploadToBaidupan 返回 false');
      return false;
    } catch (error) {
      console.error('上传本地书籍到百度网盘失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      return false;
    }
  };

  // 从百度网盘下载文件
  const downloadFromBaidupan = async (path: string): Promise<Blob | null> => {
    try {
      // 确保令牌有效
      if (!await ensureBaidupanToken()) {
        return null;
      }
      
      const { accessToken } = userConfig.value.storage.baidupan;
      
      // 获取下载链接（使用代理服务）
      const downloadUrl = `${baidupanApiConfig.apiUrl}/file?method=download&path=${encodeURIComponent(path)}&fld_list=`;
      console.log('获取下载链接请求URL:', downloadUrl);
      
      const downloadUrlResponse = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      const downloadUrlData = await downloadUrlResponse.json();
      console.log('获取下载链接响应:', downloadUrlData);
      
      if (downloadUrlData.error_code) {
        console.error('获取下载链接失败:', downloadUrlData);
        return null;
      }
      
      // 下载文件（直接从百度提供的下载地址下载，不需要代理）
      const fileResponse = await fetch(downloadUrlData.download_url);
      if (!fileResponse.ok) {
        console.error('下载文件失败:', fileResponse.status);
        return null;
      }
      
      const blob = await fileResponse.blob();
      return blob;
    } catch (error) {
      console.error('从百度网盘下载文件失败:', error);
      return null;
    }
  };

  // 列出百度网盘文件
  const listBaidupanFiles = async (path: string): Promise<any[]> => {
    try {
      // 确保令牌有效
      if (!await ensureBaidupanToken()) {
        return [];
      }
      
      const { accessToken } = userConfig.value.storage.baidupan;
      
      // 调用 API 获取文件列表（使用代理服务）
      const listUrl = `${baidupanApiConfig.apiUrl}/file?method=list&path=${encodeURIComponent(path)}&web=1&order=name&desc=0`;
      console.log('获取文件列表请求URL:', listUrl);
      
      const response = await fetch(listUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      const data = await response.json();
      console.log('获取文件列表响应:', data);
      
      if (data.error_code) {
        console.error('获取百度网盘文件列表失败:', data);
        return [];
      }
      
      return data.list || [];
    } catch (error) {
      console.error('列出百度网盘文件失败:', error);
      return [];
    }
  };

  // 同步阅读进度到百度网盘
  const syncReadingProgress = async () => {
    try {
      // 确保令牌有效
      if (!await ensureBaidupanToken()) {
        console.error('百度网盘令牌无效，无法同步');
        return false;
      }
      
      // 准备同步数据
      const syncData = {
        ebooks: books.value,
        progress: readingProgress.value,
        timestamp: Date.now(),
        deviceId: deviceInfo.value.id,
        deviceName: deviceInfo.value.name
      };
      
      // 上传同步数据到百度网盘
      const syncFile = new File([JSON.stringify(syncData)], 'sync.json', { type: 'application/json' });
      const result = await uploadToBaidupan(syncFile, '/NeatReader/sync');
      
      console.log('同步阅读进度到百度网盘成功:', result);
      return result;
    } catch (error) {
      console.error('同步阅读进度到百度网盘失败:', error);
      return false;
    }
  };

  // 从百度网盘同步阅读进度
  const syncReadingProgressFromBaidupan = async (): Promise<boolean> => {
    try {
      // 确保令牌有效
      if (!await ensureBaidupanToken()) {
        console.error('百度网盘令牌无效，无法同步');
        return false;
      }
      
      // 下载同步数据
      const syncDataBlob = await downloadFromBaidupan('/NeatReader/sync/sync.json');
      if (!syncDataBlob) {
        console.error('无法下载同步数据');
        return false;
      }
      
      // 解析同步数据
      const syncDataText = await syncDataBlob.text();
      const syncData = JSON.parse(syncDataText);
      
      // 更新本地数据
      if (syncData.ebooks) {
        books.value = syncData.ebooks;
        await saveBooks();
      }
      
      if (syncData.progress) {
        readingProgress.value = syncData.progress;
      }
      
      console.log('从百度网盘同步阅读进度成功');
      return true;
    } catch (error) {
      console.error('从百度网盘同步阅读进度失败:', error);
      return false;
    }
  };

  // 导入 EPUB 文件
  const importEpubFile = async (file: File): Promise<EbookMetadata | null> => {
    try {
      // 生成唯一 ID
      const id = `epub_${uuidv4()}`;
      
      // 将文件转换为 ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // 保存文件内容到 IndexedDB
      await localforage.setItem(`ebook_content_${id}`, arrayBuffer);
      
      // 提取封面
      let coverData = '';
      try {
        const book = ePub(arrayBuffer);
        // 等待书籍加载完成
        await new Promise((resolve, reject) => {
          book.ready.then(resolve).catch(reject);
        });
        // 获取封面 URL
        const coverUrl = await book.coverUrl();
        if (coverUrl) {
          // 如果是相对路径，需要转换为绝对路径或获取原始数据
          if (typeof coverUrl === 'string' && coverUrl.startsWith('blob:')) {
            coverData = coverUrl;
          } else {
            coverData = coverUrl;
          }
        }
      } catch (e) {
        console.warn('封面提取失败:', e);
      }
      
      // 创建电子书元数据
      const ebookMetadata: EbookMetadata = {
        id,
        title: file.name.replace('.epub', ''),
        author: '未知作者',
        cover: coverData,
        path: id, // 使用 ID 作为路径，后续通过 ID 获取文件内容
        format: 'epub',
        size: file.size,
        lastRead: Date.now(),
        totalChapters: 0,
        readingProgress: 0,
        storageType: 'local',
        addedAt: Date.now()
      };
      
      // 保存到本地存储
      await addBook(ebookMetadata);
      
      return ebookMetadata;
    } catch (error) {
      console.error('导入 EPUB 文件失败:', error);
      return null;
    }
  }

  // 导入 PDF 文件
  const importPdfFile = async (file: File): Promise<EbookMetadata | null> => {
    try {
      // 生成唯一 ID
      const id = `pdf_${uuidv4()}`;
      
      // 将文件转换为 ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // 保存文件内容到 IndexedDB
      await localforage.setItem(`ebook_content_${id}`, arrayBuffer);
      
      // 创建电子书元数据
      const ebookMetadata: EbookMetadata = {
        id,
        title: file.name.replace('.pdf', ''),
        author: '未知作者',
        cover: '',
        path: id, // 使用 ID 作为路径，后续通过 ID 获取文件内容
        format: 'pdf',
        size: file.size,
        lastRead: Date.now(),
        totalChapters: 0,
        readingProgress: 0,
        storageType: 'local',
        addedAt: Date.now()
      };
      
      // 保存到本地存储
      await addBook(ebookMetadata);
      
      return ebookMetadata;
    } catch (error) {
      console.error('导入 PDF 文件失败:', error);
      return null;
    }
  }

  // 导入 TXT 文件
  const importTxtFile = async (file: File): Promise<EbookMetadata | null> => {
    try {
      // 生成唯一 ID
      const id = `txt_${uuidv4()}`;
      
      // 将文件转换为 ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // 保存文件内容到 IndexedDB
      await localforage.setItem(`ebook_content_${id}`, arrayBuffer);
      
      // 创建电子书元数据
      const ebookMetadata: EbookMetadata = {
        id,
        title: file.name.replace('.txt', ''),
        author: '未知作者',
        cover: '',
        path: id, // 使用 ID 作为路径，后续通过 ID 获取文件内容
        format: 'txt',
        size: file.size,
        lastRead: Date.now(),
        totalChapters: 1,
        readingProgress: 0,
        storageType: 'local',
        addedAt: Date.now()
      };
      
      // 保存到本地存储
      await addBook(ebookMetadata);
      
      return ebookMetadata;
    } catch (error) {
      console.error('导入 TXT 文件失败:', error);
      return null;
    }
  }

  // 导入电子书文件
  const importEbookFile = async (file: File): Promise<EbookMetadata | null> => {
    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      
      if (!fileExtension) {
        console.error('无法获取文件扩展名');
        throw new Error('无法获取文件扩展名');
      }
      
      switch (fileExtension) {
        case 'epub':
          return await importEpubFile(file);
        case 'pdf':
          return await importPdfFile(file);
        case 'txt':
          return await importTxtFile(file);
        default:
          console.error('不支持的文件格式:', fileExtension);
          throw new Error(`不支持的文件格式: ${fileExtension}`);
      }
    } catch (error) {
      console.error('导入电子书文件失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      return null;
    }
  };

  // 初始化函数
  const initialize = async () => {
    await loadBooks();
    await loadUserConfig();
  };

  return {
    // 状态
    books,
    currentBook,
    readingProgress,
    userConfig,
    deviceInfo,
    
    // 计算属性
    localBooks,
    baidupanBooks,
    recentBooks,
    
    // 方法
    loadBooks,
    saveBooks,
    addBook,
    updateBook,
    removeBook,
    getBookById,
    setCurrentBook,
    loadReadingProgress,
    saveReadingProgress,
    loadUserConfig,
    saveUserConfig,
    updateUserConfig,
    syncReadingProgress,
    syncReadingProgressFromBaidupan,
    importEpubFile,
    importPdfFile,
    importTxtFile,
    importEbookFile,
    authorizeBaidupan,
    uploadToBaidupan,
    uploadLocalBookToBaidupan,
    downloadFromBaidupan,
    listBaidupanFiles,
    isBaidupanTokenValid,
    updateBaidupanApiConfig,
    initialize
  };
});
