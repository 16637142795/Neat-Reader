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
  cfi: string; // 精确的CFI位置
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
      namingStrategy: string; // 文件命名策略: 0 不重命名, 1 重命名, 2 条件重命名, 3 覆盖
    };
  };
  reader: {
    fontSize: number;
    fontFamily: string;
    theme: 'light' | 'sepia' | 'dark';
    pageMode: 'page' | 'scroll';
    brightness: number;
    lineSpacing: number;
    lineHeight: number;
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
        rootPath: '',
        userId: '',
        namingStrategy: '1' // 默认使用重命名策略
      }
    },
    reader: {
      fontSize: 18,
      fontFamily: 'system',
      theme: 'light',
      pageMode: 'page',
      brightness: 100,
      lineSpacing: 1.5,
      lineHeight: 1.5,
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

  // Blob URL 转 Base64 工具函数
  const blobToBase64 = (blobUrl: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      } catch (e) {
        reject(e);
      }
    });
  };

  // 方法
  const loadBooks = async () => {
    try {
      console.log('开始加载书籍列表...');
      const savedBooks = await localforage.getItem<EbookMetadata[]>('books');
      
      if (savedBooks) {
        console.log('成功加载书籍列表，书籍数量:', savedBooks.length);
        books.value = savedBooks;
        
        // 为EPUB书籍重新生成封面
        for (const book of books.value) {
          // 检查封面是否为失效的 blob 链接
          if (book.cover && book.cover.startsWith('blob:')) {
            console.log('清除失效的 blob 封面链接:', book.id);
            book.cover = ''; // 清除失效链接，触发下方的重新生成逻辑
          }
          
          // 为没有封面的 EPUB 书籍重新生成封面
          if (book.format === 'epub' && !book.cover) {
            try {
              console.log('为书籍重新生成封面:', book.id);
              const fileContent = await localforage.getItem<ArrayBuffer>(`ebook_content_${book.id}`);
              if (fileContent) {
                const epubBook = ePub(fileContent);
                await new Promise((resolve, reject) => {
                  epubBook.ready.then(resolve).catch(reject);
                });
                const coverUrl = await epubBook.coverUrl();
                if (coverUrl) {
                  // 如果是 blob URL，转换为 Base64 持久化存储
                  if (coverUrl.startsWith('blob:')) {
                    try {
                      console.log('将重新生成的封面转换为 Base64');
                      book.cover = await blobToBase64(coverUrl);
                      console.log('封面重新生成并转换成功:', book.id);
                      // 释放 Blob 内存
                      URL.revokeObjectURL(coverUrl);
                      // 立即保存更新后的封面
                      await saveBooks();
                    } catch (e) {
                      console.warn('封面转换 Base64 失败:', e);
                    }
                  } else {
                    book.cover = coverUrl;
                    console.log('封面重新生成成功:', book.id);
                  }
                }
              }
            } catch (e) {
              console.warn('封面重新生成失败:', book.id, e);
            }
          }
        }
        
        // 验证加载的数据
        if (books.value.length > 0) {
          console.log('加载的书籍示例:', {
            id: books.value[0].id,
            title: books.value[0].title,
            author: books.value[0].author,
            cover: books.value[0].cover,
            storageType: books.value[0].storageType
          });
        }
      } else {
        console.log('未找到保存的书籍列表，初始化为空数组');
        books.value = [];
      }
    } catch (error) {
      console.error('加载电子书列表失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      // 出错时初始化为空数组
      books.value = [];
    }
  };

  const saveBooks = async () => {
    try {
      // 保存书籍列表，确保数据可序列化
      const booksToSave = books.value.map(book => {
        // 创建可序列化的书籍对象
        const serializableBook: EbookMetadata = {
          id: book.id,
          title: book.title,
          author: book.author,
          cover: book.cover || '', // 确保封面字段存在，如果是blob URL会在加载时重新生成
          path: book.path,
          format: book.format,
          size: book.size,
          lastRead: book.lastRead,
          totalChapters: book.totalChapters,
          readingProgress: book.readingProgress,
          storageType: book.storageType,
          baidupanPath: book.baidupanPath,
          addedAt: book.addedAt
        };
        
        return serializableBook;
      });
      
      console.log('正在保存书籍列表，书籍数量:', booksToSave.length);
      
      await localforage.setItem('books', booksToSave);
      console.log('书籍列表保存成功');
    } catch (error) {
      console.error('保存电子书列表失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
    }
  };

  const addBook = async (book: EbookMetadata) => {
    try {
      console.log('添加书籍到列表:', book.title);
      books.value.push(book);
      
      // 立即保存到持久化存储
      await saveBooks();
      
      console.log('书籍添加并保存成功');
    } catch (error) {
      console.error('添加书籍失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      throw error; // 重新抛出错误，让调用方知道操作失败
    }
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
      // 1. 找到索引
      const index = books.value.findIndex(book => book.id === bookId);
      if (index === -1) return false;

      const actualStorageType = storageType || books.value[index].storageType;

      // 2. 使用 splice 显式触发 Vue 响应式（更稳健）
      books.value.splice(index, 1);
      
      // 3. 异步执行持久化清理，不阻塞 UI 响应
      saveBooks(); 

      if (actualStorageType === 'local') {
        localforage.removeItem(`ebook_content_${bookId}`);
        localforage.removeItem(`ebook_cover_${bookId}`);
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
        readingProgress: Math.round(progress.position * 100)
      });
    } catch (error) {
      console.error('保存阅读进度失败:', error);
    }
  };

  const loadUserConfig = async () => {
    try {
      const config = await localforage.getItem<UserConfig>('userConfig');
      if (config) {
        // 如果rootPath是'/NeatReader'，则将其重置为空字符串，符合百度网盘API要求
        if (config.storage.baidupan.rootPath === '/NeatReader') {
          config.storage.baidupan.rootPath = '';
        }
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

  // 添加 MD5 计算工具函数
  const calculateMD5 = async (file: File): Promise<string> => {
    // 使用纯JavaScript实现MD5，避免浏览器SubtleCrypto API不支持MD5的问题
    const md5 = (buffer: ArrayBuffer): string => {
      const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
      const bytes = new Uint8Array(buffer);
      let h0 = 0x67452301;
      let h1 = 0xefcdab89;
      let h2 = 0x98badcfe;
      let h3 = 0x10325476;
      
      const appendPadding = (bytes: Uint8Array): Uint8Array => {
        const originalLength = bytes.length;
        const paddingLength = (56 - (originalLength + 1) % 64 + 64) % 64;
        const newBytes = new Uint8Array(originalLength + 1 + paddingLength + 8);
        newBytes.set(bytes);
        newBytes[originalLength] = 0x80;
        
        let bitLength = originalLength * 8;
        for (let i = 0; i < 8; i++) {
          newBytes[newBytes.length - 1 - i] = bitLength >>> (i * 8);
        }
        
        return newBytes;
      };
      
      const chunks = appendPadding(bytes);
      
      for (let i = 0; i < chunks.length; i += 64) {
        const chunk = chunks.slice(i, i + 64);
        const w = new Array(64);
        
        for (let j = 0; j < 16; j++) {
          w[j] = chunk[j * 4] << 24 | chunk[j * 4 + 1] << 16 | chunk[j * 4 + 2] << 8 | chunk[j * 4 + 3];
        }
        
        for (let j = 16; j < 64; j++) {
          const s0 = (w[j - 15] >>> 7 | w[j - 15] << 25) ^ (w[j - 15] >>> 18 | w[j - 15] << 14) ^ (w[j - 15] >>> 3);
          const s1 = (w[j - 2] >>> 17 | w[j - 2] << 15) ^ (w[j - 2] >>> 19 | w[j - 2] << 13) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
        }
        
        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        
        for (let j = 0; j < 64; j++) {
          const S1 = (b >>> 6 | b << 26) ^ (b >>> 11 | b << 21) ^ (b >>> 25 | b << 7);
          const ch = (b & c) ^ (~b & d);
          const temp1 = (d + S1 + ch + K[j] + w[j]) >>> 0;
          const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const temp2 = (S0 + maj) >>> 0;
          
          d = c;
          c = b;
          b = (a + temp1) >>> 0;
          a = (temp1 + temp2) >>> 0;
        }
        
        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
      }
      
      const toHex = (n: number): string => {
        return n.toString(16).padStart(8, '0');
      };
      
      return (toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3)).toLowerCase();
    };
    
    const buffer = await file.arrayBuffer();
    return md5(buffer);
  };

  // 获取上传域名
  const getUploadDomain = async (path: string, uploadid: string): Promise<string> => {
    try {
      const { accessToken } = userConfig.value.storage.baidupan;
      const locateUrl = `${baidupanApiConfig.apiUrl}/locateupload`;
      
      const response = await fetch(`${locateUrl}?path=${encodeURIComponent(path)}&uploadid=${encodeURIComponent(uploadid)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      const data = await response.json();
      console.log('获取上传域名响应:', data);
      
      if (data.error_code) {
        console.error('获取上传域名失败:', data);
        // 返回默认域名作为备选
        return 'https://d.pcs.baidu.com';
      }
      
      // 优先使用 servers 中的第一个 https 域名
      if (data.servers && data.servers.length > 0) {
        for (const server of data.servers) {
          if (server.server && server.server.startsWith('https://')) {
            return server.server;
          }
        }
      }
      
      // 如果没有 https 域名，返回默认域名
      return 'https://d.pcs.baidu.com';
    } catch (error) {
      console.error('获取上传域名失败:', error);
      // 出错时返回默认域名
      return 'https://d.pcs.baidu.com';
    }
  };

  // 检查文件大小限制
  const checkFileSizeLimit = (fileSize: number): boolean => {
    // 百度网盘文件大小限制：
    // 普通用户：4GB
    // 会员用户：10GB
    // 超级会员用户：20GB
    
    // 由于无法直接获取用户会员状态，使用最保守的限制（普通用户）
    const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
    
    if (fileSize > MAX_FILE_SIZE) {
      console.error(`文件大小超过限制，最大支持 ${(MAX_FILE_SIZE / (1024 * 1024 * 1024)).toFixed(1)}GB`);
      return false;
    }
    
    return true;
  };
  
  // 规范路径编码
  const encodePath = (path: string): string => {
    // 对路径进行URL编码，但保留路径分隔符
    const parts = path.split('/');
    const encodedParts = parts.map(part => encodeURIComponent(part));
    return encodedParts.join('/');
  };
  
  // 上传文件到百度网盘
  const uploadToBaidupan = async (file: File, path: string): Promise<boolean> => {
    try {
      // 确保令牌有效
      if (!await ensureBaidupanToken()) {
        return false;
      }
      
      // 检查文件大小限制
      if (!checkFileSizeLimit(file.size)) {
        return false;
      }
      
      const { accessToken } = userConfig.value.storage.baidupan;
      
      // 计算文件的 MD5，用于预创建请求和块列表
      const fileMd5 = await calculateMD5(file);
      
      // 构建路径，直接使用相对路径，服务器端会添加/apps/网盘前缀
      // 修复正则表达式，正确匹配开头或结尾的斜杠
      const relativePath = path ? path.replace(/^\/+|\/+$/g, '') : '';
      const finalPath = relativePath ? `/${relativePath}` : '';
      const filePath = `${finalPath}/${file.name}`;
      console.log('文件路径:', filePath);
      console.log('相对路径:', relativePath);
      console.log('最终路径:', finalPath);
      
      // 注意：不再对路径进行URL编码，让服务器端统一处理编码
      const encodedFilePath = filePath;
      console.log('文件路径:', encodedFilePath);
      
      // 获取文件命名策略
      const namingStrategy = userConfig.value.storage.baidupan.namingStrategy || '1';
      console.log('文件命名策略:', namingStrategy);
      
      // 上传参数，确保各阶段使用相同的参数
      const uploadParams = {
        path: encodedFilePath,
        size: file.size.toString(),
        isdir: '0',
        rtype: namingStrategy // 文件命名策略：0 不重命名, 1 重命名, 2 条件重命名, 3 覆盖
      };
      
      // 只有当目录路径不为空时才创建目录
      if (finalPath) {
        const mkdirUrl = `${baidupanApiConfig.apiUrl}/mkdir`;
        console.log('创建目录请求URL:', mkdirUrl);
        console.log('要创建的目录路径:', finalPath);
        
        // 对目录路径进行编码
        const encodedFinalPath = encodePath(finalPath);
        console.log('编码后的目录路径:', encodedFinalPath);
        
        const mkdirResponse = await fetch(mkdirUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${accessToken}`
          },
          body: new URLSearchParams({
            path: encodedFinalPath,
            isdir: '1',
            rtype: '0'
          })
        });
        
        const mkdirData = await mkdirResponse.json();
        console.log('创建目录响应:', mkdirData);
        
        // 处理创建目录错误
        if (mkdirData.error_code) {
          if (mkdirData.error_code === -7) {
            console.error('文件或目录名错误或无权访问');
            return false;
          } else if (mkdirData.error_code === -8) {
            console.error('文件或目录已存在');
            // 可以继续执行，因为我们使用了重命名策略
          } else if (mkdirData.error_code === -10) {
            console.error('云端容量已满');
            return false;
          } else if (mkdirData.error_code !== 113) {
            console.error('创建目录失败:', mkdirData);
            return false;
          }
        }
      } else {
        console.log('目录路径为空，跳过创建目录操作');
      }
      
      // 分片大小：4MB
      const CHUNK_SIZE = 4 * 1024 * 1024;
      // 计算分片数量
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      console.log('文件大小:', file.size, '分片大小:', CHUNK_SIZE, '分片数量:', totalChunks);
      
      // 计算每个分片的MD5值
      const blockList: string[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const chunkMd5 = await calculateMD5(chunk);
        blockList.push(chunkMd5);
        console.log(`分片 ${i} MD5:`, chunkMd5);
      }
      
      // 第一步：预创建文件（使用代理服务）
      const precreateUrl = `${baidupanApiConfig.apiUrl}/precreate`;
      console.log('预创建上传请求URL:', precreateUrl);
      
      const precreateResponse = await fetch(precreateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${accessToken}`
        },
        body: new URLSearchParams({
          path: uploadParams.path,
          size: uploadParams.size,
          isdir: uploadParams.isdir,
          autoinit: '1',
          rtype: uploadParams.rtype,
          block_list: JSON.stringify(blockList) // 预创建请求中添加块列表
        })
      });
      
      const precreateData = await precreateResponse.json();
      console.log('预创建上传响应:', precreateData);
      
      // 解码预创建响应中的路径，以便查看实际路径
      if (precreateData.path) {
        try {
          const decodedPath = decodeURIComponent(precreateData.path);
          console.log('预创建响应中的路径（编码）:', precreateData.path);
          console.log('预创建响应中的路径（解码）:', decodedPath);
        } catch (e) {
          console.error('解码路径失败:', e);
        }
      }
      
      if (precreateData.error_code) {
        if (precreateData.error_code === -7) {
          console.error('文件或目录名错误或无权访问');
        } else if (precreateData.error_code === -10) {
          console.error('云端容量已满');
        } else {
          console.error('预创建文件失败:', precreateData);
        }
        return false;
      }
      
      // 检查是否需要上传分片
      console.log('预创建返回的 return_type:', precreateData.return_type);
      
      // 检查 return_type 是否存在
      if (precreateData.return_type === undefined) {
        console.warn('预创建返回的 return_type 未定义，尝试继续上传流程');
        // 即使 return_type 未定义，也要尝试继续上传流程
      } else if (precreateData.return_type === 1) {
        // 记录日志，但不直接返回
        console.log('预创建返回 return_type === 1，继续执行上传流程');
      } 
      
      // 无论 return_type 是什么，只要有 uploadid 就尝试继续上传流程
      const { uploadid } = precreateData;
      if (!uploadid) {
        console.error('预创建返回的 uploadid 为空');
        return false;
      }
      
      // 第二步：获取上传域名
      console.log('开始获取上传域名...');
      const uploadDomain = await getUploadDomain(filePath, uploadid);
      console.log('获取到的上传域名:', uploadDomain);
      
      // 第三步：分片上传
      console.log('开始分片上传...');
      const uploadedBlockList: string[] = [];
      
      for (let i = 0; i < totalChunks; i++) {
        console.log(`上传分片 ${i}/${totalChunks-1}`);
        
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const chunkFile = new File([chunk], `${file.name}.part${i}`, { type: file.type });
        
        // 上传分片（使用代理服务）
        const uploadUrl = `${baidupanApiConfig.apiUrl}/upload`;
        console.log('开始上传分片到代理服务:', uploadUrl);
        
        // 构建FormData
        const formData = new FormData();
        formData.append('file', chunkFile);
        formData.append('path', uploadParams.path);
        formData.append('uploadid', uploadid);
        formData.append('partseq', i.toString());
        formData.append('type', 'tmpfile');
        formData.append('uploadDomain', uploadDomain);
        
        console.log('发送分片上传请求...');
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: formData
        });
        
        if (!uploadResponse.ok) {
          console.error('上传分片失败:', uploadResponse.status, await uploadResponse.text());
          return false;
        }
        
        const uploadData = await uploadResponse.json();
        console.log('上传分片响应:', uploadData);
        
        // 检查分片上传是否成功
        if (uploadData.error_code) {
          if (uploadData.error_code === 31024) {
            console.error('没有申请上传权限，请在百度网盘开放平台申请开通上传权限');
          } else if (uploadData.error_code === 31299) {
            console.error('第一个分片的大小小于4MB，需要等于4MB');
          } else if (uploadData.error_code === 31364) {
            console.error('超出分片大小限制，建议以4MB作为上限');
          } else if (uploadData.error_code === 31363) {
            console.error('分片缺失，请检查分片是否全部上传，size大小是否正确');
          } else {
            console.error('分片上传失败:', uploadData);
          }
          return false;
        }
        
        // 收集分片的MD5值
        if (uploadData.md5) {
          console.log(`分片 ${i} 上传返回的MD5:`, uploadData.md5);
          uploadedBlockList.push(uploadData.md5);
        } else {
          // 如果没有返回MD5，使用之前计算的
          console.log(`分片 ${i} 使用计算的MD5:`, blockList[i]);
          uploadedBlockList.push(blockList[i]);
        }
      }
      
      // 第四步：创建文件
      console.log('开始创建文件...');
      const createUrl = `${baidupanApiConfig.apiUrl}/create`;
      console.log('创建文件请求URL:', createUrl);
      
      // 打印创建文件的请求参数，以便调试
      const createRequestBody = {
        path: uploadParams.path,
        size: uploadParams.size,
        isdir: uploadParams.isdir,
        block_list: uploadedBlockList, // 使用上传的块列表
        uploadid: uploadid,
        rtype: parseInt(uploadParams.rtype)
      };
      console.log('创建文件请求参数:', createRequestBody);
      
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(createRequestBody)
      });
      
      const createData = await createResponse.json();
      console.log('创建文件响应:', createData);
      
      if (createData.error_code) {
        if (createData.error_code === -7) {
          console.error('文件或目录名错误或无权访问');
        } else if (createData.error_code === -8) {
          console.error('文件或目录已存在');
        } else if (createData.error_code === -10) {
          console.error('云端容量已满');
        } else if (createData.error_code === 10) {
          console.error('创建文件失败，可能是分片问题或size大小不正确');
        } else if (createData.error_code === 31190) {
          console.error('文件不存在，可能是分片上传阶段有问题');
        } else if (createData.error_code === 31355) {
          console.error('参数异常，检查uploadid参数是否正确');
        } else if (createData.error_code === 31365) {
          console.error('文件总大小超限');
        } else {
          console.error('创建文件失败:', createData);
        }
        return false;
      }
      
      console.log('文件上传成功');
      return true;
    } catch (error) {
      console.error('上传文件到百度网盘失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      return false;
    }
  };

  const uploadToBaidupanNew = async (file: File, path: string): Promise<boolean> => {
    try {
      // 确保令牌有效
      if (!await ensureBaidupanToken()) {
        return false;
      }
      
      // 检查文件大小限制
      if (!checkFileSizeLimit(file.size)) {
        return false;
      }
      
      const { accessToken } = userConfig.value.storage.baidupan;
      
      // 构建路径，直接使用相对路径，服务器端会添加/apps/网盘前缀
      const relativePath = path ? path.replace(/^\/+|\/+$/g, '') : '';
      const filePath = relativePath ? `/${relativePath}/${file.name}` : `/${file.name}`;
      
      console.log('开始上传到Go服务器:', file.name, '相对路径:', relativePath);
      
      // 构建FormData发送文件到Go服务器
      const formData = new FormData();
      formData.append('accessToken', accessToken);
      formData.append('path', relativePath);
      formData.append('file', file);
      
      const uploadUrl = `${baidupanApiConfig.apiUrl}/upload`;
      console.log('上传URL:', uploadUrl);
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        console.error('上传失败:', response.status, await response.text());
        return false;
      }
      
      const result = await response.json();
      console.log('上传响应:', result);
      
      if (result.success) {
        console.log('文件上传成功:', result.path);
        return true;
      } else {
        console.error('文件上传失败，errno:', result.errno);
        return false;
      }
      
    } catch (error) {
      console.error('上传文件到百度网盘失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      return false;
    }
  };
  
  // 将本地书籍上传到百度网盘
  const uploadLocalBookToBaidupan = async (book: EbookMetadata): Promise<boolean> => {
    try {
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
      // 清理和规范化文件名，确保符合百度网盘的要求
      const cleanFileName = (name: string): string => {
        // 移除或替换不允许的字符
        let cleaned = name
          .replace(/[<>:"|?*\/\\]/g, '') // 移除不允许的特殊字符
          .replace(/\s+/g, '_') // 将空格替换为下划线
          .trim(); // 移除首尾空格
        
        // 限制文件名长度（百度网盘通常限制为255字符）
        if (cleaned.length > 200) {
          cleaned = cleaned.substring(0, 200);
        }
        
        return cleaned;
      };
      
      const fileName = `${cleanFileName(book.title)}.${book.format}`;
      const file = new File([fileContent], fileName, { 
        type: `application/${book.format === 'epub' ? 'epub+zip' : book.format}` 
      });
      console.log('创建 File 对象成功:', fileName);
      
      // 上传到百度网盘
      let uploadPath = userConfig.value.storage.baidupan.rootPath;
      // 确保uploadPath是有效的，避免生成//fileName这样的路径
      if (!uploadPath || uploadPath === '/') {
        uploadPath = '';
      }
      console.log('开始上传到百度网盘，路径:', uploadPath ? `${uploadPath}/${fileName}` : fileName);
      const uploadResult = await uploadToBaidupanNew(file, uploadPath);
      
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
      const result = await uploadToBaidupanNew(syncFile, '/sync');
      
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
      const syncDataBlob = await downloadFromBaidupan('/sync/sync.json');
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
      console.log('开始导入 EPUB 文件:', file.name);
      
      // 生成唯一 ID
      const id = `epub_${uuidv4()}`;
      
      // 将文件转换为 ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // 保存文件内容到 IndexedDB
      console.log('保存文件内容到 IndexedDB，键名:', `ebook_content_${id}`);
      await localforage.setItem(`ebook_content_${id}`, arrayBuffer);
      
      // 提取元数据（封面、作者、标题等）
      let coverData = '';
      let authorData = '未知作者';
      let titleData = file.name.replace('.epub', '');
      
      try {
        const book = ePub(arrayBuffer);
        // 等待书籍加载完成
        await new Promise((resolve, reject) => {
          book.ready.then(resolve).catch(reject);
        });
        
        // 提取书籍元数据
        const metadata = await book.loaded.metadata;
        console.log('EPUB 元数据:', metadata);
        
        // 提取作者
        if (metadata.creator) {
          if (Array.isArray(metadata.creator)) {
            authorData = metadata.creator.join(', ');
          } else {
            authorData = metadata.creator;
          }
        }
        
        // 提取标题
        if (metadata.title) {
          titleData = metadata.title;
        }
        
        // 获取封面 URL
        const coverUrl = await book.coverUrl();
        console.log('封面 URL:', coverUrl);
        if (coverUrl) {
          // 如果是 blob URL，转换为 Base64 持久化存储
          if (typeof coverUrl === 'string' && coverUrl.startsWith('blob:')) {
            try {
              console.log('将 Blob URL 转换为 Base64');
              coverData = await blobToBase64(coverUrl);
              console.log('封面转换成功，Base64 长度:', coverData.length);
              // 释放原有的 Blob 内存
              URL.revokeObjectURL(coverUrl);
            } catch (e) {
              console.warn('封面转换 Base64 失败:', e);
              coverData = '';
            }
          } else {
            // 对于相对路径或其他格式，直接使用
            coverData = coverUrl;
          }
        }
      } catch (e) {
        console.warn('元数据提取失败:', e);
      }
      
      // 创建电子书元数据
      const ebookMetadata: EbookMetadata = {
        id,
        title: titleData,
        author: authorData,
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
      
      console.log('创建电子书元数据:', {
        id: ebookMetadata.id,
        title: ebookMetadata.title,
        author: ebookMetadata.author,
        cover: ebookMetadata.cover,
        storageType: ebookMetadata.storageType
      });
      
      // 保存到本地存储
      await addBook(ebookMetadata);
      
      console.log('EPUB 文件导入成功');
      return ebookMetadata;
    } catch (error) {
      console.error('导入 EPUB 文件失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
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
