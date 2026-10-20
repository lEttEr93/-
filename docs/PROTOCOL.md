# 本地蓝牙协议 v1

Android 使用 `listenUsingRfcommWithServiceRecord` 发布安全 RFCOMM 服务，Windows 根据 UUID 查询 SDP 并连接，不使用 A2DP 音频流，不需要局域网或云端。只接受已配对设备。Windows 显式要求认证与加密。

- UUID：`b87c73a1-9c63-4ba4-a8c6-2198b4201400`
- 帧：4 字节大端长度，随后 UTF-8 JSON；单帧最多 8 MiB。业务快照最多 7 MiB UTF-8。
- 公共字段：`protocol:1`、`id`（本次请求 ID）、`type`。
- 电脑发 `pull`，手机确认后回 `snapshot`（`data`），电脑确认后备份并替换。
- 电脑发 `push`（`data`），手机确认、备份、保存后回 `ack`。
- 拒绝／错误回 `error`（`error` 文本）。同时仅一个待确认请求，等待最长 120 秒；超时后重新连接可清除手机待确认请求。
- 以共享字段白名单生成快照；接收前验证结构、类型、时间、周次、大小。接收方保留自己的敏感配置与设备设置。
- 替换确认期间检查本地数据版本；本地已变化则拒绝替换。AI 流式生成或待确认工具执行期间拒绝发起／接收替换。

Windows `SOCKADDR_BTH` 按微软 `ws2bth.h` 的 `pshpack1` 布局：总长 **30**，family 偏移 0，地址偏移 2，GUID 偏移 10，channel 偏移 26；channel 为 0 时按服务 UUID 查询。不能使用 x64 默认结构体对齐。原生辅助进程与 Electron 之间为 NDJSON，二进制帧仅用于蓝牙连接。

参考：https://learn.microsoft.com/en-us/windows/win32/api/ws2bth/ns-ws2bth-sockaddr_bth 及微软 WinSDK ws2bth.h。原生模块实际枚举设备已验证，真实手机服务连接待新版安装后测试。
