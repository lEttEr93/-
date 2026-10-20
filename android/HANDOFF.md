# 大学食草路 · 开发交接文档

> 交接给下一个对话/开发者。读完这篇即可继续开发，无需翻聊天记录。
> 生成时间：2026-10-10　当前版本：**v1.3（versionCode 4）**
> 开发进度：P0 course/schedule 原生改名 ✅　P1 日程页 ✅　P2 通知合并 course+schedule ✅　P3 AI 工具（只读+add/delete + 对话 UI）✅　待办：课表导入 set_courses

---

## 0. 一句话概览

一个**完全离线、无广告、无账号、无内购**的安卓 App，用「Termux 里手工编译的原生 WebView 外壳 + 单文件 HTML 前端」实现。
前端全部逻辑在 `assets/index.html`（2200+ 行，纯原生 JS，无框架），原生只做外壳与桥接。
App 名 **大学食草路**，包名 `com.termux.jizhang`。

底部导航按「路」分类：**食草路**（日常开销）与 **大学路**（大学生活）。
- 食草路：账单 / 月结 / 统计
- 大学路：课表 / 日程 / 小径（花径 + 石径）
- 固定：切换路按钮（最左）、AI、我的（最右）

---

## 1. 关键路径（务必记牢）

| 用途 | 路径 |
|---|---|
| **唯一源码** | `/data/data/com.termux/files/home/jizhang-visual/` |
| **构建产物** | `~/jizhang-visual/output/大学食草路.apk` |
| **自动拷贝到** | `/storage/emulated/0/Download/大学食草路.apk` |
| **源码备份** | `/storage/emulated/0/Download/jizhang-src/` + `jizhang-src-YYYY-MM-DD.tar.gz` |
| 编译用 android.jar | `~/.pi/agent/skills/apk-builder/platform/android.jar`（Android SDK **Platform 33**） |
| 原始课表融合包 | `/storage/emulated/0/Download/QQ/2026-10-10-add-timetable..7z`（已解压融合进源码） |
| 图标原图（已去白底） | `/storage/emulated/0/Download/app-icon.png`（1254×1254，透明背景） |

> ⚠️ `~/jizhang`（最初基础版）与 `~/jizhang-optimized`（中间版）都是**归档**，不要再改。只维护 `~/jizhang-visual`。
> ⚠️ Download 里的 APK **经常会莫名消失**（系统/文件管理器清理），发现没了就从 `output/` 重新 `cp` 一份。

---

## 2. 构建环境与命令

**不需要** Gradle / Android Studio / Kotlin / AndroidX。全部在 Termux 本地用命令行编译。

```bash
cd ~/jizhang-visual && bash build.sh
```

`build.sh` 流程：aapt2 compile → aapt2 link（含 `-A assets`）→ ecj 编译 Java → d8 转 dex → 组包 → apksigner 签名 → 拷到 Download。

已安装工具及版本（`pkg install` 得到）：

| 工具 | 版本 | 用途 |
|---|---|---|
| aapt2 | 2.19 | 资源编译链接（res/layout、res/drawable、mipmap、assets） |
| ecj | 3.18.0 | Java 编译（**Java 7 源级**，无 lambda） |
| d8 | 3.3.20-dev | class → dex |
| apksigner | 0.9 | 签名（debug keystore 在 apk-builder 技能目录） |
| openjdk | 21.0.11 | keytool / 运行 ecj |
| python3 + Pillow | 3.13 / 12.2.0 | 生成图标（Pillow 现装在现代 Python 下，注意版本目录） |

一键安装：
```bash
pkg install -y aapt2 ecj d8 apksigner zipalign openjdk-21 python python-pillow
```

清单：`minSdkVersion=24`，`targetSdkVersion=33`，版本 `versionCode=3 / versionName=1.2`。

---

## 3. 目录结构

