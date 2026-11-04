# 墨剪 · 桌面应用

本地运行的 AI 视频工作台。Electron + React，Windows 优先，macOS 同一套代码。

## 运行

```bash
cd app
npm install          # 会顺带下载对应系统的 ffmpeg / ffprobe
npm run build        # 打包界面到 dist/
npm start            # 打开墨剪
```

打安装包：`npm run dist:win`（在 Windows 上）或 `npm run dist:mac`（在 macOS 上）。也可以在 GitHub 上手动运行「打包墨剪」工作流，或推一个 `v*` 标签，两个系统的安装包会出现在 Actions 的产物里。

## 第一次用

1. 开始页点「示例工程」，选一个文件夹，会生成一支 15 镜的示例片，打开就能播放、改、导出。
2. 「设置 → AI」加一个接口：API Key、各家 Coding Plan、CLI 登录（Claude Code / Codex / Gemini / Qwen）、本地 Ollama 都行。不配 AI 也能用，生成分镜会走规则版。
3. 开始页选「★ 一句话生成宣传片」，写一句需求，点开始。AI 先问清楚，再给三个结构让你选，写分镜，然后停在审片：在画面上圈注、写一句意见，打回去 AI 只改圈到的地方。通过后配音、配乐、导出。

## 页面

| 页面 | 做什么 |
|---|---|
| 开始 | 新建 / 打开 / 示例工程、16 个 Skill、30 个风格模板、导入 lemo-opuscar 场景 |
| 工作流 | 看和改 Skill 的步骤：跳过、排序、增删、审片回路，存成「我的 Skill」 |
| 分镜 | 卡片墙，按章节排，拖动换顺序，逐镜改文字、台词、版式，单镜让 AI 重做 |
| 剪辑 | 素材库、预览（可圈注）、属性、剪映式时间线：文字 / 主轨 / 配音 / 字幕 / 音效 / 音乐六轨，拖动、裁剪、分割、吸附、磁吸、撤销 |
| 调色 | 暗部 / 中间调 / 亮部色轮、曝光对比饱和色温色调、8 个风格、RGB 分量和矢量示波器、复制粘贴、颜色匹配 |
| 音频 | 角色和音色、逐句配音 / 重配 / 导入录音、批量按段号导入、听写校验、配乐情绪和响度 |
| 交付 | 成片体检、导出 MP4（H.264 / H.265）和 MOV（H.264 / ProRes 422 HQ / ProRes 4444）、SRT、FCPXML、EDL、录音稿、版本和对比 |
| 设置 | AI 接口和月度上限、配音接口（含自定义 HTTP 接口）、听写、FFmpeg、lemo 路径、用量 |

快捷键：空格播放，← → 逐帧（Shift 一秒），S 分割，Delete 删除，Ctrl+Z / Ctrl+Shift+Z 撤销重做，Ctrl+S 保存，Ctrl+滚轮缩放时间线。

## 工程文件夹

```
我的片子/
  project.json       工程（镜头、台词、字幕、音效、文字、调色、圈注）
  media/             导入的素材
  audio/voice/       每句配音，一句一个文件，重配会留下旧版本
  audio/music/       配乐
  audio/sfx/         音效
  out/               导出的成片、字幕、交换文件
  .git/              版本记录（内置，不需要装 git）
  .mojian/           缓存、工作流运行记录、外部 AI 的修改建议
```

## 时间怎么算

台词决定时长：一句的时长按字数估算（中文每秒约 4.6 字，可在工程设置里改），配音生成后换成真实时长。镜头时长 = 最后一句结束 + 收尾停顿，最短不少于设定值。手动拖过的镜头会锁定时长，点「按台词」恢复自动。字幕默认和配音同起同止，可以单独拖。主轨默认磁吸，没有空隙。

## 可选的外部工具

- **听写**（校验配音、自动字幕、去口误）：装 Python 3.9+，`pip install faster-whisper`；或在设置里填 OpenAI 兼容的听写接口。
- **配音**：默认用微软 edge-tts（免费，需联网）；离线时退回系统语音（Windows 自带，macOS 用 say）。MiniMax、OpenAI 和自定义接口在设置里填 Key。
- **外部 AI 工具**：`core/mcp/server.js` 是一个 MCP 服务，Claude Code、Codex 等可以通过它读写当前工程，改动以修改建议的形式回到墨剪，你点应用才生效。

## 开发

```bash
npm test                                   # 核心逻辑单元测试
xvfb-run -a node scripts/e2e.mjs out test/fixtures/lemo-scene   # 启动真窗口：示例工程、各页面截图、导出、导入场景
```

目录：`core/` 不依赖 Electron 的逻辑（工程模型、时间、体检、模板、Skill、AI 工具、工作流引擎、Node 侧的音视频）；`electron/` 主进程（窗口、协议、IPC、导出、lemo 适配、工作流步骤）；`renderer/` 界面。预览和导出用同一个合成器（`renderer/src/player`），导出是逐帧截图交给 FFmpeg，所以看到什么就导出什么。
