# Tasks

- [x] Task 0: 端口验证（前置）
  - [x] SubTask 0.1: 创建临时脚本对 `http://172.22.40.153:8642/v1/chat/completions` 发起一次调用（模型 GLM-5.2，带 Authorization: Bearer <API Key>），记录可达性、HTTP 状态码与响应样例
  - [x] SubTask 0.2: 产出连通性报告：`docs/connectivity-report.md`（可达，HTTP 200，样例回复"连通性测试通过，我在。"）
  - [x] SubTask 0.3: 与用户确认 spec.md "所需补充信息" 中的关键事项（语音方案=Vosk 本地离线；宠物素材=yinyue-sprite-sheet.png；其余按默认执行）

- [x] Task 1: 搭建 Electron + TypeScript + Vite 项目骨架
  - [x] SubTask 1.1: 初始化 package.json、tsconfig、electron-vite 构建配置，安装 electron 39 / electron-builder / electron-store 等依赖
  - [x] SubTask 1.2: 创建主进程入口，创建透明置顶、无边框、可点击穿透的 BrowserWindow
  - [x] SubTask 1.3: 创建预加载脚本，通过 contextBridge 暴露安全的 IPC API（nodeIntegration 关闭、contextIsolation 开启）
  - [x] SubTask 1.4: 创建渲染进程入口与基础 HTML/样式
  - [x] SubTask 1.5: 配置启动脚本（dev/build/preview/selftest），构建通过，GUI 运行日志 `[pet] ready`

- [x] Task 2: 实现图形化宠物渲染与自主移动
  - [x] SubTask 2.1: 使用 Canvas 2D 绘制宠物（用户提供的 yinyue-sprite-sheet.png 精灵图，2行×4列）
  - [x] SubTask 2.2: 实现帧动画循环与姿势切换机制（rAF 主循环 + 呼吸/走路/拖拽程序化动画）
  - [x] SubTask 2.3: 实现自主移动逻辑（随机间隔 6~15s、屏幕边界约束、平滑移动）— 单测覆盖
  - [x] SubTask 2.4: 实现拖拽交互，拖拽时暂停自主移动 — 逻辑单测覆盖
  - [x] SubTask 2.5: 验证宠物可在桌面自主移动且不越界（clampToArea 单测 + GUI 运行）

- [x] Task 3: 实现多姿势情绪动画
  - [x] SubTask 3.1: 使用素材中的 8 帧姿势：默认/微笑/惊讶/撒娇/生气/开心/委屈/默认变体
  - [x] SubTask 3.2: 建立情绪到姿势的映射（calm→0、happy→5、angry→4 垂手、coax→3），支持动画过渡
  - [x] SubTask 3.3: 验证各情绪姿势可正确切换显示（渲染循环按 currentEmotion 选帧，单测覆盖情绪解析）

- [x] Task 4: 实现好感度系统
  - [x] SubTask 4.1: 定义好感度数值模型（0-100）与变化规则（聊天+2/语音+3/抚摸+1冷却10s/提醒确认+2）
  - [x] SubTask 4.2: 实现互动增减好感度与冷落缓慢下降逻辑（每10分钟-1）— 单测覆盖
  - [x] SubTask 4.3: 持久化好感度到本地（electron-store，selftest 验证读写）
  - [x] SubTask 4.4: 验证好感度随互动变化并可持久化恢复（selftest + 启动 hydrate）

- [x] Task 5: 实现情绪系统
  - [x] SubTask 5.1: 定义情绪状态（开心/生气/撒娇/平静）与计算规则（临时情绪60~90s + 好感度基线）— 单测覆盖
  - [x] SubTask 5.2: 实现功能未实现/用户未响应时切换为生气的逻辑（语音失败、GLM异常、提醒2分钟未响应）
  - [x] SubTask 5.3: 将情绪状态接入动画（姿势帧/粒子特效）与回复语气（系统提示语气映射）
  - [x] SubTask 5.4: 验证情绪可被事件正确驱动并影响表现（单测 + selftest 提示词检查）

