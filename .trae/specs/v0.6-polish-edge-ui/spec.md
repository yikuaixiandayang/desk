# 桌宠 v0.6.1 打磨：边缘动作与 UI 定位修复 Spec

## Why

用户实测反馈 7 项体验问题（趴卧离任务栏边距过大、右键菜单位置不当、上/左/右边缘缺动作与台词、台词静态不智能、设置面板盖住宠物、探头只露一点点、设置面板调节项不足）。经代码与素材逐项排查，已定位全部根因：

| # | 用户反馈 | 根因（已实证） |
|---|---|---|
| 1 | 趴下后离任务栏很远 | 精灵图趴姿帧（row2 帧8/9）在 300px 高单元格内**内容底部空白 75px/102px（25%~34%）**，渲染以单元格底边锚定任务栏顶沿，身体实际悬空 52~71px |
| 2 | 右键菜单应在宠物右边、不要太远 | `openCtxMenu` 优先左侧放置 |
| 3 | 上/左/右边缘缺动作与台词 | 侧卧只在拖拽松手触发（漫步到达不触发）；探头无台词；`edgeSnap` 默认 false 且存量配置为 false，用户根本看不到这些动作 |
| 4 | 台词接入 GLM 自动更新 | 主动搭话（moodTick）用写死的本地台词池 `behavior.chatter`，从不调用 GLM |
| 5 | 设置窗口盖住宠物应往上移 | **GSAP tween（y:-16→0 等）覆盖了 CSS `transform: translate(-50%, -100%)`**：GSAP 把百分比解析为像素后动画 y，-100% 纵向偏移丢失 → 面板顶边（而非底边）落在 style.top，整体下坠 ~360px 盖住宠物。同样影响 bubble/chatbar/toolbar |
| 6 | 探头只看得到一点点 | `peekFromEdge` 偏移量按**站立宽度×比例**（168×0.55≈92px）整体平移窗口，而探头素材角色内容仅 116px 宽 → 左探头仅 ~38% 可见、顶部探头 ~46% 可见 |
| 7 | 设置界面要有更多调节按钮 | 缺少 AI 搭话开关/试触发、趴卧贴合间距等参数入口 |

## What Changes

- **素材修复**：用图像处理重排精灵图 row2 两帧趴姿——内容底边对齐单元格底边（留 2px 边距），水平不变；两帧身体底边一致后交替动画不再跳动；同步 `resources/` 副本。参考原素材 `E:\运维之路\demos\sprite-drag\yinyue-sprite-sheet.png` 风格（现有 lean 帧即由其衍生态绘制，仅排版问题，无需新画）。
- **GSAP 定位修复**：`bubble/menu/chatbar/toolbar` 四元素初始化时 `gsap.set(el, { xPercent: -50, yPercent: -100 })`（GSAP 独立维护百分比分量，后续 y/scale tween 不再丢失纵向锚定）；CSS transform 保留作无 JS 兜底。面板/气泡恢复"底边锚定头顶上方"的正确位置。
- **右键菜单右侧优先**：提取纯函数 `ctxMenuPosition()`（可单测），菜单优先出现在宠物右侧（间隙 8px），右侧空间不足再左侧，最后视口兜底；垂直对齐宠物身体中部不变。
- **探头可见度重构**：
  - `sprite.ts` 新增 `peekContentMetrics(side)`——各方向探头素材的内容边界比例常量（基于实测像素：left 内容 x[0..674]/832、right x[43..794]/832、top y[49..874]/1216）。
  - `movement.ts` 用新纯函数按"素材内容边对齐屏幕边 + 探出 overhang"计算峰值偏移，替代按站立宽度×比例的旧算法；默认探出比例 30%（角色 ~70% 可见）。
  - `peekOffsetRatio` 语义改为「探出屏幕的比例」，默认 0.55→0.3，范围 0.05~0.6，面板滑条同步；存量值 clamp 生效。
  - 「演示探头」按钮改为先把宠物平滑滑到对应边缘停靠位，到位后再播放探头（演示时宠物在屏幕中央不再产生横跨全屏的窗口漂移）。
- **边缘动作与台词补全**：
  - 漫步到达左/右边缘 → 触发侧卧（`enterSideRest`，与拖拽一致）+ 台词（已有 SIDE_LINES）。
  - 到达上边缘 → 延迟探头（已有 pendingPeek）+ **新增探头台词池 PEEK_LINES**（按方向+情绪）。
  - `DEFAULT_APP_CONFIG.pet.edgeSnap` 改为 `true`（存量显式 false 尊重用户设置）。
- **趴卧贴合间距可配**：`PetPrefs.squatOverhangPx`（0~20，默认 4），`squatAnchorY()` 使用；设置面板"行为参数"区新增输入框。配合素材修复实现真正贴住任务栏。
- **AI 主动台词**：
  - `src/shared/prompts.ts` 新增 `AMBIENT_PROMPT`（要求 ≤40 字、口语化、贴合情绪/时段/等级/饱食度的桌宠自言自语）。
  - 主进程新增 IPC `chat:ambient`（`chatRaw(AMBIENT_PROMPT, ctxText, { maxTokens: 80 })`），preload 暴露 `pet.ambientLine(ctx)`。
  - 渲染层 `moodTick()` 主动搭话分支：`aiChatterEnabled`（新配置，默认 true）时优先取 GLM 台词，失败/关闭降级现有本地台词池；限频与防打扰逻辑不变。
  - 设置面板 AI 区新增「AI 主动搭话」开关 + 「立即搭话」按钮（手动触发一次，用于体验/验证）。
