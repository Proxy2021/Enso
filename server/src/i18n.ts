/**
 * Server-side i18n for user-facing strings sent over WebSocket.
 * Locale is set per-client via settings.set_language.
 */

export type Locale = "en" | "zh";

// Default locale per client — keyed by clientId
const clientLocales = new Map<string, Locale>();
let defaultLocale: Locale = "en";

export function setClientLocale(clientId: string, locale: Locale) {
  clientLocales.set(clientId, locale);
}

export function removeClientLocale(clientId: string) {
  clientLocales.delete(clientId);
}

export function getClientLocale(clientId: string): Locale {
  return clientLocales.get(clientId) ?? defaultLocale;
}

export function setDefaultLocale(locale: Locale) {
  defaultLocale = locale;
}

// Translation dictionaries
const en: Record<string, string> = {
  // Operation status labels
  "op.processing": "Processing action",
  "op.refining": "Refining template",
  "op.generatingUI": "Generating UI",
  "op.renderingCatalog": "Rendering plugin catalog",
  "op.updatingConsole": "Updating tool console",
  "op.callingTool": "Calling {tool}",
  "op.navigatingTo": "Navigating to {family}",
  "op.savingToCortex": "Saving to Cortex",
  "op.savedToCortex": "Saved to Cortex",
  "op.cortexIngestFailed": "Cortex ingest failed",
  "op.importingToCortex": "Importing data sources to Cortex",
  "op.importedToCortex": "Imported to Cortex",
  "op.importFailed": "Import failed",
  "op.autoHealing": "Auto-healing executor",
  "op.autoHealSucceeded": "Auto-heal succeeded",
  "op.agentFallback": "Routing through agent",

  // Error messages
  "err.noGeminiKey": "No GEMINI_API_KEY configured. Add it in Settings or ~/.enso/api-keys.json",
  "err.cardContextNotFound": "Card context not found — the server may have restarted. Try running the app again.",
  "err.appNotFound": "App \"{family}\" not found.",
  "err.appRunFailed": "Failed to run app: {error}",
  "err.researcherNotAvailable": "Researcher app not available.",
  "err.researchFailed": "Research failed: {error}",
  "err.buildFailed": "Build failed: {error}",
  "err.noBuildDetected": "Claude Code session completed but no new app was detected. Check the terminal output for details.",
  "err.appRegistrationFailed": "App registration failed: {error}",
  "err.scanFailed": "Failed to scan app directories after build.",

  // Agent status labels
  "agent.researching": "Researching...",
  "agent.browsingFiles": "Browsing files...",
  "agent.processingMedia": "Processing media...",
  "agent.openingBrowser": "Opening browser...",
  "agent.queryingYouTube": "Querying YouTube...",
  "agent.sendingEmail": "Sending email...",
  "agent.processingPhotos": "Processing photos...",
  "agent.processingVideo": "Processing video...",
  "agent.capturingScreen": "Capturing screen...",
  "agent.runningCommand": "Running system command...",
  "agent.executingCommand": "Executing command...",
  "agent.searchingMemory": "Searching memory...",
  "agent.launchingClaude": "Launching Claude Code...",
  "agent.runningTool": "Running tool...",
  "agent.thinking": "Thinking...",
  "agent.processingStep": "Processing (step {step})...",
  "agent.analyzingResults": "Analyzing results...",
  "agent.searchingWeb": "I'm searching the web and gathering sources — the interactive research board usually fills in within about 30–60 seconds. I'll add a written summary here when it's ready.",
  "agent.pullingWorkspace": "Pulling that from your workspace now…",
  "agent.fetchingPage": "Opening the browser tool to fetch live page data…",
  "agent.genericToolRun": "Running a tool to get accurate, up-to-date results — one moment.",

  // Claude Code labels
  "cc.completed": "Completed",
  "cc.cancelled": "Cancelled",
  "cc.failed": "Failed",
  "cc.starting": "Starting Claude Code",
  "cc.browserOpen": "Browser Open",
  "cc.browserNavigate": "Browser Navigate",
  "cc.browserClick": "Browser Click",
  "cc.compacting": "Compacting context...",
  "cc.thinking": "Thinking...",
  "cc.streaming": "Streaming output",
  "cc.rateLimited": "Rate limited{wait}",
  "cc.noActiveSession": "No active session to compact. Start a session first.\n",

  // Tool labels
  "tool.reading": "Reading",
  "tool.editing": "Editing",
  "tool.writing": "Writing",
  "tool.runningCommand": "Running command",
  "tool.searching": "Searching",
  "tool.findingFiles": "Finding files",
  "tool.runningAgent": "Running agent",
  "tool.searchingWeb": "Searching web",
  "tool.fetchingPage": "Fetching page",
  "tool.editingNotebook": "Editing notebook",
  "tool.writingTodos": "Writing todos",
  "tool.askingQuestion": "Asking question",

  // Research status
  "research.generatingQueries": "Generating search queries...",
  "research.searchingWeb": "Searching the web...",
  "research.gatheringSources": "Gathering sources...",
  "research.analyzing": "Analyzing & synthesizing...",
  "research.checkingGaps": "Checking for gaps...",
  "research.buildingExperience": "Building custom research experience (Claude Code)...",
  "research.finalizing": "Finalizing...",
  "research.complete": "Research complete",
  "research.deepReady": "Deep research experience ready",

  // Orchestrator
  "orch.analyzing": "🎯 Analyzing your goal and assembling a team...\n\n> {message}",
  "orch.planned": "Mission planned: {taskCount} tasks across {agentCount} agents. Executing...",
  "orch.planningFailed": "Orchestration planning failed: {error}",

  // Email
  "email.noRecipient": "[ERROR] No recipient specified (to field is empty)",
  "email.noSubject": "[ERROR] No subject specified",
  "email.sent": "Email sent to {to} — subject: \"{subject}\" (messageId: {messageId})",
  "email.sendFailed": "[ERROR] Failed to send email: {message}",
  "email.sentShort": "Email sent",
  "email.failedShort": "Email failed",

  // App catalog descriptions
  "catalog.alpharank": "Stock market analysis: ranked stock predictions, market regime, portfolio management, daily pipeline, backtesting",
  "catalog.filesystem": "File manager: browse directories, read files, search, create/rename/delete/move files and folders",
  "catalog.browser": "Remote browser: browse the web, view bookmarks, click, scroll, type — all from within an Enso card",
  "catalog.researcher": "Research any topic in any language: deep multi-angle web research with AI synthesis, multimedia, podcast generation, gap analysis, contradiction detection, auto-escalating deep research via Claude Code, and email reports",
  "catalog.clawhub": "ClawHub skill store: browse, search, install and manage Enso skills",
  "catalog.media": "Media gallery: browse, search & organize photos and videos with filters, ratings, favorites, collections, and EXIF metadata",
  "catalog.photoStudio": "Photo studio: import, edit, apply artistic styles (56 film & creative looks), batch process, AI analysis, adjust, compare, and export photos",
  "catalog.videoStudio": "AI video generation studio: create cinematic videos from text prompts, animate still images, craft optimized prompts, browse video gallery",
  "catalog.youtube": "YouTube: personalized feed from subscriptions, trending, search, channel videos, liked videos, subscriptions list",
  "catalog.youtubeManager": "YouTube Manager: subscription management, personalized feed, trending, AI-powered channel discovery, analytics, bulk cleanup",
  "catalog.email": "Email: send messages via Gmail SMTP with attachments, CC/BCC, HTML support",
  "catalog.claudeCode": "AI coding assistant: write code, fix bugs, build projects",
  "catalog.shell": "System terminal: run commands, manage processes",

  // API key labels
  "apikey.gemini": "Google Gemini",
  "apikey.geminiDesc": "Chat AI model (powers agent conversations)",
  "apikey.brave": "Brave Search",
  "apikey.braveDesc": "Web search for research tools",
  "apikey.accessToken": "Access Token",
  "apikey.accessTokenDesc": "Server authentication token (auto-generated if empty)",
  "apikey.seedance": "BytePlus Seedance",
  "apikey.seedanceDesc": "AI video generation",
  "apikey.replicate": "Replicate",
  "apikey.replicateDesc": "AI image upscaling",
  "apikey.removebg": "Remove.bg",
  "apikey.removebgDesc": "Background removal",
  "apikey.gmail": "Gmail Address",
  "apikey.gmailDesc": "Gmail address for sending emails (e.g. you@gmail.com)",
  "apikey.gmailPassword": "Gmail App Password",
  "apikey.gmailPasswordDesc": "Gmail App Password (16-char code from Google > Security > App Passwords)",
  "apikey.ytClientId": "YouTube Client ID",
  "apikey.ytClientIdDesc": "Google Cloud OAuth2 Client ID for YouTube API",
  "apikey.ytClientSecret": "YouTube Client Secret",
  "apikey.ytClientSecretDesc": "Google Cloud OAuth2 Client Secret",
  "apikey.ytRefreshToken": "YouTube Refresh Token",
  "apikey.ytRefreshTokenDesc": "Auto-generated after OAuth authorization (do not edit manually)",

  // Build/release steps
  "release.checkingChanges": "Checking for changes...",
  "release.committing": "Committing: {msg}...",
  "release.pushing": "Pushing to remote...",
  "release.bumpingVersion": "Bumping version...",
  "release.versionBumped": "Version: {old} → {new} ({oldCode} → {newCode})",
  "release.buildingWeb": "Building web frontend...",
  "release.syncingAssets": "Syncing web assets to Android...",
  "release.buildingAPK": "Building release APK...",
  "release.apkBuilt": "APK built: {size} MB",
  "release.apkNotFound": "APK build completed but file not found — skipped",
  "release.noAndroidTools": "Android build tools not available — APK skipped",
  "release.committingBump": "Committing version bump...",
  "release.pushingBump": "Pushing version bump...",
  "release.released": "Released v{version}{apkNote} — restarting...",

  // Archetype builder
  "archetype.analyzing": "Analyzing your request and building a custom experience...",
  "archetype.failed": "Sorry, I couldn't complete this task. Please try again.",
  "archetype.noUI": "The task completed but no interactive experience was generated. The results are in the terminal output above.",
};

