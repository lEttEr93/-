# 大学食草路 · 桌面与手机

Windows 桌面应用、课表/日程常驻小组件，以及兼容现有数据的 Android 蓝牙伴侣。
完整使用、构建和同步说明见 docs/USER_GUIDE.md；原始实现保存在 git 首次导入提交中。

源码来自用户提供的 jizhang-src-2026-10-20.tar..gz。账单、月结、统计、课表、日程、小径和 AI 均共用 Android 的业务实现。

开发环境：Node 22+、Electron 43.4、.NET 8 SDK、JDK 17+、Android SDK platform 33/build-tools 33.0.2。

```powershell
npm ci
npm run build:web
npm test
npm start
```

原手机签名密钥未包含在输入包内。覆盖安装必须沿用手机原密钥，操作前请导出备份。