- **设置面板新调节项汇总**（问题7）：AI 主动搭话开关、立即搭话按钮、趴卧贴合间距、探出幅度滑条语义更新——全部经现有 `onPetConfig` 配置通道持久化，用户无需改代码。

无 **BREAKING** 变更（配置新增字段带默认值；`peekOffsetRatio` 语义微调但存量值经 clamp 后行为合理）。

## Impact

- Affected code:
  - 素材：`src/renderer/public/assets/yinyue-sprite-sheet.png`、`resources/yinyue-sprite-sheet.png`
  - 渲染层：`src/renderer/src/pet/sprite.ts`、`pet/movement.ts`、`app.ts`、`ui/panel.ts`、`ui/bubble.ts`
  - DOM/样式：`src/renderer/index.html`、`src/renderer/src/style.css`
  - 共享：`src/shared/types.ts`（PetPrefs + DEFAULT_APP_CONFIG）、`src/shared/prompts.ts`
  - 主进程：`src/main/ipc.ts`；预加载：`src/preload/index.ts`
  - 测试：`tests/movement.test.ts`（peek 重写）、新增 ctxMenuPosition / AMBIENT_PROMPT 用例
- 外部依赖：无新增（GLM 调用复用现有 chatRaw）
- 不受影响：托盘图标（只裁 row0）、番茄钟/天气/记忆等既有功能

## ADDED Requirements

### Requirement: 趴姿贴合任务栏
系统 SHALL 在趴卧渲染时让宠物身体内容底边贴合任务栏顶沿（视觉间隙 ≤ 趴卧间距配置值 + 2px 素材边距）。

#### Scenario: 拖到任务栏趴下
- **WHEN** 宠物被拖到屏幕底部任务栏区域松手
- **THEN** 趴姿身体紧贴任务栏顶沿，无明显空隙；帧 8/9 交替时身体底边不跳动

### Requirement: 右键菜单右侧优先
系统 SHALL 将右键菜单优先显示在宠物右侧（间隙 8px），仅右侧空间不足时放左侧。

#### Scenario: 宠物在屏幕中部右键
- **WHEN** 用户右键点击屏幕中部区域的宠物
- **THEN** 菜单出现在宠物右侧紧邻处，不覆盖宠物本体

### Requirement: 上/左/右边缘动作与台词
系统 SHALL 在宠物贴近屏幕上/左/右边缘时（无论拖拽或漫步到达）执行对应动作并伴随台词：左/右 → 侧卧；上 → 延迟探头；探头动画开始时展示方向对应台词。

#### Scenario: 漫步到左边缘
- **WHEN** edgeSnap 开启且宠物自主漫步到达左边缘
- **THEN** 宠物切换侧卧姿势并说左侧台词

#### Scenario: 拖到顶部边缘
- **WHEN** 宠物被拖到屏幕顶部松手
- **THEN** 延迟后播放顶部探头动画并说探头台词，角色主体清晰可见

### Requirement: 探头动作主体可见
系统 SHALL 在探头动画峰值时刻保持角色内容 ≥60% 在屏幕内（默认探出 30%）。

#### Scenario: 左侧探头
- **WHEN** 左侧探头动画处于峰值
- **THEN** 角色身体大部分（默认 ~70%）在屏幕内可见，素材裁切边与屏幕左缘对齐产生"探出"效果

### Requirement: 设置面板不遮挡宠物
系统 SHALL 保证设置面板、气泡、聊天条、工具条底边锚定在宠物头顶上方（8~12px 间隙），GSAP 动画过程与结束后均不丢失该锚定。

#### Scenario: 打开设置
- **WHEN** 用户打开设置面板
- **THEN** 面板完整显示在宠物头顶上方，不与宠物身体重叠；弹出动画结束后位置保持

### Requirement: AI 主动台词
系统 SHALL 在主动搭话时优先调用 GLM（`http://172.22.40.153:8642`）按当前情绪/时段/等级/饱食度生成一句台词，失败或关闭时降级本地台词池。

#### Scenario: 主动搭话触发
- **WHEN** 空闲超过阈值且间隔达标、无打扰条件
- **THEN** 宠物气泡展示 GLM 生成的台词（≤40 字）；API 失败时展示本地池台词，无报错

#### Scenario: 手动体验
- **WHEN** 用户在设置面板点击「立即搭话」
- **THEN** 立即触发一次台词生成并展示（GLM 或降级）

### Requirement: 面板化配置
系统 SHALL 在设置面板提供：AI 主动搭话开关、立即搭话按钮、趴卧贴合间距（0~20px）、探出幅度（0.05~0.6）调节，全部持久化生效，无需修改代码。

## MODIFIED Requirements

### Requirement: 边缘动作默认开启（原"拖到边缘执行边缘动作"）
`edgeSnap` 默认值 false → true；存量用户显式保存的 false 保持尊重。触发范围从"仅拖拽"扩展为"拖拽 + 漫步到达"。

### Requirement: 探出幅度语义（原 peekOffsetRatio）
从"按站立宽度的偏移比例（0.2~0.9，默认 0.55）"改为"角色探出屏幕的比例（0.05~0.6，默认 0.3）"，直观对应可见程度。

## REMOVED Requirements

无。