- [x] Task 6: 实现中文语音与文字交互
  - [x] SubTask 6.1: 实现文字输入框与发送逻辑（输入条 + Enter/按钮发送）
  - [x] SubTask 6.2: 集成中文语音识别：vosk-browser (WASM 离线) + 主进程模型下载/本地服务（注：Web Speech API 的 SpeechRecognition 在 Electron 中不可用，经用户确认改用 Vosk）
  - [x] SubTask 6.3: 实现语音合成（SpeechSynthesis）输出中文回复，无中文语音包时自动降级纯文字
  - [x] SubTask 6.4: 验证可用性（文字链路已随 GUI 验证；语音为交互功能，待用户实机验收，模型已预置）

- [x] Task 7: 对接 GLM-5.2 OpenAI 兼容接口
  - [x] SubTask 7.1: 创建 `src/config/api.ts`，集中管理 Base URL/模型/API Key（config.local.json 注入，已 gitignore）
  - [x] SubTask 7.2: 封装 GLM 客户端（POST /v1/chat/completions，Bearer 鉴权，30s 超时）
  - [x] SubTask 7.3: API 端点连通性探测完成（Task 0 报告），真实调用 selftest 通过（2.2s 返回"自测成功"）
  - [x] SubTask 7.4: 注入宠物情绪/好感度作为系统提示构建上下文，维护本地会话历史（保留20轮）
  - [x] SubTask 7.5: 实现接口异常/超时降级为本地预设回复并提示（错误端点实测优雅降级 ok:false）
  - [x] SubTask 7.6: 验证对话可正常调用并返回秘书式回复（selftest + 系统提示单测）

- [x] Task 8: 实现健康提醒功能
  - [x] SubTask 8.1: 监控电脑连续使用时长（powerMonitor.getSystemIdleTime 活跃检测）
  - [x] SubTask 8.2: 实现休息提醒（默认久坐 45 分钟阈值触发，菜单可配置）— 决策逻辑单测
  - [x] SubTask 8.3: 实现喝水提醒（默认每 60 分钟周期触发，菜单可配置）— 决策逻辑单测
  - [x] SubTask 8.4: 提醒由宠物气泡+TTS+确认按钮展示（2分钟未确认转生气；逻辑实现，定时触发待长时运行验收）

- [x] Task 9: 实现个人秘书式交互体验
  - [x] SubTask 9.1: 设计秘书式系统提示，结合情绪/好感度调整语气（4情绪×5档好感度）— 单测
  - [x] SubTask 9.2: 将提醒与对话统一为秘书式表达（提醒/问候/兜底文案库）
  - [x] SubTask 9.3: 验证回复语气随情绪/好感度变化（提示词单测：四种情绪语气不同）

- [x] Task 10: 本地数据持久化与重启恢复
  - [x] SubTask 10.1: 统一本地存储模块（electron-store）：好感度、情绪、使用时长、会话历史、提醒配置、宠物位置
  - [x] SubTask 10.2: 实现启动时恢复状态（app.init 从 store hydrate 全量状态）
  - [x] SubTask 10.3: 验证重启后状态与历史可恢复（selftest store 读写 + 启动流程代码路径）

# Task Dependencies
（依赖已按序满足：Task 0 → 1 → 2/4/6/8 → 3/5/7 → 9/10）

# Notes
- 端口验证通过，未使用 mock（报告见 docs/connectivity-report.md）。
- spec"所需补充信息"已经用户确认：语音=Vosk 离线；素材=用户提供精灵图；其余默认（久坐45/喝水60、仅Windows、自启为可选项默认关、会话20轮、方案A、无中文语音包时TTS降级文字）。
- "Electron 调用示例代码框架"未由用户提供，对接代码由我方生成（src/main/services/glm.ts 即示例实现）。
- 交互类功能（拖拽/抚摸/语音实机对话）需用户实际体验验收；逻辑层均有单测或自测证据。

---

