# Neat Reader 项目结构说明

## 项目概述

Neat Reader 是一个基于 Vue 前端 + Go 后端的桌面应用程序，使用 Wails 框架打包成原生 Windows 应用。

## 目录结构

```
Neat-Reader/
├── .trae/                    # Trae IDE 配置文件
│
├── build/                    # Wails 构建输出目录（自动生成）
│   ├── bin/
│   │   └── neat-reader.exe  # 桌面应用可执行文件
│   └── windows/
│       ├── icon.ico         # 应用图标
│       ├── info.json        # 应用信息配置
│       └── wails.exe.manifest
│
├── dist/                     # 前端构建产物（会被内嵌到 exe 中）
│   ├── index.html           # 入口 HTML
│   └── assets/              # 构建后的 JS/CSS 资源
│
├── frontend/                 # Wails 自动生成的 API 绑定代码
│   └── wailsjs/
│       ├── go/              # Go 后端方法的 TypeScript 绑定
│       │   └── main/
│       │       ├── App.d.ts # 方法类型定义
│       │       └── App.js   # 方法调用实现
│       ├── runtime/         # Wails 运行时绑定
│       └── models.ts        # 数据模型定义
│
├── server/                   # ⚠️ 旧版 Web 服务器（已废弃，保留备用）
│   ├── main.go              # 独立的 HTTP 服务器
│   ├── go.mod               # Go 模块配置
│   └── baidu-pan-proxy.exe  # 旧版打包的可执行文件
│
├── src/                     # Vue 前端源码
│   ├── assets/              # 静态资源
│   │   └── styles/
│   │       └── global.css   # 全局样式
│   ├── components/          # Vue 组件
│   │   └── Dialog/          # 对话框组件
│   │       └── index.vue
│   ├── pages/               # 页面组件
│   │   ├── Home/           # 首页
│   │   ├── Reader/         # 阅读器
│   │   ├── FileManager/    # 文件管理器
│   │   ├── Settings/       # 设置页
│   │   └── Callback/       # OAuth 回调页
│   ├── stores/              # Pinia 状态管理
│   │   ├── ebook.ts        # 电子书相关状态
│   │   └── dialog.ts       # 对话框状态
│   ├── App.vue              # Vue 根组件
│   ├── main.ts              # 应用入口
│   ├── router.ts            # Vue Router 配置
│   └── wails.ts             # Wails API 桥接工具
│
├── app.go                   # Wails 后端逻辑（Go）
│                           # 包含所有绑定到前端的方法
│
├── wails.go                 # Wails 应用入口
│                           # 配置窗口大小、标题等
│
├── wails.json               # Wails 项目配置
│
├── package.json             # 前端项目依赖配置
│
├── vite.config.ts           # Vite 构建配置
│
├── index.html               # HTML 入口模板
│
└── tsconfig.json            # TypeScript 配置
```

## 核心文件说明

### 后端文件

| 文件 | 作用 |
|------|------|
| `app.go` | 后端业务逻辑，包含所有可被前端调用的方法 |
| `wails.go` | 应用入口，配置窗口属性（1280x800，默认白色背景） |
| `wails.json` | Wails 项目配置（应用名称、版本等） |

### 前端文件

| 文件 | 作用 |
|------|------|
| `src/wails.ts` | Wails API 桥接，前端调用 Go 后端的统一入口 |
| `src/main.ts` | Vue 应用入口，初始化 Wails |
| `src/stores/ebook.ts` | 电子书状态管理（书库、阅读进度等） |
| `src/pages/` | 各功能页面组件 |

## 开发流程

### 日常开发

```bash
# 1. 启动开发模式（前端热重载，后端实时编译）
wails dev

# 2. 打开的应用窗口中，按 F12 打开开发者工具查看日志
```

### 修改后端逻辑

1. 在 `app.go` 中添加或修改方法
2. 方法必须是导出的（首字母大写）
3. 保存后 Wails 会自动重新编译

示例：
```go
func (a *App) MyNewMethod(param string) string {
    // 业务逻辑
    return "result"
}
```

### 修改前端

1. 在 `src/` 下修改 Vue 代码
2. 保存后自动热更新

### 调用后端方法

```typescript
import { wails } from './wails'

// 调用后端方法
async function fetchData() {
  const result = await wails.verifyToken(accessToken)
  console.log(result)
}
```

### 构建发布版本

```bash
# 构建桌面应用（生成 neat-reader.exe）
wails build

# 可执行文件位置：build/bin/neat-reader.exe
```

## 常见问题

### Q: 日志在哪看？
A: 
- 开发模式：按 F12 打开开发者工具，在 Console 查看
- 或者在代码中使用 `log.Println()` 输出，Wails 会捕获

### Q: 怎么添加新的后端方法？
A: 
1. 在 `app.go` 中添加新方法
2. 方法需要是 `App` 结构体的方法
3. Wails 会自动绑定到前端

### Q: 怎么修改窗口大小？
A: 编辑 `wails.go` 中的 `Width` 和 `Height` 配置

### Q: 还能用旧的 Web 服务器吗？
A: 可以，旧的 Web 服务器在 `server/` 目录下，但不再维护

## 技术栈

- **前端**: Vue 3 + TypeScript + Pinia + Vue Router
- **后端**: Go + Wails
- **桌面框架**: Wails (基于 WebView2)
- **构建工具**: Vite