const zh: Record<string, string> = {
  // Operation status labels
  "op.processing": "正在处理操作",
  "op.refining": "正在优化模板",
  "op.generatingUI": "正在生成界面",
  "op.renderingCatalog": "正在渲染插件目录",
  "op.updatingConsole": "正在更新工具控制台",
  "op.callingTool": "正在调用 {tool}",
  "op.navigatingTo": "正在导航到 {family}",
  "op.savingToCortex": "正在保存到知识库",
  "op.savedToCortex": "已保存到知识库",
  "op.cortexIngestFailed": "知识库写入失败",
  "op.importingToCortex": "正在导入数据源到知识库",
  "op.importedToCortex": "已导入到知识库",
  "op.importFailed": "导入失败",
  "op.autoHealing": "正在自动修复执行器",
  "op.autoHealSucceeded": "自动修复成功",
  "op.agentFallback": "正在通过智能体路由",

  // Error messages
  "err.noGeminiKey": "未配置 GEMINI_API_KEY。请在设置或 ~/.enso/api-keys.json 中添加。",
  "err.cardContextNotFound": "卡片上下文未找到 — 服务器可能已重启。请重新运行应用。",
  "err.appNotFound": "应用「{family}」未找到。",
  "err.appRunFailed": "应用运行失败：{error}",
  "err.researcherNotAvailable": "研究助手应用不可用。",
  "err.researchFailed": "研究失败：{error}",
  "err.buildFailed": "构建失败：{error}",
  "err.noBuildDetected": "Claude Code 会话已完成，但未检测到新应用。请查看终端输出了解详情。",
  "err.appRegistrationFailed": "应用注册失败：{error}",
  "err.scanFailed": "构建后扫描应用目录失败。",

  // Agent status labels
  "agent.researching": "研究中...",
  "agent.browsingFiles": "浏览文件中...",
  "agent.processingMedia": "处理媒体中...",
  "agent.openingBrowser": "打开浏览器中...",
  "agent.queryingYouTube": "查询 YouTube 中...",
  "agent.sendingEmail": "发送邮件中...",
  "agent.processingPhotos": "处理照片中...",
  "agent.processingVideo": "处理视频中...",
  "agent.capturingScreen": "截取屏幕中...",
  "agent.runningCommand": "运行系统命令中...",
  "agent.executingCommand": "执行命令中...",
  "agent.searchingMemory": "搜索记忆中...",
  "agent.launchingClaude": "启动 Claude Code 中...",
  "agent.runningTool": "运行工具中...",
  "agent.thinking": "思考中...",
  "agent.processingStep": "处理中（第 {step} 步）...",
  "agent.analyzingResults": "分析结果中...",
  "agent.searchingWeb": "正在搜索网络并收集来源 — 交互式研究面板通常会在约 30-60 秒内填充。准备好后我会在此添加书面摘要。",
  "agent.pullingWorkspace": "正在从你的工作区获取数据…",
  "agent.fetchingPage": "正在打开浏览器工具获取实时页面数据…",
  "agent.genericToolRun": "正在运行工具以获取准确、最新的结果 — 请稍候。",

  // Claude Code labels
  "cc.completed": "已完成",
  "cc.cancelled": "已取消",
  "cc.failed": "失败",
  "cc.starting": "正在启动 Claude Code",
  "cc.browserOpen": "打开浏览器",
  "cc.browserNavigate": "浏览器导航",
  "cc.browserClick": "浏览器点击",
  "cc.compacting": "正在压缩上下文...",
  "cc.thinking": "思考中...",
  "cc.streaming": "输出流式传输中",
  "cc.rateLimited": "速率限制{wait}",
  "cc.noActiveSession": "没有活跃会话可压缩。请先启动一个会话。\n",

  // Tool labels
  "tool.reading": "读取中",
  "tool.editing": "编辑中",
  "tool.writing": "写入中",
  "tool.runningCommand": "运行命令中",
  "tool.searching": "搜索中",
  "tool.findingFiles": "查找文件中",
  "tool.runningAgent": "运行智能体中",
  "tool.searchingWeb": "搜索网络中",
  "tool.fetchingPage": "获取页面中",
  "tool.editingNotebook": "编辑笔记本中",
  "tool.writingTodos": "写入待办事项中",
  "tool.askingQuestion": "提问中",

  // Research status
  "research.generatingQueries": "正在生成搜索查询...",
  "research.searchingWeb": "正在搜索网络...",
  "research.gatheringSources": "正在收集来源...",
  "research.analyzing": "正在分析和综合...",
  "research.checkingGaps": "正在检查遗漏...",
  "research.buildingExperience": "正在通过 Claude Code 构建自定义研究体验...",
  "research.finalizing": "正在完成...",
  "research.complete": "研究完成",
  "research.deepReady": "深度研究体验已就绪",

  // Orchestrator
  "orch.analyzing": "🎯 正在分析目标并组建团队...\n\n> {message}",
  "orch.planned": "任务已规划：{taskCount} 个任务，{agentCount} 个智能体。正在执行...",
  "orch.planningFailed": "编排规划失败：{error}",

  // Email
  "email.noRecipient": "【错误】未指定收件人（to 字段为空）",
  "email.noSubject": "【错误】未指定主题",
  "email.sent": "邮件已发送至 {to} — 主题：「{subject}」(messageId: {messageId})",
  "email.sendFailed": "【错误】发送邮件失败：{message}",
  "email.sentShort": "邮件已发送",
  "email.failedShort": "邮件发送失败",

  // App catalog descriptions
  "catalog.alpharank": "股票市场分析：排名预测、市场状态、投资组合管理、每日流水线、回测",
  "catalog.filesystem": "文件管理器：浏览目录、读取文件、搜索、创建/重命名/删除/移动文件和文件夹",
  "catalog.browser": "远程浏览器：浏览网页、查看书签、点击、滚动、输入 — 全部在 Enso 卡片中完成",
  "catalog.researcher": "研究任何话题：多角度深度网络研究，AI 综合分析，多媒体，播客生成，差距分析，矛盾检测，通过 Claude Code 自动升级深度研究，邮件报告",
  "catalog.clawhub": "ClawHub 技能商店：浏览、搜索、安装和管理 Enso 技能",
  "catalog.media": "媒体相册：浏览、搜索和整理照片和视频，支持筛选、评分、收藏、合集和 EXIF 元数据",
  "catalog.photoStudio": "照片工作室：导入、编辑、应用艺术风格（56 种胶片和创意风格）、批量处理、AI 分析、调整、对比和导出照片",
  "catalog.videoStudio": "AI 视频生成工作室：从文字提示创建电影级视频，动画化静态图片，制作优化提示，浏览视频画廊",
  "catalog.youtube": "YouTube：个性化订阅推送、热门、搜索、频道视频、点赞视频、订阅列表",
  "catalog.youtubeManager": "YouTube 管理器：订阅管理、个性化推送、热门、AI 频道发现、分析、批量清理",
  "catalog.email": "邮件：通过 Gmail SMTP 发送消息，支持附件、抄送/密送、HTML 格式",
  "catalog.claudeCode": "AI 编程助手：写代码、修复问题、构建项目",
  "catalog.shell": "系统终端：运行命令、管理进程",

  // API key labels
  "apikey.gemini": "Google Gemini",
  "apikey.geminiDesc": "聊天 AI 模型（驱动智能体对话）",
  "apikey.brave": "Brave Search",
  "apikey.braveDesc": "研究工具的网络搜索",
  "apikey.accessToken": "访问令牌",
  "apikey.accessTokenDesc": "服务器认证令牌（未设置时自动生成）",
  "apikey.seedance": "BytePlus Seedance",
  "apikey.seedanceDesc": "AI 视频生成",
  "apikey.replicate": "Replicate",
  "apikey.replicateDesc": "AI 图像放大",
  "apikey.removebg": "Remove.bg",
  "apikey.removebgDesc": "背景移除",
  "apikey.gmail": "Gmail 地址",
  "apikey.gmailDesc": "用于发送邮件的 Gmail 地址（例如 you@gmail.com）",
  "apikey.gmailPassword": "Gmail 应用密码",
  "apikey.gmailPasswordDesc": "Gmail 应用密码（来自 Google > 安全 > 应用密码的 16 位代码）",
  "apikey.ytClientId": "YouTube Client ID",
  "apikey.ytClientIdDesc": "Google Cloud OAuth2 Client ID（用于 YouTube API）",
  "apikey.ytClientSecret": "YouTube Client Secret",
  "apikey.ytClientSecretDesc": "Google Cloud OAuth2 Client Secret",
  "apikey.ytRefreshToken": "YouTube Refresh Token",
  "apikey.ytRefreshTokenDesc": "OAuth 授权后自动生成（请勿手动编辑）",

  // Build/release steps
  "release.checkingChanges": "检查更改...",
  "release.committing": "提交：{msg}...",
  "release.pushing": "推送到远程...",
  "release.bumpingVersion": "升级版本号...",
  "release.versionBumped": "版本号：{old} → {new}（{oldCode} → {newCode}）",
  "release.buildingWeb": "构建前端...",
  "release.syncingAssets": "同步前端资源到 Android...",
  "release.buildingAPK": "构建 APK...",
  "release.apkBuilt": "APK 已构建：{size} MB",
  "release.apkNotFound": "APK 构建完成但未找到文件 — 已跳过",
  "release.noAndroidTools": "Android 构建工具不可用 — 已跳过 APK",
  "release.committingBump": "提交版本升级...",
  "release.pushingBump": "推送版本升级...",
  "release.released": "已发布 v{version}{apkNote} — 正在重启...",

  // Archetype builder
  "archetype.analyzing": "正在分析您的请求并构建自定义体验...",
  "archetype.failed": "抱歉，无法完成此任务。请重试。",
  "archetype.noUI": "任务已完成，但未生成交互式体验。结果在上方的终端输出中。",
};

/**
 * Translate a key with optional parameter substitution.
 * Parameters use {name} syntax: st("err.appNotFound", { family: "foo" })
 */
export function st(key: string, params?: Record<string, string | number>, clientId?: string): string {
  const locale = clientId ? getClientLocale(clientId) : defaultLocale;
  const dict = locale === "zh" ? zh : en;
  let text = dict[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}
