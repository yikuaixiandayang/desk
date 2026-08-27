# Tasks

- [x] Task 1: 修复趴姿素材底边对齐（问题1）
  - [x] SubTask 1.1: 编写 PowerShell 图像处理脚本：将精灵图 row2 帧8（y 600~900 单元格）内容整体下移 73px、帧9 内容下移 100px，使两帧内容底边对齐单元格底边-2px，水平位置不变，透明背景无损重排
  - [x] SubTask 1.2: 同步更新 `src/renderer/public/assets/yinyue-sprite-sheet.png` 与 `resources/yinyue-sprite-sheet.png`
  - [x] SubTask 1.3: 用像素扫描脚本验证新帧 8/9 的内容底部空白 ≤2px、行 0 帧 0 未被改动（托盘图标不受影响）（实测帧8 y[166..297]、帧9 y[129..297]、帧0 不变，两份 MD5 一致）

- [x] Task 2: 修复 GSAP 动画覆盖 CSS 定位（问题5 + 气泡/聊天条/工具条同病）
  - [x] SubTask 2.1: `panel.ts` 构造函数对 `menu/chatbar/toolbar` 执行 `gsap.set(el, { xPercent: -50, yPercent: -100 })`；`bubble.ts` 构造对气泡元素同样处理
  - [x] SubTask 2.2: 检查全部 tween（openMenu/closeMenu/openChat/closeChat/showToolbar/hideToolbar/bubble.show/bubble.hide/openCtxMenu/closeCtxMenu）不再破坏 xPercent/yPercent（GSAP 百分比分量与 x/y 独立，直接复用现有 tween 即可，逐一确认无 gsap.set 覆盖 transform 的写法）
  - [x] SubTask 2.3: `npm run typecheck` + 既有单测通过（typecheck 0 错误；78/78 测试通过）

- [x] Task 3: 右键菜单右侧优先（问题2）
  - [x] SubTask 3.1: `movement.ts`（或新 `ui-layout.ts`）新增纯函数 `ctxMenuPosition(petCx, petCy, petH, menuW, menuH, viewW, viewH)`：右侧优先（宠物右缘+8px）、左侧次选、视口兜底；垂直对齐身体中部并 clamp 视口
  - [x] SubTask 3.2: `panel.ts` `openCtxMenu` 改用该函数；估算宠物宽度改用真实宽高比（sprite cellW/cellH 经参数传入）
  - [x] SubTask 3.3: 新增单测：中部右键→右侧；贴右缘→左侧；极窄视口→兜底不越界（5 用例，83/83 通过）

- [x] Task 4: 探头可见度重构（问题6）
  - [x] SubTask 4.1: `sprite.ts` 新增 `peekContentMetrics(side)` 返回内容边界比例常量（left: [0,674]/832 宽、[21,1216]/1216 高；right: [43,794]、[61,1216]；top: [0,832]、[49,875]），附注释说明实测来源
  - [x] SubTask 4.2: `movement.ts` 重写探头偏移纯函数：输入 side/area/当前停靠坐标/petH/素材宽高比/内容度量/探出比例，输出峰值 offsetX/liftY——素材内容边对齐屏幕边并按比例探出；删除旧 `peekFromEdge` 的 petW×ratio 算法（保留 PeekState 结构与 stepPeek 缓动）
  - [x] SubTask 4.3: `app.ts` `startPeek` 接入新函数（传入 move.x/y、area、sprite.peekAspect/peekContentMetrics、config.pet.peekOffsetRatio）；`peekDemo` 改为先 `glideTo` 对应边缘停靠位、完成后 pendingPeek 短延迟触发
  - [x] SubTask 4.4: `shared/types.ts` `peekOffsetRatio` 注释/默认值改 0.3、范围 0.05~0.6；`index.html` 滑条 min/max/step 与 hint 文案更新（存量值运行时 clamp）
  - [x] SubTask 4.5: 更新/新增 `tests/movement.test.ts`：三方向峰值时角色可见比例 ≥60%（默认 0.3 时 ≈70%）、内容裁切边与屏幕边对齐、幅度 clamp 生效（typecheck 0 错误，86/86 测试通过）