```
jizhang-visual/
├── AndroidManifest.xml                 包名/权限/Activity/Service/Receiver
├── build.sh                            构建脚本（APK_NAME="大学食草路"）
├── README.md                           面向用户的功能说明（非本文档）
├── assets/index.html                   全部界面与逻辑（单文件，~129KB / 2253 行）
├── res/
│   ├── values/strings.xml              app_name = 大学食草路
│   ├── mipmap-*/ic_launcher.png        五档图标（由 app-icon.png 生成）
│   ├── layout/notif_agenda.xml         常驻提醒的自定义布局（RemoteViews）
│   └── drawable/ic_stat_agenda.xml     状态栏小图标（白色矢量）
└── src/com/termux/jizhang/
    ├── MainActivity.java               WebView 外壳 + JS 桥
    ├── ReminderService.java            常驻提醒前台服务（课表+日程）
    ├── ReminderBootReceiver.java       开机自动重启提醒服务
    ├── Ingest.java                     采集队列（files/ingest.jsonl）
    ├── IngestReceiver.java             短信广播 → 采集队列
    └── NotifListenerService.java       通知监听 → 采集队列（轻量关键词过滤）
```

---

## 4. 架构

```
┌──────────────────────────── Android APK ────────────────────────────┐
│  MainActivity (Activity)                                             │
│   └── WebView  file:///android_asset/index.html   ← 前端全在这里      │
│         │ window.Android.*（@JavascriptInterface 桥）                │
│         ▼                                                            │
│  Bridge（MainActivity 内部类）                                        │
│   持久化 / 剪贴板 / 分享 / GET / POST / 图片选择 / 触觉 / 主题 /        │
│   课表数据下发 / 通知服务开关 / 通知权限                                │
│                                                                      │
│  ReminderService（前台服务）─ 每 30s 刷新常驻通知（读 files/course.json）│
│  ReminderBootReceiver       ─ 开机重启上面的服务                        │
└──────────────────────────────────────────────────────────────────────┘
```

前端要点：
- 单文件 `index.html`：CSS + 原生 JS，全部函数在同一个 `<script>`。
- 数据存在 App 私有目录 `files/ledger.json`（原生写），同时镜像到 `localStorage` 双保险。
- 事件用 **document 级事件委托**（`data-act="..."`），所以 `innerHTML` 重渲染后依然可用。
- `render()` 全量重渲染当前页；`rerenderKeepScroll()` 保持滚动位置；`slideNav(dir)` 做左右推挤式页面切换。

---

## 5. index.html 源码导航（改哪里看哪里）

行号基于当前版本，改动后会漂移，用 grep 找函数名更稳。

| 行 | 函数 / 变量 | 作用 |
|---|---|---|
| 367 | `var S` | 全局数据状态 |
| 374 | `roadKeys()` | 当前路的标签键顺序 |
| 375 | `doSwitchRoad()` | 切换 食草路/大学路 |
| 398-433 | 日期/金额工具 | `todayStr` `normalizeDate` `isOverdue` `shiftMonth` `fmt` `esc`… |
| 440 | `bridge()` | 返回 `window.Android`（无则 null） |
| 441 | `defaultState()` | 默认数据结构（**加字段改这里**） |
| 448 | `normalize()` | 载入时的字段补全/校验（**加字段也要改这里**） |
| 474/482 | `loadData/persist` | 读/写（persist 有 250ms 防抖） |
| 502-527 | 月结周期工具 | `cycleDef/cycleLabel/cycleMonths/anchorMonth/isDuePeriod/currentDue` |
| 531 | `ensureRecords()` | 按周期生成/清理月结账单记录 |
| 566-657 | 增删改 | `saveExpense/deleteExpense/saveBill/deleteBill/setPaid/saveCategory/deleteCategory` |
| 659 | `svgIcon(name,on)` | 内联 SVG 图标（**无 emoji**；现有键：bill/kb/monthly/stats/me/plus/empty/ai/swap） |
| 677 | `renderTop()` | 顶栏（标题区 + 月份区，可随滚动收起） |
| 709 | `renderTabs()` | **底部 6 格导航**（切换钮 + 3 功能 + AI + 我的） |
| 731 | `renderBill()` | 账单页（含搜索/筛选/日折叠/日历/FAB） |
| 784 | `renderDayCard()` | 某一天的明细卡 |
| 804/808 | `openCalendar/renderCalendar` | 日历跳转弹层 |
| 865/898 | `deepseekCard/deepseekSettings` | DeepSeek 余额卡 / 设置卡 |
| 913-980 | `fetchDeepseek/processApiConsumption` | 余额查询、消耗估算、充值保护 |
| 982 | `renderMonthly()` | 月结页 |
| 1064 | `renderStats()` | 统计页（分类横杠按天分段） |
| 1160-1209 | `pickSegIndex/barStart/barMove/barEnd` | 统计横杠**滑动选择**（最小命中宽度吸附） |
| 1211 | `renderMe()` | 我的页（预算/宽限期/分类/DeepSeek/通知/备份/外观/关于） |
| 1288-1470 | AI 相关 | `aiRequest/parseChat/parseItems/handleImageFile/renderImportPreview/openImportItemEditor/saveImportItem/confirmImport/buildSummaryPrompt/aiSummary/renderAI` |
| 1473-1610 | `var KB = {...}` | **课表数据**（整学期，离线内嵌） |
| 1613 | `renderKB()` | 课表页 |
| 1697 | `render()` | 主渲染分发（按 tab 调各页） |
| 1715 | `slideNav(dir)` | 切页/切月/切路的双层推挤滑动 |
| 1751 | `applyTheme()` | 计算 CSS 变量（强调色/透明度/模糊） |
| 2167 | `buildScheduleForNotification()` | 生成「日期→课程」下发原生 |
| 2223 | `boot()` | 启动：载数据、恢复 road、渲染、挂滚动监听、恢复通知 |

