import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import localforage from 'localforage'
import ePub from 'epubjs'
import { v4 as uuidv4 } from 'uuid'

// 定义分类类型
export interface BookCategory {
  id: string;
  name: string;
  color: string;
  bookIds: string[];
  createdAt: number;
  updatedAt: number;
}

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
  categoryId?: string;
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
  const categories = ref<BookCategory[]>([]);
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

  // 分类相关计算属性
  const getBooksByCategory = computed(() => {
    return (categoryId: string) => {
      return books.value.filter(book => book.categoryId === categoryId);
    };
  });

  const getCategoryById = computed(() => {
    return (categoryId: string) => {
      return categories.value.find(category => category.id === categoryId) || null;
    };
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
        
        // 为EPUB书籍重新生成封面（并行处理）
        await Promise.all(books.value.map(async (book) => {
          if (book.cover && book.cover.startsWith('blob:')) {
            console.log('清除失效的 blob 封面链接:', book.id);
            book.cover = '';
          }
          
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
                  if (coverUrl.startsWith('blob:')) {
                    try {
                      console.log('将重新生成的封面转换为 Base64');
                      book.cover = await blobToBase64(coverUrl);
                      console.log('封面重新生成并转换成功:', book.id);
                      URL.revokeObjectURL(coverUrl);
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
        }));
        
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
          categoryId: book.categoryId,
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

  // 加载分类列表
  const loadCategories = async () => {
    try {
      console.log('开始加载分类列表...');
      const savedCategories = await localforage.getItem<BookCategory[]>('categories');
      
      if (savedCategories && Array.isArray(savedCategories) && savedCategories.length > 0) {
        console.log('成功加载分类列表，分类数量:', savedCategories.length);
        // 确保数据是干净的纯对象
        categories.value = savedCategories.map(category => ({
          id: category.id || `category_${Date.now()}_${Math.random()}`,
          name: category.name || '未命名',
          color: category.color || '#999999',
          bookIds: Array.isArray(category.bookIds) ? [...category.bookIds] : [],
          createdAt: category.createdAt || Date.now(),
          updatedAt: category.updatedAt || Date.now()
        }));
      } else {
        console.log('未找到保存的分类列表或分类为空，创建默认分类');
        categories.value = [];
        // 直接设置默认分类，不调用addCategory以避免可能的递归问题
        const defaultCategory: BookCategory = {
          id: `category_default_${Date.now()}`,
          name: '未分类',
          color: '#999999',
          bookIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        categories.value.push(defaultCategory);
        // 保存到本地存储
        await localforage.setItem('categories', [defaultCategory]);
        console.log('默认分类创建成功');
      }
    } catch (error) {
      console.error('加载分类列表失败:', error);
      // 出错时初始化为默认分类
      categories.value = [];
      const defaultCategory: BookCategory = {
        id: `category_default_${Date.now()}`,
        name: '未分类',
        color: '#999999',
        bookIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      categories.value.push(defaultCategory);
      try {
        await localforage.setItem('categories', [defaultCategory]);
      } catch (e) {
        console.error('保存默认分类失败:', e);
      }
    }
  };

  // 保存分类列表
  const saveCategories = async () => {
    try {
      console.log('正在保存分类列表，分类数量:', categories.value.length);
      console.log('分类列表内容:', JSON.stringify(categories.value));
      
      // 确保数据是可序列化的
      const categoriesToSave = categories.value.map(category => ({
        id: category.id,
        name: category.name,
        color: category.color,
        bookIds: Array.isArray(category.bookIds) ? [...category.bookIds] : [],
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      }));
      
      console.log('准备保存的分类数据:', JSON.stringify(categoriesToSave));
      
      await localforage.setItem('categories', categoriesToSave);
      
      // 验证保存是否成功
      const savedData = await localforage.getItem('categories');
      console.log('验证保存结果:', savedData);
      
      if (savedData && Array.isArray(savedData) && savedData.length === categoriesToSave.length) {
        console.log('分类列表保存成功，验证通过');
      } else {
        console.error('分类列表保存验证失败');
      }
    } catch (error) {
      console.error('保存分类列表失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      throw error;
    }
  };

  // 添加分类
  const addCategory = async (name: string, color: string) => {
    try {
      console.log('开始添加分类:', name, color);
      
      const newCategory: BookCategory = {
        id: `category_${uuidv4()}`,
        name,
        color,
        bookIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      console.log('新分类对象:', newCategory);
      
      categories.value.push(newCategory);
      
      console.log('分类已添加到内存，当前分类数量:', categories.value.length);
      console.log('准备保存分类到本地存储...');
      
      await saveCategories();
      
      console.log('分类添加成功:', newCategory.name);
      return newCategory;
    } catch (error) {
      console.error('添加分类失败:', error);
      if (error instanceof Error) {
        console.error('错误详情:', error.message);
        console.error('错误堆栈:', error.stack);
      }
      throw error; // 重新抛出错误，让调用方知道失败
    }
  };

  // 更新分类
  const updateCategory = async (categoryId: string, updates: Partial<BookCategory>) => {
    try {
      const index = categories.value.findIndex(category => category.id === categoryId);
      if (index !== -1) {
        categories.value[index] = {
          ...categories.value[index],
          ...updates,
          updatedAt: Date.now()
        };
        await saveCategories();
        console.log('分类更新成功:', categories.value[index].name);
        return true;
      }
      return false;
    } catch (error) {
      console.error('更新分类失败:', error);
      return false;
    }
  };

  // 删除分类
  const deleteCategory = async (categoryId: string) => {
    try {
      const index = categories.value.findIndex(category => category.id === categoryId);
      if (index !== -1) {
        const categoryName = categories.value[index].name;
        
        // 将该分类下的书籍移动到未分类
        const uncategorized = categories.value.find(cat => cat.name === '未分类');
        if (uncategorized) {
          for (const bookId of categories.value[index].bookIds) {
            const bookIndex = books.value.findIndex(book => book.id === bookId);
            if (bookIndex !== -1) {
              books.value[bookIndex].categoryId = uncategorized.id;
            }
          }
          await saveBooks();
        }
        
        categories.value.splice(index, 1);
        await saveCategories();
        
        console.log('分类删除成功:', categoryName);
        return true;
      }
      return false;
    } catch (error) {
      console.error('删除分类失败:', error);
      return false;
    }
  };

  // 将书籍添加到分类
  const addBookToCategory = async (bookId: string, categoryId: string) => {
    try {
      // 更新书籍的分类ID
      const bookIndex = books.value.findIndex(book => book.id === bookId);
      if (bookIndex !== -1) {
        // 从原分类中移除
        if (books.value[bookIndex].categoryId) {
          const oldCategoryIndex = categories.value.findIndex(cat => cat.id === books.value[bookIndex].categoryId);
          if (oldCategoryIndex !== -1) {
            categories.value[oldCategoryIndex].bookIds = categories.value[oldCategoryIndex].bookIds.filter(id => id !== bookId);
            categories.value[oldCategoryIndex].updatedAt = Date.now();
          }
        }
        
        // 添加到新分类
        books.value[bookIndex].categoryId = categoryId;
        
        const categoryIndex = categories.value.findIndex(cat => cat.id === categoryId);
        if (categoryIndex !== -1 && !categories.value[categoryIndex].bookIds.includes(bookId)) {
          categories.value[categoryIndex].bookIds.push(bookId);
          categories.value[categoryIndex].updatedAt = Date.now();
        }
        
        await saveBooks();
        await saveCategories();
        
        console.log('书籍添加到分类成功:', bookId, '->', categoryId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('添加书籍到分类失败:', error);
      return false;
    }
  };

  // 从分类中移除书籍
  const removeBookFromCategory = async (bookId: string) => {
    try {
      const bookIndex = books.value.findIndex(book => book.id === bookId);
      if (bookIndex !== -1 && books.value[bookIndex].categoryId) {
        const categoryId = books.value[bookIndex].categoryId;
        
        // 从分类中移除
        const categoryIndex = categories.value.findIndex(cat => cat.id === categoryId);
        if (categoryIndex !== -1) {
          categories.value[categoryIndex].bookIds = categories.value[categoryIndex].bookIds.filter(id => id !== bookId);
          categories.value[categoryIndex].updatedAt = Date.now();
        }
        
        // 移除书籍的分类ID
        books.value[bookIndex].categoryId = undefined;
        
        await saveBooks();
        await saveCategories();
        
        console.log('书籍从分类中移除成功:', bookId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('从分类中移除书籍失败:', error);
      return false;
    }
  };

  // 搜索书籍
  const searchBooks = async (keyword: string): Promise<EbookMetadata[]> => {
    try {
      console.log('开始搜索书籍，关键字:', keyword);
      
      // 本地搜索
      const localResults = books.value.filter(book => {
        return book.title.toLowerCase().includes(keyword.toLowerCase()) ||
               book.author.toLowerCase().includes(keyword.toLowerCase());
      });
      
      console.log('本地搜索结果数量:', localResults.length);
      
      // 如果有百度网盘令牌，也在百度网盘中搜索
      const tokenValid = await ensureBaidupanToken();
      console.log('百度网盘令牌是否有效:', tokenValid);
      
      if (tokenValid) {
        const { accessToken, rootPath } = userConfig.value.storage.baidupan;
        const searchUrl = `${baidupanApiConfig.apiUrl}/search`;
        // 使用用户配置的搜索路径，如果没有配置则使用默认路径
        const searchDir = rootPath || `/apps/${AppName}`;
        const fullUrl = `${searchUrl}?access_token=${accessToken}&key=${encodeURIComponent(keyword)}&dir=${encodeURIComponent(searchDir)}&recursion=1`;
        console.log('搜索URL:', fullUrl);
        console.log('搜索目录:', searchDir);
        
        try {
          const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('百度网盘搜索结果:', data);
            
            if (data.list && Array.isArray(data.list) && data.list.length > 0) {
              // 处理百度网盘搜索结果
              for (const fileInfo of data.list) {
                if (!fileInfo.server_filename) continue;
                
                // 检查是否是支持的电子书格式
                const ext = fileInfo.server_filename.split('.').pop()?.toLowerCase();
                if (['epub', 'pdf', 'txt'].includes(ext || '')) {
                  // 检查是否已经在本地列表中
                  const existingBook = books.value.find(book => 
                    book.baidupanPath === fileInfo.path
                  );
                  
                  if (!existingBook) {
                    // 创建新的书籍元数据
                    const newBook: EbookMetadata = {
                      id: `baidupan_${fileInfo.fs_id || Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      title: fileInfo.server_filename.replace(`.${ext}`, ''),
                      author: '未知作者',
                      cover: '',
                      path: fileInfo.path || '',
                      format: ext || 'txt',
                      size: fileInfo.size || 0,
                      lastRead: Date.now(),
                      totalChapters: 0,
                      readingProgress: 0,
                      storageType: 'baidupan',
                      baidupanPath: fileInfo.path || '',
                      addedAt: Date.now()
                    };
                    
                    // 添加到搜索结果
                    localResults.push(newBook);
                    console.log('添加百度网盘搜索结果:', newBook.title);
                  }
                }
              }
            } else {
              console.log('百度网盘中没有找到匹配的电子书');
            }
          } else {
            console.warn('百度网盘搜索API响应异常:', response.status);
          }
        } catch (fetchError) {
          console.warn('百度网盘搜索请求失败，跳过网盘搜索:', fetchError);
          // 继续使用本地搜索结果
        }
      } else {
        console.log('百度网盘令牌无效，跳过网盘搜索');
      }
      
      console.log('搜索完成，总结果数量:', localResults.length);
      return localResults;
    } catch (error) {
      console.error('搜索书籍失败:', error);
      // 出错时返回空数组
      return [];
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

  // 应用名称，用于百度网盘搜索路径
  const AppName = 'Neat Reader';

  // 百度网盘 API 配置
  const baidupanApiConfig = {
    clientId: 'WreV7F9LXSzyYOQzzP7Ih1UmvuDxN763', // 替换为真实的 App Key
    clientSecret: 'hNAobFVEevG7kseZry9xq3LM6jxoWSLz', // 替换为真实的 App Secret
    redirectUri: 'http://localhost:8080/callback', // 替换为真实的回调地址
    apiUrl: 'http://localhost:3001/api/baidu/pan', // 使用代理服务
    oauthUrl: 'http://localhost:3001/api/baidu/oauth' // 使用代理服务
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
    // 确保accessToken存在且未过期
    return !!accessToken && expiration > Date.now();
  };

  // 确保百度网盘令牌有效
  const ensureBaidupanToken = async (): Promise<boolean> => {
    if (isBaidupanTokenValid()) {
      return true;
    }
    return await refreshBaidupanToken();
  };

  // 检查文件大小限制
  const checkFileSizeLimit = (fileSize: number): boolean => {
    const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024;
    
    if (fileSize > MAX_FILE_SIZE) {
      console.error(`文件大小超过限制，最大支持 ${(MAX_FILE_SIZE / (1024 * 1024 * 1024)).toFixed(1)}GB`);
      return false;
    }
    
    return true;
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
      
      console.log('开始同步阅读进度，书籍总数:', books.value.length);
      
      // 1. 上传书籍列表
      const booksData = {
        ebooks: books.value,
        timestamp: Date.now(),
        deviceId: deviceInfo.value.id,
        deviceName: deviceInfo.value.name
      };
      const booksFile = new File([JSON.stringify(booksData)], 'books.json', { type: 'application/json' });
      await uploadToBaidupanNew(booksFile, '/sync');
      
      // 2. 上传分类列表
      const categoriesData = {
        categories: categories.value,
        timestamp: Date.now(),
        deviceId: deviceInfo.value.id
      };
      const categoriesFile = new File([JSON.stringify(categoriesData)], 'categories.json', { type: 'application/json' });
      await uploadToBaidupanNew(categoriesFile, '/sync');
      console.log('分类列表已同步到百度网盘');
      
      // 3. 批量上传进度文件（每本书一个文件）
      let syncedCount = 0;
      const batchSize = 10; // 每批处理10本书
      
      for (let i = 0; i < books.value.length; i += batchSize) {
        const batch = books.value.slice(i, i + batchSize);
        const batchPromises = batch.map(async (book) => {
          try {
            const progress = await localforage.getItem<ReadingProgress>(`progress_${book.id}`);
            if (progress) {
              const progressFile = new File([JSON.stringify(progress)], `${book.id}.json`, { type: 'application/json' });
              await uploadToBaidupanNew(progressFile, `/sync/progress`);
              syncedCount++;
            }
          } catch (error) {
            console.error(`同步书籍进度失败: ${book.id}`, error);
          }
        });
        
        await Promise.all(batchPromises);
      }
      
      console.log(`同步阅读进度到百度网盘成功，同步了 ${syncedCount} 本书的进度`);
      return true;
    } catch (error) {
      console.error('同步阅读进度到百度网盘失败:', error);
      return false;
    }
  };

  // 只同步当前书籍的阅读进度到百度网盘（异步，不等待响应）
  const syncCurrentBookProgress = (ebookId: string) => {
    if (!isBaidupanTokenValid()) {
      return;
    }
    
    console.log('异步同步当前书籍进度到百度网盘:', ebookId);
    
    // 异步执行，不等待响应
    (async () => {
      try {
        const progress = await localforage.getItem<ReadingProgress>(`progress_${ebookId}`);
        if (progress) {
          const progressFile = new File([JSON.stringify(progress)], `${ebookId}.json`, { type: 'application/json' });
          await uploadToBaidupanNew(progressFile, `/sync/progress`);
          console.log('当前书籍进度同步成功:', ebookId);
        }
      } catch (error) {
        console.warn('同步当前书籍进度失败:', error);
      }
    })();
  };

  // 从百度网盘同步阅读进度
  const syncReadingProgressFromBaidupan = async (): Promise<boolean> => {
    try {
      // 确保令牌有效
      if (!await ensureBaidupanToken()) {
        console.error('百度网盘令牌无效，无法同步');
        return false;
      }
      
      console.log('开始从百度网盘同步阅读进度');
      
      // 1. 下载书籍列表
      const booksBlob = await downloadFromBaidupan('/sync/books.json');
      if (booksBlob) {
        const booksText = await booksBlob.text();
        const booksData = JSON.parse(booksText);
        if (booksData.ebooks) {
          books.value = booksData.ebooks;
          await saveBooks();
          console.log('同步书籍列表成功，书籍总数:', books.value.length);
        }
      }
      
      // 2. 下载分类列表
      const categoriesBlob = await downloadFromBaidupan('/sync/categories.json');
      if (categoriesBlob) {
        const categoriesText = await categoriesBlob.text();
        const categoriesData = JSON.parse(categoriesText);
        if (categoriesData.categories) {
          categories.value = categoriesData.categories;
          await saveCategories();
          console.log('同步分类列表成功，分类总数:', categories.value.length);
        }
      }
      
      // 3. 下载并同步每本书的进度
      let syncedCount = 0;
      
      for (const book of books.value) {
        try {
          const progressBlob = await downloadFromBaidupan(`/sync/progress/${book.id}.json`);
          if (progressBlob) {
            const progressText = await progressBlob.text();
            const progress = JSON.parse(progressText);
            await localforage.setItem(`progress_${book.id}`, progress);
            // 如果是当前书籍，更新内存中的进度
            if (book.id === readingProgress.value?.ebookId) {
              readingProgress.value = progress;
            }
            syncedCount++;
          }
        } catch (error) {
          console.error(`同步书籍进度失败: ${book.id}`, error);
        }
      }
      
      console.log(`从百度网盘同步阅读进度成功，同步了 ${syncedCount} 本书的进度`);
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
    await Promise.all([
      loadBooks(),
      loadUserConfig(),
      loadCategories()
    ]);
  };

  return {
    // 状态
    books,
    categories,
    currentBook,
    readingProgress,
    userConfig,
    deviceInfo,
    
    // 计算属性
    localBooks,
    baidupanBooks,
    recentBooks,
    getBooksByCategory,
    getCategoryById,
    
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
    loadCategories,
    saveCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    addBookToCategory,
    removeBookFromCategory,
    searchBooks,
    syncReadingProgress,
    syncReadingProgressFromBaidupan,
    importEpubFile,
    importPdfFile,
    importTxtFile,
    importEbookFile,
    uploadLocalBookToBaidupan,
    downloadFromBaidupan,
    listBaidupanFiles,
    isBaidupanTokenValid,
    syncCurrentBookProgress,
    initialize
  };
});