# v0.2 迭代（2026-08-16，用户六项反馈）

- [x] 需求1 声音：Edge 神经语音（msedge-tts，8 预设音色）+ 音色/语速/音调/音量可调 + 试听；sapi 离线备援自动降级；自定义 OpenAI 兼容 /v1/audio/speech 克隆端点（selftest 实合成 12KB 验证）
- [x] 需求2 后台控制：控制台热改 API 地址/模型/Key（打码显示）+ 测试连接；API 模式切换（直连/离线兜底）；记忆目录可换/可开/导出导入，本地明文副本 记忆.json+记忆.md
- [x] 需求3 状态控制：工具条 🚶/🧍 一键切换 + 控制台选项（自动走动/原地待命），持久化
- [x] 需求4 智能增强：长期记忆（每12轮GLM总结≤20条，注入上下文，本地双副本）；定时提醒（中英文数字解析+GLM兜底，重启补发）；主动搭话（情绪化台词，限频）；本地技能（报时/笑话/帮助/版本）；待办清单（增/完成/查看）
- [x] 需求5 情绪扩充：9 种情绪 + 行为差异档案（生气拒走、委屈趴下、兴奋小碎步、深夜瞌睡、星光/怒气/Zzz/泪滴粒子、语速音调调制、各自主动台词），单测覆盖
- [x] 需求6 README：全面重写为能力介绍（智能程度/情绪行为表/控制台说明/克隆声音指南/12 项功能提案菜单）
- [x] 验证：tsc 通过；单测 32/32；selftest 10/10（GLM 真实调用 6.8s、Edge TTS 实合成、定时器增删、配置热改往返）；GUI `[pet] ready (v0.2)`

---

# v0.3 迭代（2026-08-17，功能提案落地）

- [x] 番茄钟：「开个(50分钟)番茄钟/状态/停止」，专注期免打扰，完成气泡三选（休息/再来/结束），跨重启续期，计入今日统计
- [x] 环境音：WebAudio 程序合成（雨声带起伏、篝火带噼啪、白/粉/棕噪），「放点雨声/停止噪音」语音指令控制，零素材零流量
- [x] 天气：Open-Meteo 免密钥实调（自测：北京 22.7℃ 晴），城市自动记忆，秘书式穿衣/带伞建议
- [x] 全局快捷键：Alt+Y 任意应用呼出对话；Alt+J 剪贴板解读（中文→讲解，外文→翻译，经 GLM）
- [x] 今日报告：「今日报告/今日总结」汇总活跃时长/聊天/摸头/番茄/确认提醒/待办剩余+秘书点评
- [x] 统计扩展：chatsToday/patsToday/pomodorosToday/acksToday，跨天自动清零
- [x] 验证：单测 43/43；selftest 13/13（新增 pomodoro 往返、v0.3 指令解析、天气实调）；GUI 启动正常并已重启

---

# v0.3.1 修复（2026-08-17，回归修复）

- [x] 修复 typecheck 失败：app.ts 调用 `createPanel` 缺 `onPetScale` 回调（PanelCallbacks 要求）。v0.3 引入了宠物缩放配置项（控制台滑条 0.5~2.0）但渲染层从未接线，滑条改动无效。
- [x] 接入缩放：新增 `petScale()` / `effectivePetHeight()`，将所有硬编码 `PET_HEIGHT`（渲染、布局、碰撞 hitTest、边界 clamp、粒子位置、拖拽）统一改为有效高度；`onPetScale` 写回 config.pet.scale 并重新约束位置避免越界；scheduleSavePos 持久化真实 scale。
- [x] PetCanvas 无需改动（render/hitTest 已参数化 height，scale 经由 effectivePetHeight 注入）。
- [x] 验证：typecheck 通过；单测 43/43 通过。

---

# v0.4 迭代（2026-08-17，功能扩展：右键菜单/双击/视线跟随/边缘吸附/养成喂养）

