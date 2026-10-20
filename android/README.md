# v1.4：电脑蓝牙同步（2026-10-20）

保留原应用全部业务，增加「我的 → 电脑蓝牙同步」安全 RFCOMM 服务。Android 12+ 需授权附近设备；同步时保持本应用前台打开，电脑选择方向，两端确认后整份替换。接收前自动备份，API Key、外观和通知设置不传输。真实手机收发尚待安装本版后验证。

Windows 上从源码包根运行 `scripts/build-android.ps1`，需要 JDK 17、Android SDK 33 / build-tools 33.0.2，详见 `docs/BUILD.md`。原 Termux `build.sh` 保留。

输入源码中没有原手机签名密钥。附带 APK 是新测试签名，不能覆盖签名不同的原应用；必须先导出并核验备份，推荐使用原 Termux 密钥构建更新。下文是原版历史说明，版本和路径以本节及新文档为准。

---

# 记账本 (jizhang)

一个完全离线、无广告、无账号、无内购的安卓记账 App。
界面为自包含 HTML 应用，由原生 WebView 承载；数据仅保存在本机。

## v1.2 课表

- 新增 **课表** 页（标签栏第 2 个）：完整一学期周课表，含周一~周日 7 列、每天 11 节。
- 顶部可切周次（`‹ 第 N 周 ›`，另有「本周」一键回到当前周）；今天所在列高亮。
- 页首「今天」卡片列出当天课程（时间 + 地点），没课显示「今天没有课」。
- 点任意课程块弹出详情：上课时间（节次 + 起止时刻）、地点、上课周次（如 `3-4、8-10、15-19 周`）。
- 配色沿用 wakeup 课程表的做法：每门课一种色，浅色主题为淡彩底 + 同色深字，深色主题自动换成半透明彩底 + 浅字；同一时段多门课自动分列（冲堂）。
- 数据来源：教务门户「学生课表」日历导出的 `schedule.ics`，在 PC 上编译成内嵌 JSON 一起打包进 `assets/index.html`。
  **App 不联网、不登录、不需要 Cookie**；换学期时重新生成一次数据即可（见下文「更新课表数据」）。
- 本版仍是 v1.1 的数据格式，可直接覆盖安装。

## v1.1 界面更新

- 统一了账单、月结、统计、AI 和设置页的浅色/深色配色、字体层级与控件样式。
- 月度金额摘要更醒目；新增入口放在账单页头，窄屏查看明细时不会遮挡金额。
- 优化了分类图表、列表、底部导航与编辑弹层的过渡动画，并支持系统“减少动画”设置。
- 导航、分类选择和开关提供轻触反馈；保存与付款状态切换提供确认反馈，均遵循系统触觉设置。
- 月结页可直接切换月份，固定支出的“启用”开关现在可以正常点击。
- Android 状态栏与导航栏会随浅色/深色主题同步。

本版本保留原有数据格式。使用同一 Termux 环境中的签名密钥构建，可覆盖安装旧版并保留账目。构建完成前建议先在 App 中导出一份备份。

## 安装

本压缩包提供 v1.1 源码。将源码放回原来的 Termux 项目目录并运行 `bash build.sh`，生成的 APK 会复制到：

```
/storage/emulated/0/Download/记账本.apk
```

在手机「文件 / 下载」里点击 `记账本.apk` 安装（需允许安装未知来源应用）。
构建脚本沿用原 Termux 环境的签名密钥。首次构建使用新密钥时，不能直接覆盖旧版；请先在旧版中导出备份，再安装新版并导入。

## 功能

- **课表页**：整学期周课表（7 天 × 11 节），可切周次、高亮今天、点课程看详情；数据离线内嵌，不联网。
- **账单页**：按月查看支出总额、日常 / 月结分项、笔数、预算进度；按天分组列出每笔明细。
  底部含 **DeepSeek API 余额卡片**：配置 Key 后显示可用余额 / 赠金 / 充值，并按余额下降估算今日与近 30 天消耗。
  可在「我的」开启「把 API 消耗计入账单」：余额下降会自动记为「API」分类支出（按天合并），计入总支出与统计。
  充值保护：通过 `topped_up_balance` 识别充值，充值时段不记消耗，并在卡片显示「上次充值」。
  局限：DeepSeek 公开 API 只有余额接口，无消费/充值记录接口；若“充值+消费”发生在两次刷新之间，该时段消耗可能少计。充值后立即刷新一次即可避免。
- **月结页**：管理话费、会员、房租、宽带等固定支出（名称 / 金额 / 账单日 / 分类 / **计费周期**）。
  周期支持 **每月 / 每季度 / 每半年 / 每年**，并可选「首次账单月份」
  （例：B站大会员选「每季度」+ 起始 10 月 → 每年 1、4、7、10 月自动出账）。
  到点自动生成本期账单，可标记「已付 / 待付」，逾期红色提示；标记已付后自动计入统计。
  修改固定支出的分类 / 名称时，会同步到已生成的账单明细。
