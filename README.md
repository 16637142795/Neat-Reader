# Neat Reader

一个简洁的电子书阅读器，支持 EPUB 和 PDF 格式，可无缝集成百度网盘。

## 功能特性

- **多格式支持**：支持 EPUB 和 PDF 电子书格式
- **百度网盘集成**：从百度网盘直接导入和管理电子书
- **阅读进度保存**：自动保存阅读进度，下次打开继续阅读
- **本地存储**：使用 localforage 实现离线数据存储
- **现代化界面**：基于 Vue 3 + TypeScript 的现代化架构
- **响应式设计**：支持不同尺寸的屏幕

## 技术栈

### 前端
- Vue 3 - 渐进式 JavaScript 框架
- TypeScript - 类型安全的 JavaScript 超集
- Vite - 下一代前端构建工具
- Pinia - Vue 状态管理库
- Vue Router - Vue.js 官方路由管理器
- epubjs - EPUB 电子书解析库
- pdfjs-dist - PDF 文档解析库
- localforage - 离线存储库
- dayjs - 轻量级日期处理库

### 后端
- Go - Google 开发的静态类型编程语言
- 处理百度网盘 API 请求代理

## 项目结构

```
neat-reader/
├── src/
│   ├── assets/
│   │   └── styles/
│   │       └── global.css       # 全局样式
│   ├── components/
│   │   └── Dialog/              # 对话框组件
│   ├── pages/
│   │   ├── Callback/            # OAuth 回调页面
│   │   ├── FileManager/         # 文件管理器页面
│   │   ├── Home/                # 首页
│   │   ├── Reader/              # 阅读器页面
│   │   └── Settings/            # 设置页面
│   ├── stores/
│   │   ├── dialog.ts            # 对话框状态管理
│   │   └── ebook.ts             # 电子书状态管理
│   ├── App.vue                  # 根组件
│   ├── main.ts                  # 应用入口
│   └── router.ts                # 路由配置
├── server/
│   └── main.go                  # Go 后端服务
├── package.json                 # 前端依赖配置
├── package.json.server          # 后端依赖配置
├── vite.config.ts               # Vite 配置
└── tsconfig.json                # TypeScript 配置
```

## 快速开始

### 前端安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 类型检查
npm run typecheck

# 预览生产版本
npm run preview
```

### 后端服务（百度网盘代理）

后端服务使用 Go 语言开发，用于处理百度网盘 API 请求。

```bash
# 安装 Go 依赖
cd server
go mod tidy

# 启动后端服务
go run main.go

# 后端服务默认运行在 http://localhost:3001
```

## 主要页面

### 首页 (Home)
展示阅读历史、快捷操作入口和阅读统计信息。

### 文件管理器 (FileManager)
管理本地和百度网盘中的电子书文件，支持：
- 浏览文件列表
- 搜索电子书
- 从百度网盘导入文件
- 上传文件到百度网盘

### 阅读器 (Reader)
核心阅读功能页面，支持：
- EPUB 格式：章节导航、字体调整、背景切换
- PDF 格式：缩放、翻页、页面跳转

### 设置 (Settings)
应用配置，包括：
- 主题设置
- 阅读偏好设置
- 百度网盘账户管理
- 数据同步设置

### 回调页面 (Callback)
处理百度网盘 OAuth 2.0 授权回调。

## 百度网盘 API 配置

### 获取 API 密钥

1. 前往[百度开放平台](https://open.baidu.com/)创建应用
2. 获取 `Client ID` 和 `Client Secret`
3. 配置回调地址为 `http://localhost:8080/callback`

### 配置后端服务

编辑 `server/main.go` 文件，配置以下变量：

```go
var (
    ClientID     = "your_app_key"                   // 百度网盘 App Key
    ClientSecret = "your_client_secret"             // 百度网盘 App Secret
    RedirectURI  = "http://localhost:8080/callback" // 回调地址
)
```

### API 端点

| 功能 | 端点 | 方法 |
|------|------|------|
| 健康检查 | `/health` | GET |
| 获取 Token | `/api/baidu/oauth/token` | GET |
| 刷新 Token | `/api/baidu/oauth/refresh` | POST |
| 文件列表 | `/api/baidu/pan/file` | GET |
| 搜索文件 | `/api/baidu/pan/search` | GET |
| 文件上传 | `/api/baidu/pan/upload` | POST |
| 验证 Token | `/api/baidu/pan/verify` | GET |

## 开发说明

### 环境要求

- Node.js 18+
- Go 1.20+
- npm 或 yarn

### 开发模式

1. 启动前端开发服务器：
   ```bash
   npm run dev
   ```

2. 启动后端服务：
   ```bash
   cd server && go run main.go
   ```

3. 访问 `http://localhost:8080` 开始使用

### 代码规范

- 使用 TypeScript 进行类型检查
- 遵循 Vue 3 组合式 API 风格
- 使用 ESLint 进行代码检查
- 使用 Prettier 进行代码格式化

## 构建部署

### 前端构建

```bash
npm run build
```

构建产物位于 `dist` 目录，可部署到任何静态文件服务器。

### 后端部署

```bash
cd server
go build -o neat-reader-server main.go
./neat-reader-server
```

## 浏览器支持

支持所有现代浏览器：
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 许可证

MIT License

## 贡献指南

欢迎提交 Issue 和 Pull Request！