其它常用：`openSheet/closeSheet`（底部弹层，带动画关闭）、`toast`、`haptic(kind)`、`rerenderKeepScroll`、`currentDark`、`mixHex/rgbaHex`。

---

## 6. 数据模型（`S`）

```js
S = {
  v: 1,
  categories: [ {id, name, color} ],         // 分类（含内置 c_api=API、c_other=其他）
  expenses:   [ {id, kind:'daily'|'monthly'|'api', amount, categoryId, date:'YYYY-MM-DD',
                 note, createdAt, billId?, period?} ],
  bills:      [ {id, name, amount, categoryId, day:1..31, note, active,
                 cycle:'monthly'|'quarterly'|'halfyear'|'yearly', anchor:'YYYY-MM', createdAt} ],
  records:    [ {id, billId, period:'YYYY-MM', amount, paid, paidDate, expenseId} ],
  budget:     { enabled, amount },
  graceDays:  3,                              // 逾期宽限期（天）
  deepseek:   { enabled, key, model?, last:{total,granted,topped,at,currency,available},
                history:[{t,total}], record:false, baseline, lastRecharge, error, fetching },
  theme:      'auto'|'light'|'dark',
  appearance: { accent:'', alpha:1, blur:false },
  notify:     { enabled:false },              // 课表常驻通知开关
  schedule:   [ {id, title, date:'YYYY-MM-DD', start:'HH:MM'|'', end:'HH:MM'|'',
                 loc, note, cat:'study'|'exam'|'life'|'other', done, createdAt} ],  // 日程（非课程）
  chats:      [ {id, title, hist:[...], createdAt, updatedAt} ],  // AI 对话；hist 为 API 消息（图片不落盘，转成“[图片]”）
  chatActive: 'chat-id',
  kb:         null | {term,start,weeks,times,courses},          // 覆盖内嵌课表；null=用 KB_BUILTIN（见第 10 节）
  tools:      [ {id, name, description, parameters, code, enabled, createdAt, updatedAt} ],  // AI 现场编写的本地工具
  paths:      { hua:[{id,title,note,deadline,done,createdAt}], shi:[...] },  // 小径：花径（兴趣）/石径（学校指标）
  road:       'food'|'uni',
  createdAt
}
```

持久化：原生 `files/ledger.json`（`Android.save/load`）+ `localStorage['jizhang.ledger.v1']` 双写。
换机用「我的 → 导出/导入备份」（JSON 文本，可复制/分享/粘贴）。

---

## 7. 功能总览

