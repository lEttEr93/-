# 构建

Node 22+、npm、.NET SDK 8、JDK **17**、Android SDK platform 33 / build-tools 33.0.2。默认 Android 构建使用该版本的 D8，JDK 21 的合成参数元数据与旧 D8 不兼容。

本工作区先运行 `. D:\AI\bin\aienv.ps1`，缓存与临时目录分别使用 AI_CACHES、`D:\AI\scratch`。不要将 SDK、模型或依赖缓存提交到仓库。

```powershell
npm.cmd ci
npm.cmd run build:web
npm.cmd test
dotnet publish native/CampusBluetooth.csproj -c Release -r win-x64 --self-contained true -o build/bluetooth --configfile native/NuGet.Config
npm.cmd start
```

Windows 打包（目标必须为空）：

```powershell
node scripts/package.cjs D:\AI\artifacts\campus-life\2026-10-20-desktop-android\out\windows
```

Android（在当前 PowerShell 会话运行）：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& scripts/build-android.ps1 -Sdk D:\AI\tools\android-sdk -Jdk C:\path\to\jdk-17
```

默认生成 `build/android/campus-life-1.4-test.apk`，测试密钥默认保存在工作区 runs 的 signing 目录。正式覆盖安装必须指定原密钥：

```powershell
$env:CAMPUS_KS_PASS = 'your-keystore-password'
& scripts/build-android.ps1 -Sdk C:\Android\sdk -Jdk C:\Java\jdk-17 -Keystore C:\keys\original.keystore -Alias original-alias
```

Termux 可继续使用 `android/build.sh`，需原 apk-builder 工具链和原签名密钥。源码包不包含 SDK／JDK／node_modules。

集成验证：

```powershell
node scripts/smoke.cjs
# 仅受限自动化环境启动失败时，设置 CAMPUS_TEST_NO_SANDBOX=1 后再运行。
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:\path\to\chrome.exe'
node scripts/test-phone-ui.cjs
```

smoke 使用真实 Electron 窗口和本机蓝牙枚举，数据隔离在 runs；phone-ui 使用模拟 Android JS 桥验证手机确认流程，不代表真实蓝牙收发。测试截图与结果写在 runs；需要保留的报告复制到 artifacts。
