# 功能清单

以原厂页面可实际执行的功能为准。✅ = 已实现并验证；⚠ = 已实现但未做真实流量/环境验证；🚫 = 原厂固件本身无可执行页面或接口。

## 概览 / 监控

| 功能 | 状态 | 说明 |
|---|---|---|
| 设备信息、固件版本、运行时间 | ✅ | `topstatus_misc_show` |
| WAN/LAN/无线状态 | ✅ | `topstatus_interface_parame_show` / `topstatus_wireless_show` |
| CPU / 内存曲线 | ✅ | 监控页 Canvas |
| WAN/LAN/WLAN 流量曲线 | ✅ | 统计接口采样 |
| 在线客户端 | ✅ | DHCP 租约 + 无线关联 |

## 无线

| 功能 | 状态 | 说明 |
|---|---|---|
| 无线电开关、SSID、广播 | ✅ | `wire_bas_ap_set.cgi` |
| 无线模式 802.11b/g/n/b+g/g+n/b+g+n | ✅ | `band` 字段 |
| 区域、信道、20/40MHz | ✅ | 区域联动信道 |
| 工作模式 AP / Client / Repeater / WDS / AP+WDS | ✅（WDS 仅模式选择） | 原厂 WDS 配置页为空函数 |
| 无线安全 WEP / WPA / WPA2 / mixed | ✅ | `wirel_sec_set.cgi` |
| WPS 启停、PIN、PBC、生成 PIN | ⚠ | 启停已验证；实际配对未验证 |
| 站点扫描 | ✅ | `wireless_SITE_SURVEY_show.cgi` |
| 已连主机 | ✅ | `wireless_ASSOCIATE_HOST_show.cgi` |
| 高级射频：Beacon/RTS/Fragment/DTIM/速率/聚合/认证/前导码/功率/ShortGI/Gmode/AP 隔离/IAPP/WMM | ✅ | `wire_adv_set.cgi` |
| 无线接入控制（MAC 白/黑名单） | ✅ | `wire_filter_mac_*` |

## 上网设置

| 功能 | 状态 | 说明 |
|---|---|---|
| DHCP / 静态 IP / PPPoE | ✅ | 三套 WAN 设置接口 |
| 连接 / 断开 | ✅ | `wan_connect_disconnect.cgi` |
| 自动检测 WAN 类型 | ✅ | `wan_connect_aotu_set.cgi` |
| WAN MAC 克隆 / 恢复默认 | ⚠ | 按钮与取值已验证；未实际应用 |
| DDNS | ⚠ | 保存已验证；未用真实账号验证解析 |

## 局域网

| 功能 | 状态 | 说明 |
|---|---|---|
| 三种模式 LAN IP，当前模式高亮 | ✅ | 只读模式区分，不随切换动态改 |
| DHCP 服务器、地址池、租期 | ✅ | `dhcp_setup.cgi` |
| DHCP 租约列表 | ✅ | `dhcp_client_show.cgi` |
| 静态 MAC→IP 绑定 | ✅ | 增删已验证 |
| 静态路由 + 路由表 | ✅ | HOST 类型掩码锁定 `/32` |

## 客户端 / 中继

| 功能 | 状态 | 说明 |
|---|---|---|
| WISP 上游状态、`WISP-` 前缀 | ✅（模拟验证） | 未实际切模式 |
| 扫描、连接上游 AP | ✅（模拟验证） | `wl_site_surver_connect.cgi`（`ssid` + `bssid`） |
| 安全配置下发 | ✅ | `wirel_sec_set.cgi` |

## 安全

| 功能 | 状态 | 说明 |
|---|---|---|
| 端口转发（16 种协议预设） | ✅ | 外网起止 + 内网端口分开 |
| 端口触发（5 个预设） | ✅ | 增删已验证 |
| DMZ / 超级 DMZ | ✅ | 双标签卡片，互斥 |
| UPnP | ✅ | `UPnPSet.cgi` |
| MAC / IP / 网址过滤 | ✅ | 含每天/星期/时段 |
| QoS | ⚠ | 规则增删已验证；限速效果未测 |
| IGMP 代理 | ✅ | `Igmp_proxy_StatusSet.cgi` |
| VPN ALG（PPTP/L2TP/IPSec） | ✅ | `vpn_status.cgi` |
| FTP ALG 私有端口 | ✅ | `ftp_private.cgi` |
| 独立防火墙 / SPI | 🚫 | 该固件无对应状态接口 |
| URL 记录 | 🚫 | 已从 UI 移除（原厂功能实际不可用） |

## 系统

| 功能 | 状态 | 说明 |
|---|---|---|
| 时区 / NTP | ✅ | `misc_system_gmt_set.cgi` |
| 管理员密码 | ✅ | `UserPassSet.cgi` |
| 远程管理 | ✅ | `Remote_Management_set.cgi` |
| 固件升级（仅 `.bin`） | ✅ | 等待框保持到 CGI 就绪；跳转后数据未加载会提示重连 Wi-Fi |
| 重启 / 恢复出厂 | ✅ | `reboot.cgi` / `RestoreDefault.cgi` |
| 断线 / 重连提示 | ✅ | 首页 CGI 全部失败时显示“无法连接到路由器”，带重试与自动探测 |
| 升级后页面空白保护 | ✅ | `waitForRouter` 校验 `lan_ip/version`，不再只凭 HTTP 可达就跳转 |
| 系统日志 / 连接日志分栏 | ✅ | 系统日志过滤掉 CONNECTION 记录；连接日志解析 CSV+JSON |
| 网络唤醒 | ✅ | `wakeup.cgi` |
| LED 控制 | 🚫 | `led_show.cgi` 超时，固件不支持 |
| TFTP / FTP 升级 | 🚫 | 原厂仅提供 HTTP 上传 |
| 配置备份 / 恢复 | 🚫 | 原厂仅有文案，无 CGI |
| DDNS Gonetis | 🚫 | 服务商下拉无此项 |

## 页面布局

- 新控制台：`/index.htm`（gzip）
- 原厂页面：`/index_old.htm`（gzip，保持原厂图片外链布局）
- 新页面右上角“经典界面”链接指向 `/index_old.htm`