### 食草路
- **账单**：月度总额、预算进度、日常/月结拆分；搜索 + 分类筛选；「全部/按月」切换表头月份；**只展开一天、其余收成小方块**（点方块切换展开）；**日历弹层跳转日期**；滚动时顶栏标题区收起、右下角出现「+」悬浮记一笔；底部 DeepSeek 余额卡。
- **月结**：固定支出（话费/会员/房租…）支持**计费周期**（每月/每季度/每半年/每年）+ 起始月份，自动按周期生成账单、标记已付/待付、逾期提醒（带宽限期）；改分类/名称会同步已生成的账单明细。
- **统计**：月度总额/日均/笔数；**分类占比横杠按天分段、同色两明度交替**；横杠上**滑动选择**某天（吸附算法 + 放大高亮 + 浮动金额小窗）；近 6 个月趋势；日常 vs 月结构成。

### 大学路
- **课表**：整学期离线数据；按周切换、今天高亮、冲堂分道、课程详情弹层；「今天 N 节课」卡片。
- **日程**（P1）：独立于课表的非课程安排。顶部月份切换 + 「日历」按钮（与账单同款日历弹层，选日期后下方列出该日安排）；条目支持时间/地点/备注/分类、勾选完成、增删改。数据存 `S.schedule`。
- **小径**（v1.3 壳子）：一个导航位内分「花径 / 石径」两个分支。花径=个人兴趣（游戏/设计软件/Blender…），石径=学校指标（等级考试/志愿时长…）。项目字段 `{id,title,note,deadline,done,createdAt}`，存在 `S.paths.{hua,shi}`；支持新建/编辑/删除/勾完成；「让 AI 安排」会跳到 AI 并发请求（AI 可用 `get_paths` 读取项目，结合 `find_free_slots` 安排）。

### 固定
- **自动采集（最小版）**：短信（`RECEIVE_SMS` 广播）与通知（`NotificationListenerService`）只把**原文**写入 `files/ingest.jsonl`，不做金额解析；「我的 → 自动采集 → 待处理」可查看/粘贴调试，**一键交给 AI**，由 AI 调 `add_expenses` 入账（不自动改账，仍走确认）。
- **AI**（v1.3）：仿 agent 的**对话式聊天界面**（`renderAI`/`chatRender`），支持文字与图片。内核：DeepSeek 原生 Tool Calls + **SSE 真流式**（原生 `httpPostStream` → `window.__onAIStream` → `aiStreamOnce`/`agentRun`，无步数上限，`max_tokens=4096`）。**支持多轮对话、多会话切换/新建/删除、历史记录（存 `S.chats`）**；顶部有「历史/新对话」，底部固定输入栏 + 快捷 chips（总结本月/找空闲/本周课表）+ **工具调用状态**（“调用工具 xxx”）。工具：只读 `get_overview / search_expenses / search_schedule / get_courses / find_free_slots / get_timetable / get_paths`；写 `add_schedule / add_expenses / delete_schedule / set_courses / add_courses / update_course / delete_courses`（**写操作一律弹层预览+确认**）。**统计**：`count / sum / query`（筛选+计数+求和+均值/最值+分组，数据集 expenses/schedule/courses）。**自定义工具**：`create_tool / list_tools / delete_tool` —— AI 现场编写 JS 工具（`new Function(args,cb,code)`，屏蔽 window/document/fetch/Android），存入 `S.tools`，每次对话经 `allTools()` 自动加载；「我的 → 自定义工具」可查看/删除。
- **我的**：预算、逾期宽限期、分类增删改、DeepSeek 设置（Key、是否把 API 消耗计入账单）、**课表常驻通知开关**、数据导出/导入、**外观**（主题/强调色/透明度/毛玻璃）、关于、清空数据。

### 系统联动
- **课表+日程常驻提醒**（前台服务 `ReminderService`）：下拉通知常驻显示「今天 N 节课 · M 项日程 · 第 W 周 + 横向圆角半透明条目块 + 进行中/下一项 + 实时倒计时（系统 Chronometer）」，课程与日程**按时间合并、同优先级**；正文把所有条目列成一行，过长时**横向 marquee 滚动**。横向色块是 `Bitmap`+`Canvas` 画的圆角半透明块（见第 11 节 ecj 坑）。整学期课表 + 全部日程一次性下发原生，**跨天自动正确**；每 30s 刷新；开机自动重启；点通知跳到课表页。

---

## 8. 原生桥接（`Android.*`）