- [x] Task 5: 边缘动作与台词补全（问题3）
  - [x] SubTask 5.1: `app.ts` 漫步 arrived 分支：edgeSnap 开启时 `act === 'peekLeft'/'peekRight'` → `enterSideRest`（与拖拽一致），`peekTop` → pendingPeek（保留现状）
  - [x] SubTask 5.2: 新增 `PEEK_LINES` 台词池（left/right/top × 常见情绪 + 兜底），`startPeek` 时按方向+情绪展示 2.4s
  - [x] SubTask 5.3: `DEFAULT_APP_CONFIG.pet.edgeSnap` 改 `true`（存量显式 false 尊重）；`shared/types.ts` 注释同步
  - [x] SubTask 5.4: typecheck + 单测通过（0 错误，90/90）

- [x] Task 6: 趴卧贴合间距可配（问题1 配套 + 问题7）
  - [x] SubTask 6.1: `PetPrefs` 新增 `squatOverhangPx`（默认 4，0~20），`app.ts` `squatAnchorY()` 读取配置
  - [x] SubTask 6.2: `index.html` 行为参数区新增「趴卧贴合间距(px)」输入框，`panel.ts` 绑定 `onPetConfig`，hydrate 回填
  - [x] SubTask 6.3: typecheck + 单测通过（0 错误，90/90）

- [x] Task 7: AI 主动台词（问题4 + 问题7）
  - [x] SubTask 7.1: `shared/prompts.ts` 新增 `AMBIENT_PROMPT` 与 `buildAmbientUserText(ctx)`（时间/情绪/等级/饱食度/空闲分钟/天气城市可选）；新增单测验证提示词含各上下文字段
  - [x] SubTask 7.2: `shared/types.ts` `PetPrefs` 新增 `aiChatterEnabled`（默认 true）；`main/ipc.ts` 注册 `chat:ambient`（调 `chatRaw`，maxTokens 80，30s 超时，失败返回 ok:false）；`preload/index.ts` 暴露 `ambientLine()`
  - [x] SubTask 7.3: `app.ts` `moodTick` 主动搭话分支接入：开启时 `await pet.ambientLine(...)` 成功用 GLM 台词（气泡 7s + TTS），失败降级 `behavior.chatter` 本地池；限频/防打扰逻辑不变
  - [x] SubTask 7.4: `index.html` AI 区新增「AI 主动搭话」开关 + 「立即搭话」按钮；`panel.ts` 绑定（试触发绕过限频，仍遵守番茄专注不打扰提示）
  - [x] SubTask 7.5: typecheck + 单测通过（0 错误，92/92）

- [ ] Task 8: 集成验证与 GUI 实测迭代（用户要求：自测确认无问题再交付）
  - [ ] SubTask 8.1: `npm run typecheck`、`npm test`、`npm run build` 全绿
  - [ ] SubTask 8.2: `npm run dev` 启动 GUI，用截图逐项验证：设置面板位于宠物头顶不遮挡；右键菜单在右侧；拖到底部趴下贴任务栏；演示探头三方向主体可见；气泡位于头顶上方不压头
  - [ ] SubTask 8.3: 验证 AI 台词：点「立即搭话」观察 GLM 返回（失败观察降级文案）；确认无控制台报错
  - [ ] SubTask 8.4: 发现问题就地修复并回归，直至全部验证点通过；关闭应用

# Task Dependencies
- Task 1（素材）独立
- Task 2/3 独立（UI 定位）
- Task 4 依赖素材度量常量（不依赖 Task 1 的改图）
- Task 5 依赖 Task 4（探头接线后补台词与漫步触发）
- Task 6/7 相互独立
- Task 8 依赖全部前置任务

# Notes
- 实现须委托子代理串行执行（多任务共改 `app.ts`/`panel.ts`，避免并行冲突）
- GSAP 百分比修复是多个用户可见问题的共同根因，优先级最高（Task 2）
- 素材不新画：lean/peek 帧均为既有素材，仅排版/锚定问题