- [x] 右键菜单：悬停宠物右键弹出快捷菜单（聊天/喂食/摸摸头/切换走动/设置/退出），边界反弹防越界，Esc/点外关闭
- [x] 双击拥抱：300ms 内两次轻点 → 拥抱交互（好感+3、撒娇情绪、心形粒子爆裂、台词），affection 加 hug 类型
- [x] 视线跟随：瞳孔叠加绘制，眼睛追随全局鼠标（世界坐标，facing 镜像处理），RenderInput 加 mouseX/mouseY
- [x] 边缘吸附：拖到屏幕边缘自动坐下（MovePhase 加 'sit'、snapToEdge 工具、frame=7+droop 模拟蹲姿），拖拽自动解除
- [x] 养成数据模型：NurtureState（exp/level/satiety/lastFedAt/items/lastDropAt/satietyDecayApplied）挂进 PetStoreState，store schema/getState 同步，DEFAULT_STATE 默认值
- [x] 养成纯逻辑：src/shared/nurture.ts（clampSatiety/feedDelta/satietyDecayDelta/tryLevelUp/rollDrop/ITEMS 道具表），单测 17 例
- [x] 养成主进程服务：src/main/services/nurture.ts（feed 喂食扣道具+加饱食度+经验+升级 / dropItem 掉落 / tickDecay 衰减 / startNurtureScheduler 定时器），IPC 4 通道 + preload nurture 命名空间
- [x] 渲染层接入：feedPet 喂食 + 开心粒子 + 台词；handleNurtureEvent 升级/饥饿；satietyTick 周期刷新；tryDropItem 互动掉落（聊天/摸头）；饱食度<30 饿哭；ChatContext 注入 level/satiety；prompts 注入等级感/饥饿
- [x] 控制台养成 tab：等级/经验条/饱食度条/道具库存/三个喂食按钮
- [x] 验证：typecheck 通过；单测 60/60（新增 nurture 17 例）；selftest 13/13 pass:true（GLM 真实调用 ok）


---

# v0.5 重构（2026-08-17，移除视线跟随/多显示器/好感并入养成/精简工具条/实用助手）

- [x] 移除视线跟随：删除 drawEyes 瞳孔绘制与 mouse 字段，精灵图恢复原样（用户反馈黑点太丑）
- [x] 多显示器支持：窗口覆盖所有 display 工作区并集（unionDisplayBounds），screenBounds IPC 返回合并区域，监听 display 增减/分辨率变化动态调整
- [x] 好感度并入养成：删除独立 affection 数值，level 取代其语义。互动加经验→升级（interactionExp），level 只升不降；情绪基线 baseEmotionForLevel（level≤1→sad/≥7→happy）；GLM prompt 用 levelTier 表达亲密度；台词 greeting/patReaction 阈值改 level；冷落不再扣数值只切情绪；旧存档 affection→level 迁移
- [x] 删除 affection.ts 与其测试，逻辑迁入 nurture.ts（interactionExp/baseEmotionForLevel）
- [x] 左键精简工具条：悬停不再自动弹工具条（避免"两个窗口"），左键单击宠物 toggle 精简条（聊天+语音+菜单3按钮），走动按钮移除（右键菜单/控制台 select 负责），uiBusy 加 toolbarOpen
- [x] 控制台参数可调：NurtureConfig（掉落概率/饱食衰减分钟/移动间隔秒）+ AssistantConfig（早报时间），养成 tab 暴露输入框，热改经现有 config IPC；nurture 服务读 config dropRate/satietyDecayMin，scheduleNextMove 支持 fixedSec
- [x] 每日早报：主进程 morning-report 服务按配置 HH:MM 触发，聚合待办+天气+鼓励语，经 IPC 推渲染层 bubble+TTS 播报，跨重启补发，控制台可配时间
- [x] 增强记忆：记忆总结 prompt 加 [偏好]/[身份]/[日程]/[习惯] 标签策略，system prompt 指示银月主动提及标签记忆
- [x] 验证：typecheck 通过；单测 56/56；selftest 13/13 pass:true（GLM ok）