在 `MainActivity.Bridge` 内，`@JavascriptInterface`：

| 方法 | 说明 |
|---|---|
| `load()` / `save(json)` / `hasData()` | 读写 `files/ledger.json` |
| `copy(text)` / `share(text)` / `toast(msg)` | 剪贴板/分享/Toast |
| `haptic(kind)` | 触觉反馈，kind=`tick`\|`success` |
| `setAppearance(dark)` | 同步状态栏/导航栏/WebView 背景 |
| `appVersion()` | 版本字符串 |
| `httpGet(url, auth, cb)` | 后台 GET，回调 `window[cb](status, body)` |
| `httpPost(url, auth, body, cb)` | 后台 POST(JSON)，同上 |
| `httpPostStream(url, auth, body, cb)` | 后台 POST + SSE 流式：每读到一行回调 `window[cb](line)`；结束回调 `\u0000END`，出错回调 `\u0000ERR 类型` |
| `setCourses(json)` | 写 `files/course.json`（整学期课表，原 setSchedule） |
| `setSchedules(json)` | 写 `files/schedule.json`（全部日程，按日下发；已完成的不发） |
| `hasNotifPermission()` / `requestNotifPermission()` | 通知权限 |
| `startReminderService()` / `stopReminderService()` | 开/关前台服务（并写/删 `files/reminder_enabled` 标记） |
| `hasNotifPermission()` / `requestNotifPermission()` | 通知权限（第一条通知） |
| `openNotifSettings()` | 打开系统通知设置 |
| `peekIngest()` / `takeIngest()` / `clearIngest()` / `ingestCount()` | 采集队列：读/取走/清空/计数（`files/ingest.jsonl`） |
| `hasSmsPermission()` / `requestSmsPermission()` | 短信权限（RECEIVE_SMS 运行时申请） |
| `hasNotifAccess()` / `openNotifAccessSettings()` | 通知使用权检查 / 跳系统设置 |

JS 侧被原生调用的全局回调：`window.__onAIChat`、`window.__onDeepseekBalance`、`window.__onNotifPermission(granted)`、`window.__openTab(tab)`。

---

## 9. DeepSeek 集成（唯一的联网点）

- 余额：`GET https://api.deepseek.com/user/balance`（Header `Authorization: Bearer <key>`），返回 `balance_infos[].{total_balance,granted_balance,topped_up_balance}`。
- 对话/识图：`POST /chat/completions`，模型 **`deepseek-flash`**（视觉，支持 base64 `image_url`）。`deepseek-v4-pro` **不支持图片**。
- Key 存在 `ledger.json` 的 `S.deepseek.key`（仅本机）。
- 「把 API 消耗计入账单」：按余额下降估算，用 `topped_up_balance` 识别**充值**并跳过该时段；只有余额接口、无消费记录接口，故为估算。
- 请求走原生桥（绕开 WebView file:// 跨域）。

---

## 10. 课表数据与通知

- 数据：`assets/index.html` 里的 `var KB_BUILTIN = {...}`（只读底本）；运行时全局 `KB` 默认指向它，若 `S.kb` 存在则被覆盖（`normalize()` 里 `KB = s.kb || KB_BUILTIN`）。AI 的课表工具会深拷贝当前 `KB` → 确认 → `applyTimetable()` 写入 `S.kb` 并重发通知。
  - `times`：11 节 [开始,结束] 时刻表（08:40 起，每节 40 分钟）。
  - `courses[].s[]`：`{d:星期1-7, p:[起节,止节], w:[周次], r:地点}`。
  - 学期：2026-2027 第一学期，`start=2026-09-07`，`weeks=20`。
- 更新课表：用融合包里的 `gen_timetable.py`（ICS → `var KB = {...}`，学期参数在文件顶部）重新生成，替换 `var KB` 整行即可。
- 通知数据流：`buildCourseForNotification()` / `buildScheduleForNotification()` 把整学期课程与全部日程 → `Android.setCourses()` / `setSchedules()` → `files/course.json`、`files/schedule.json` → `ReminderService` 每 30s 刷新时读当天两类数据、合并排序后渲染。

---

## 11. 约定与坑（重要！）

