# 设备与协议研究记录

## 硬件 / 系统

- 型号：Netis WF2403
- SoC：Realtek RTL8196C（MIPS，400 MHz）
- 内存：实测 `MemTotal` 约 **10.6 MB**，无 swap
- Flash：4 MB SPI；rootfs 分区 3,125 MB（3,276,800 字节）
- 系统：Linux 2.4.18，SquashFS 2.0（LZMA）
- Web 服务：`/bin/webs`，Basic Auth `guest:guest`
- 管理地址：默认 `192.168.0.1`，Web 端口 80，telnet 23

## Web 服务器行为

- `.htm` 文件必须预先 gzip；`webs` 固定返回 `Content-encoding: gzip`
- `web/images/*.jpg` 等图片文件本身也是 gzip 压缩的，浏览器依赖 `Content-Encoding` 解码；
  因此不能直接把磁盘字节 base64 成 data URI，必须先 `gzip.decompress()`
- CGI 路径：`/cgi-bin-igd/<name>.cgi`，POST，`application/x-www-form-urlencoded`
- 大多数读接口可以只发 `noneed=noneed`

## CGI 返回类型

| 类型 | 形态 | 例子 |
|---|---|---|
| SingleData | JS 对象字面量 | `{...}` |
| TableData | JS 数组字面量 | `[{...}]` |
| Action | 字符串数组 | `["SUCCESS"]` / `["SUCCESS","reboot"]` |
| 纯文本 | 分号分隔 | 系统日志 |

前端统一用 `parseData()` 兼容 `JSON.parse` 与 `eval`，并剥掉固件偶尔泄漏的
`content-type: text/plain` 前缀行（`sys_log_clean.cgi` 存在此问题）。

## 固件镜像

双块结构，总大小 **3,892,322 字节**：

```text
Block 1  cr6b  offset 0x000000  burn 0x030000  len 615,490
Block 2  r6br  offset 0x096452  burn 0x0D0000  len 3,276,800 (SquashFS 2.0)
```

- 每块 payload 按 16 位大端字求和必须为 `0x0000`
- rootfs 不能超过 3,276,800 字节
- `manifest.json` 是重打包的唯一文件清单；`superblock.inodes` 必须等于文件数
- 打包器按 manifest 读取磁盘实际文件内容，不依赖 manifest 中的 `size`

## 系统日志格式

### 系统日志（`mode_name=all` 中非 CONNECTION 行）

```text
May 22 01:10:33 ,wlan,wlan0: A wireless client is associated - FE:32:92:6E:1A:97
```

- 时间无年份；月份为英文缩写
- 第二字段是类别：`wlan`、`klogd`
- 第三段是 `接口: 消息`

前端格式化为：

```text
05-22 01:10:33  WLAN    wlan0: A wireless client is associated - ...
```

### 连接日志（`mode_name=connect`，或 `all` 中 CONNECTION 行）

```text
0,CONNECTION,2026-11-16 19:04:05,udhcpc,1,id=1:,["udhcp_server_started","0.9.9-pre"]
```

CSV + 行尾 JSON 数组：

| 字段 | 含义 |
|---|---|
| `0` | 记录序号 |
| `CONNECTION` | 固定标记 |
| `2026-11-16 19:04:05` | 时间 |
| `udhcpc` | 进程 |
| `1` | 级别 |
| `id=1:` | 事件编号 |
| `["event","arg"]` | 事件名 + 参数 |

`mode_name=all` 会同时返回系统日志与连接日志，所以“系统日志”标签必须过滤
`^\d+,CONNECTION,`，否则两类日志会混在一起。

已知 DHCP 事件：`udhcp_server_started`、`udhcp_client_started`、`dhcp_receive_discover`、
`dhcp_sending_offer`、`dhcp_receive_request`、`dhcp_sending_ack`、`dhcp_send_request`、
`dhcp_send_discover`、`dhcp_lease_time`、`dhcp_unicasting_release_time`。

## 原厂页面内存显示问题

原厂用 `srun_memory` 直接作为“Memory Usage”，但该值是**空闲率**：

```text
total_memory=10856 KB, free_memory=744 KB
srun_memory=7  → 实际使用率 93%
```

已改为 `(total-free)/total*100`。

## `/etc/profile` 网络参数

当前固件中的值：

```sh
ip_conntrack_max=2048
tcp_timeout_established=1200
tcp_timeout_time_wait=30
tcp_timeout_fin_wait=30
tcp_timeout_close_wait=30
tcp_timeout_close=5
tcp_timeout_last_ack=30
syn_sent/syn_recv=10/10
udp_timeout/stream/generic=60/90/90
route/max_size=2048
route/gc_thresh=256
route/gc_elasticity=1
route/gc_interval=35
route/gc_timeout=10
hot_list_length=2048
ip_forward=1
```

内存紧张时的注意点：

- `MemFree` 长期只有几百 KB，`Cached` 约 3.6 MB，`Buffers` 约 0.5 MB
- 内核没有 `/proc/sys/vm/drop_caches`，不能手动回收 dentry/inode 缓存
- 无 swap
- `/web/index.htm`、`/web/index_old.htm` 热部署时位于 tmpfs，会直接占 RAM
- 原厂 `/etc/profile` 的 `#igdmptd &` 已是注释，`igdmptd`（`igmptd`）不启动；
  IGMP 代理由 `igmpproxy` 提供，不需要重复守护进程
- 停用 WPS（`wscd` + `wps_detect`）约省 0.6 MB，停 LLDP（`lld2d`）约 0.27 MB，
  停 UPnP（`mini_upnpd` + `miniigd`）约 0.5 MB

## 原厂“死功能”证据

| 项目 | 证据 |
|---|---|
| WDS 配置 | `module_wireless_wds_config` 为空函数；只有 `wireless_sec_wds_form` 安全表单 |
| 独立防火墙 | `firewall_module_show.cgi` / `firewall_parame_show.cgi` 不存在；`firewall_set_*` 仅是 ACL 模块控制 |
| LED | `led_show.cgi` 请求超时，拿不到 `state/led1~4` |
| TFTP/FTP 升级 | `update_frame.htm` 只有 HTTP 上传表单 |
| DDNS Gonetis | 服务商下拉无 3；`ddns_gonetis_register.cgi` 无入口 |
| 配置备份/恢复 | 只有 `Backup_Parameter` 文案，无 CGI |

## 已知固件怪癖

- `sys_log_clean.cgi` 返回体前面多一行 `content-type: text/plain; charset=utf-8`
- 启用/关闭 WPS 会重启无线服务，管理页短暂无响应约 20 秒
- `wl_site_surver_connect.cgi` 可能挂起约 20 秒，前端需要超时与静默处理
- 切客户端模式会改变 LAN 地址，远程会话可能失去管理连接