- **统计页**：月度总额、日均、笔数；分类占比条形图；近 6 个月趋势；日常 vs 月结构成。
- **AI 助手页**（需配置 DeepSeek API Key）：
  - **截图导入账单**：选一张账单/支付截图，用 `deepseek-flash` 视觉模型识别金额、日期、商户与分类，确认后批量导入。
  - **AI 账单总结**：把本月支出（总额、分类、环比、大额笔数）发给模型，生成中文总览与省钱建议。
- **我的页**：每月预算、逾期宽限期（账单日后 N 天内不算逾期，默认 3 天）、分类增删改（自定义颜色）、数据导出 / 导入 / 分享、浅色深色主题、清空数据。
- 分类图标为「彩色圆点 + 名称」，界面无任何表情符号。

## 数据与隐私

- 除 DeepSeek 相关功能外，无任何网络请求，无广告 SDK，无账号，无内购。
  DeepSeek 均为可选功能，仅在配置 API Key 后启用，均通过原生请求直连 `api.deepseek.com`：
  余额查询 `GET /user/balance`；截图识别与账单总结 `POST /chat/completions`（截图会作为图片上传给模型）。
  Key 只保存在本机 App 私有目录，不上传、不同步。
- 数据保存在 App 私有目录 `ledger.json`，同时镜像到 WebView 的 localStorage 作为双保险。
- 卸载 App 会删除数据；换机请用「我的 → 导出备份」复制 / 分享 JSON，再在新机导入。

## 源码结构

```
jizhang/
├── AndroidManifest.xml          # 应用清单（包名 com.termux.jizhang）
├── res/
│   ├── values/strings.xml       # 应用名
│   └── mipmap-*/ic_launcher.png # 图标（深青底 + 白色 ¥）
├── src/com/termux/jizhang/
│   └── MainActivity.java        # WebView 外壳 + 原生桥（持久化/剪贴板/分享/GET/POST/图片选择）
├── assets/index.html            # 全部界面与逻辑 + 内嵌课表数据（离线单文件）
└── build.sh                     # 项目专用构建脚本（含 assets 打包）
```

## 重新构建

全部在 Termux 内本地完成，不使用 Gradle / Android Studio / Kotlin / AndroidX。

```bash
cd ~/jizhang
bash build.sh
```

构建后 APK 输出到 `output/记账本.apk`，并自动拷贝到 `/storage/emulated/0/Download/记账本.apk`。

### 编译使用的工具

| 用途 | 工具 | 版本 | 安装 |
|------|------|------|------|
| 资源编译与链接（`res/` → `.flat` → base.apk，含 `assets/`） | **aapt2** | 2.19 | `pkg install aapt2` |
| Java 源码编译（`.java` → `.class`，含 `R.java`） | **ecj**（Eclipse Compiler for Java） | 3.18.0 / v20190522-0428 | `pkg install ecj` |
| `.class` → `classes.dex` | **d8** | 3.3.20-dev（AOSP build 2714f272） | `pkg install d8` |
| APK 签名（v1/v2） | **apksigner** | 0.9 | `pkg install apksigner` |
| zip 对齐（可选） | **zipalign** | — | `pkg install zipalign` |
| 生成 debug keystore / 运行环境 | **keytool / java**（OpenJDK） | 21.0.11 | `pkg install openjdk-21` |
| 生成应用图标 `ic_launcher.png` | **Pillow**（Python） | 12.2.0 / Python 3.13.13 | `pkg install python python-pillow` |

编译目标平台：`~/.pi/agent/skills/apk-builder/platform/android.jar`（Android SDK Platform 33，
软链到 `~/apk_build/android.jar`），由 apk-builder 技能提供。

一键安装依赖：

```bash
pkg install -y aapt2 ecj d8 apksigner zipalign openjdk-21 python python-pillow
```

## 更新课表数据

课表不是运行时抓取的，而是导出 ICS 后编译成常量内嵌进 `assets/index.html`：

```bash
# 1) 拿到门户「学生课表」日历的 ICS（PC 上用 hzpt-jw 的 portal 脚本导出）
#    D:\AIrtifacts\hzpt-jw6-10-06-recon-h5-api\out\schedule.ics
# 2) 生成 KB 常量
python gen_timetable.py schedule.ics > kb_data.js
# 3) 用 kb_data.js 替换 index.html 里 `var KB = {…};` 那一段（含上面几行注释），重新构建
```

`gen_timetable.py` 与 UI 自测脚本在 `D:\AIrtifacts\jizhang6-10-10-add-timetable\`。
学期参数（第 1 周周一、总周数）在脚本顶部：本版为 `2026-09-07` 起共 20 周。

## 源码备份

除本机源码 `~/jizhang/` 外，另在手机 Download 目录备份一份（不含 `output/`）：

```
/storage/emulated/0/Download/jizhang-src/                  # 完整源码副本
/storage/emulated/0/Download/jizhang-src-YYYY-MM-DD.tar.gz # 打包备份
```