1. **绝对不用 emoji**（用户明确要求）。用「彩色圆点 + 文字」和**内联 SVG 线性图标**（`svgIcon`）。
2. **无框架、无 AndroidX、无 Gradle/Kotlin**；Java 用 **ecj（Java 7 源级）** → 不要用 lambda、var、文本块。
3. **ecj 读不了某些新常量**（曾踩坑）：
   - `HapticFeedbackConstants.CONFIRM` → 用数值 `16`；
   - `Manifest.permission.POST_NOTIFICATIONS` → 用字符串 `"android.permission.POST_NOTIFICATIONS"`。
   遇到 "cannot be resolved or is not a field" 且 javap 里明明有，就换字面量。**方法同理**：`RemoteViews.setColorStateList(...)`（API 31）javap 里有、ecj 报 undefined → 改用位图/旧 API 实现（通知里的圆角色块就是直接用 `Bitmap`+`Canvas` 画好、`setImageViewBitmap` 显示）。
4. **不要用 flex 子项的百分比宽度**做分段条（在 WebView 里会塌成 0）→ 用**硬色标 `linear-gradient`** 拼接色段（统计横杠就是这么做的）。
5. 改 `S` 的数据结构时，**`defaultState()` 和 `normalize()` 都要改**（向后兼容）。
6. 重渲染会丢滚动位置：局部刷新用 `rerenderKeepScroll()`；整页切换用 `slideNav(dir)`（双层推挤，避免遮挡与二次淡入）。
7. `applyTheme()` 在每次 `render()`（经 `syncAppearance()`）里调用，改主题相关 CSS 变量走这里。
8. 底部导航改结构看 `renderTabs()` + `ROADS`/`roadKeys()`/`doSwitchRoad()`。
9. 事件一律 `data-act="..."` + document 委托；弹层用 `openSheet/closeSheet`（关闭有下滑动画）。
10. targetSdk 33（Android 14 上前台服务无需声明 type；精确闹钟没用，本 App 不走 AlarmManager）。
11. 布局/图标等资源放 `res/`，aapt2 会一起编译（`res/layout/notif_agenda.xml` 就是通知的自定义布局，只能放 RemoteViews 允许的控件：LinearLayout/TextView/Chronometer/ImageView/Button 等）。
12. **命名约定**：课表课程统一用 `course`（KB、`setCourses`、`course.json`、`ReminderService`）；「日程」（非课程安排）统一用 `schedule`（`S.schedule`、`renderSchedule`、`schedule.json`）。别再混用。
13. **RemoteViews 动作必须与控件类型匹配**：`setTextViewText` 只能打 `TextView`、`setImageViewBitmap` 只能打 `ImageView`。打错类型会在系统端 apply 时抛 `ActionException`（曾导致闪退）。通知里的圆角色块改成 ImageView 后，就删掉多余的 `setTextViewText`。
14. **崩溃/通知异常会落盘**：`MainActivity` 装了全局 `UncaughtExceptionHandler` → `files/last_crash.txt`；`ReminderService.buildSafe()` 失败 → `files/notif_error.txt`。下次启动时 JS 调 `Android.lastCrash()` 自动复制到剪贴板并提示。排查闪退就用这个（logcat 读不到本 App 日志）。
15. **「我的」页控件要保留滚动**：更新用 `rerenderKeepScroll()`，不要用 `render()`（后者会 `scrollTop=0` 跳回顶部）。
16. **AI 历史能接续**：`chatSaveCurrent()` 用 `sanitizeMsgs()` 落盘时，**必须保留 assistant 的 `tool_calls` 与 tool 的 `tool_call_id`**（content 为 null 的 assistant 工具调用消息不要当成图片/文本丢掉），否则重启后历史里的 tool 消息没有对应 tool_calls，接口会报错无法接续。图片消息落盘时转成文本占位。
17. **发图是「先暂存后发送」**：`CHAT.attachments` 暂存多张（可移除），点发送时拼成 content 数组（text + 多个 image_url）一并发送，不是选完即发。

---

## 12. 如何给「大学路」加功能（下一步最可能做的事）

