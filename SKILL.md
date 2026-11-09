---
name: nba-paper-depth-autopilot
description: NBA立体纸艺纪录片与短视频全链路制片套件 (NBA Paper-Depth Storyboard, Voice Cloning, Google Flow Batch Feeder & JianYing Pro Autopilot)。贯通 5 大专属子 Agent 逐级审核流水线：(1) 脚本与三层立体纸艺分镜拆解，(2) TTS 口播文案清洗与数字/单位转换，(3) MiniMax 专属解说音色合成（永久锁定 young_nba_narrator_v1 音色 + 1.07x 提速 + 紧凑气口与动态激励增强），(4) 生图/视频双轨提示词生成（视频提示词自动去名人真名防拦截）与 Google Flow 批量分镜投喂器 Chrome 插件自动同步，(5) 分镜视频与音频毫秒级 DP 声学对齐、1080P 成片合成与剪映专业版 (JianYing Pro) 多轨工程自动总装。触发词：'nba-paper-depth-autopilot', '立体纸艺流水线', '启动验证流程', '纸艺分镜制片', 'Google Flow分镜', 'NBA纸艺视频'.
---

# NBA 立体纸艺纪录片与短视频全链路制片套件 (`nba-paper-depth-autopilot`)

本技能将 NBA 商业故事、赛事战报与人物纪录片的制作标准化为 **5 大子 Agent 协同 + 步进式人工审核** 的工业级全链路工作流。

---

## 🧭 核心工作流（5 步逐级审核制片法）

当用户提供一段文案或选题并要求「启动验证流程 / 每一步找我审核再做」时，严格按照以下 **5 个阶段** 推进，**每完成一步必须暂停并等待用户审核确认后再进入下一步**：

### Step 1：脚本分镜拆解 & TTS 纯口播文案清洗
- **调用能力**：`nba-tts-script-cleaner` + `nba-script-storyboarder`
- **执行内容**：
  1. **提取并清洗纯 TTS 口播稿**：剔除所有舞台说明、分段标题与括号注释；将比分/符号/百分比转化为自然中文读法（如 `40+` ➔ `40分以上`，`13比2` ➔ `13比2`，`100%` ➔ `百分之100`）。
  2. **拆解三层纵深立体纸艺分镜表**：按每镜 `4秒` 或 `6秒` 的节奏，将文案拆解为结构化分镜表（包含：镜号、时间码、时长、对应口播文案、前景/中景/后景三层纸艺视觉隐喻、唯一电影运镜）。
- **审核节点 1**：向用户展示【清洗后的纯 TTS 口播文案】与【逐镜分镜拆解表】，询问用户是否确认通过。

### Step 2：MiniMax 专属音色配音合成（微调提速 + 紧凑气口激情版）
- **调用能力**：`minimax-voice-cloner`
- **铁律约束**：
  - **严禁注册或新增任何新音色**（`strict_no_new_clone: true`），永久锁定 `voice_id = "young_nba_narrator_v1"`。
  - 合成无损原声后，默认自动执行 **「微调提速 + 紧凑气口激情版」** 声学母带链：
    - `atempo=1.07`（WSOLA 无损提速 7%，保持原声共振峰与音色 100% 不变）
    - `>0.28s` 纯静音段智能收紧（消除句间拖沓停顿，保留自然呼吸感）
    - 广播级动态激励（`treble=g=2.2:f=4200` + 轻度动态压缩 + `-1dB` 峰值限制）
- **审核节点 2**：输出 `.wav` 与 `.mp3` 音频文件路径及精确时长，请用户试听确认。

### Step 3：立体纸艺双轨提示词生成（生图 + 视频去真名防拦截）
- **调用能力**：`paper-depth-prompt-generator` + `paper-depth-storyboard`
- **执行内容**：
  1. 逐镜生成 **【生图提示词】**（保留球星/人物真名与球衣号码特征，锁定 16:9 复古印刷网点剪贴纸艺风格尾缀）。
  2. 逐镜生成 **【视频生成提示词】**（**自动剔除所有知名球星/人物真名**，统一替换为“图中的人物”或剪纸特征描述，100% 规避 Google Flow 名人审核拦截；锁定单一电影运镜与真实折纸/撕纸/机械拟物音效尾缀）。
- **审核节点 3**：向用户展示完整双轨提示词 Markdown/TXT 并请用户审核。

### Step 4：同步写入 Google Flow 批量分镜投喂器 Chrome 插件
- **插件目录**：`/Users/young/.gemini/antigravity/scratch/google-flow-batch-feeder`（及本技能包内的 `chrome-extension/` 副本）
- **执行内容**：
  - 将审核通过的分镜列表（含口播原文、生图提示词、视频提示词、时长 4s/6s）写入插件内置项目脚本，支持在 Google Flow 中一键自动挂载参考图、填入提示词、切换图片 `16:9` / 视频 `720p` 对应秒数。
- **审核节点 4**：用户在 Google Flow 完成分镜视频生成并下载至本地文件夹后，通知 Agent 进入最后一步。

### Step 5：毫秒级声学音画对齐 + 1080P 成片渲染 + 剪映专业版工程总装
- **调用脚本**：`scripts/assemble_ep0.py` + `scripts/render_video.py` + `scripts/create_jianying_draft.py`
- **执行内容**：
  1. **动态规划 (DP) 声学分句对齐**：基于配音 `.wav` 的 RMS 能量包络与文本字数权重进行全局最优对齐，生成毫秒级对齐的 `.srt` 与 `.ass` 广播级字幕。
  2. **分镜视频智能变速与景别切分**：将生成的分镜视频按故事顺序重命名归档，对齐每句口播时长（超长段落自动拆分为“全景建立镜头 + 核心细节推进特写”），保留原片 `-15dB` 纸艺拟物环境音效并与 `0dB` 配音母带混音，输出 **1080P 30fps 成片 MP4** 与 **纯画面无字幕版 MP4**。
  3. **剪映专业版 (JianYing Pro) 多轨工程生成**：自动在 `/Users/young/Movies/JianyingPro/User Data/Projects/young/JianyingPro Drafts/` 生成包含视频主轨、配音轨、100+ 句独立可编辑字幕轨的剪映工程，并注册至 `root_meta_info.json` 首页置顶。

---

## 📂 目录结构

- `SKILL.md`：本技能主指令文档
- `agents/`：5 大子 Agent 完整定义文件 (`agent.md`)
  - `nba-script-storyboarder/agent.md`
  - `nba-tts-script-cleaner/agent.md`
  - `minimax-voice-cloner/agent.md`
  - `paper-depth-prompt-generator/agent.md`
  - `paper-depth-storyboard/agent.md`
- `scripts/`：声学 DP 字幕对齐、分镜切片混音渲染与剪映工程自动组装脚本
- `chrome-extension/`：Google Flow 批量分镜投喂器 (`Paper Depth Feeder v1.5`) Chrome 扩展源码