1. 在 `ROADS.uni.funcs` 里把空的 `["",""]` 换成一个 `["key","标签"]`（例如 `["grades","成绩"]`）。
2. 在 `svgIcon` 的 `p` 对象里加 `key` 对应的 SVG path。
3. 写 `function renderGrades(){ ... return html; }`。
4. 在 `render()` 的分发里加 `else if (tab === "grades") renderGrades();`。
5. 若要下发/持久化数据，记得改 `defaultState()/normalize()`。

`render()` 分发当前是：`bill / kb / schedule / monthly / stats / ai / me`。

---

## 13. 测试方法（没有真机/模拟器）

- 语法：`node --check`（把 `<script>` 抽出来）。
- 逻辑：用 node 跑 **DOM 桩 harness**（我一路都是这么测的）——手写 `document`/`element` 桩，`vm.runInThisContext` 载入 `<script>`，然后直接调内部函数断言。本轮所有改动都配了这类测试（均通过）。
- 包校验：`aapt2 dump badging`（应用名/版本/权限）、`aapt2 dump xmltree --file AndroidManifest.xml`（Service/Receiver）、`unzip -p apk assets/index.html | grep ...`（资源内容）。
- 外观类改动（动画、通知排版）**无法自动验证**，需真机看效果。

---

## 14. 版本历史与归档

- v1.0 基础记账（账单/月结/统计/AI/外观）。
- v1.1 视觉改版（配色、触觉、状态栏同步、过渡动画、图标）。
- v1.3 大学路「日程」页 + 日程合并进常驻提醒（圆角半透明色块、超长横向滚动）+ AI 对话式 agent（工具读写账目/日程）+ 崩溃日志自取。
- v1.2 融合课表页（用户提供的融合包）、课表常驻通知、底部「路」分类导航、切路动画、统计横杠滑动选择等。
- 归档源码：`~/jizhang`、`~/jizhang-optimized`（勿改）。
- 备份快照：`Download/jizhang-src-2026-10-02/03/10.tar.gz`。

---

## 15. 用户偏好与风格（重要）

- **讨厌 emoji**，界面里一个都不要。
- 讨厌市面记账软件的**广告与收费**，本 App 要纯离线、无账号、无内购。
- 喜欢**简洁、克制**的设计；配色可自定义（曾觉得默认青绿丑，所以做了强调色/透明度/毛玻璃）。
- 对性能不敏感：「不是电老虎，放心常驻后台自动刷新」——前台服务可接受。
- 交互偏好：左右平移（推挤式）切换、滚动收起大标题、悬浮加号、底部弹层关闭要有动画。
- 提需求通常是中文、口语化、直给；回复也建议中文、结论先行、给路径与命令。

---

## 16. 下一步候选（TODO / 想法池）

- [x] 自动采集最小版：短信/通知原文入队 + 待处理 + 丢给 AI。下一步（可选）：来源白名单、置信度/自动入账、去重指纹、AI 批量预览。
- [ ] 小径的 AI 真正「安排时间」（get_paths + find_free_slots → add_schedule）。
- [x] P2：`ReminderService` 已合并 course+schedule，同优先级、过长横向滚动。（真机视觉待验）
- [x] P3：AI agent 内核（DeepSeek 原生 Tool Calls+SSE 流式）+ 对话式聊天界面（多会话/历史）+ 全部工具（含课表修改 get_timetable/set_courses/add_courses/update_course/delete_courses）。
- [ ] 视需要把版本提到 v1.3 / versionCode 4（`AndroidManifest.xml` + `appVersion()` + 关于页三处）。
- [ ] 课表常驻通知的真机视觉微调（Android 12+ 会规整自定义通知样式）。
- [ ] 可选：自适应图标（前景+背景分层）避免部分桌面给图标垫底。
- [ ] 可选：收入/账户、全局搜索、通知里加「记一笔」按钮。

---

### 快速上手 checklist（新对话第一步）

```bash
cd ~/jizhang-visual                 # 唯一源码
sed -n '1,40p' assets/index.html    # 看 CSS 变量与结构
grep -n "^function " assets/index.html   # 函数索引
bash build.sh                       # 编译 → Download/大学食草路.apk
```
改完记得：编译 + 同步备份（`Download/jizhang-src/` 与当日 tar.gz）。
