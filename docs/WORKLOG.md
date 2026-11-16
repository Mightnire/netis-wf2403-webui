# 工作记录

> 记录与整理：DeepSeek Harness（deepseek-flash）编码代理

按阶段记录本项目从原厂固件到可刷入自定义 WebUI 的过程。部分前期工作由上一轮 AI 完成，后续在此基础上继续。

## 阶段 0：固件与协议逆向（前期 AI）

- 确认硬件：Netis WF2403 / RTL8196C / Linux 2.4.18
- 解析双块固件：`cr6b` 内核块 + `r6br` SquashFS 2.0 根分区
- 确认 rootfs 上限 3,276,800 字节、两块的 16 位字和必须为 0
- 确认 `webs` 对 `.htm` 强制 `Content-Encoding: gzip`
- 确认 CGI 路径 `/cgi-bin-igd/*.cgi`、Basic Auth `guest:guest`
- 整理 SingleData / TableData / Action 三类响应
- 实现 `squashfs2_packer.py` 与 `pack_firmware.py`，可重打包并校验固件

## 阶段 1：MD1 单页应用（前期 AI + 后续迭代）

- 单文件 SPA：`part_css.css` + `part_body.html` + `part_core.js` + `part_pages.js` + `part_i18n.js`
- Material Design 1 风格、8 个主页面、响应式
- 按 `op_mode` / `wl_mode` 检测 Router / AP / Client / Repeater，切换主题色
- 中英双语，localStorage 记住语言
- 内联 SVG sprite（73 个 Material 图标）
- 统一弹窗、Toast、加载遮罩、设备选择浮层

## 阶段 2：基础功能对齐

- 概览：设备信息、WAN/LAN/无线状态、在线客户端
- 监控：CPU、内存、WAN/LAN/WLAN 流量曲线
- 无线：基本设置、安全、站点扫描、已连主机、高级射频
- 上网设置：DHCP / 静态 / PPPoE、连接断开、MAC 克隆、DDNS
- 局域网：LAN IP（三模式）、DHCP 池、租约、静态绑定
- 系统：时间、密码、远程管理、重启、恢复出厂、HTTP 升级、WOL

## 阶段 3：抓包驱动的功能补齐

对原厂页面逐项抓请求，按真实字段实现：

- 访问控制三件套：MAC / IP / 网址过滤，含每天/星期/时段
- QoS：上下行总带宽、自动/手动、规则最小/最大带宽
- DDNS：Oray / DynDNS / meibu / dlinkddns / no-ip
- WPS：启停、PIN、PBC、生成 PIN
- 端口转发：16 种协议预设，外网起止端口与内网端口分离
- 端口触发：5 个预定义规则
- 静态路由：NET/HOST，HOST 掩码固定 `255.255.255.255`
- 无线接入控制：MAC 白/黑名单
- IGMP 代理、VPN ALG、FTP ALG
- WAN 自动检测

## 阶段 4：布局与交互修正

- DMZ 改为「DMZ / 超级 DMZ」双标签卡片，互斥
- DMZ 启用开关移到卡片右上角
- 设备选择从宽下拉改为小图标 + Material 浮层
- LAN 三种模式卡片高亮当前模式
- 删除页面顶部加载进度条
- 状态卡 / 顶栏图标修复（`#i-routerr` 拼写错误）
- 品牌区替换为 Netis 官方 SVG 徽标，favicon 换成官方 ICO

## 阶段 5：问题修复

### BOM 导致页面“裸奔”

PowerShell `Set-Content -Encoding UTF8` 给 `part_css.css` 写入了 UTF-8 BOM，
`<style>` 开头的 `:root` 规则被丢弃，所有 CSS 变量失效，页面白底无卡片。

修复：

- 源文件去 BOM
- `build.py` 统一用 `utf-8-sig` 读取所有部件
- 写出 HTML/manifest 保持无 BOM

### 系统日志混入连接日志

原厂 `mode_name=all` 同时返回系统日志与连接日志；原实现只按 `;` 切分后直接显示。
修复：

- 系统日志标签过滤 `^\d+,CONNECTION,`
- 连接日志解析 CSV + JSON，翻译 DHCP 事件
- 时间、类别/进程分列

### 固件升级等待框一闪而过

通用弹窗在按钮 `onClick` 返回后会自动 `closeDialog()`，而升级按钮内部刚调用了
`showWaitDialog()`，于是等待框立即被关闭。

修复：

- 升级确认按钮 `return false`
- 重启/恢复出厂同样返回 `false`
- 上传请求被重启打断时不再当作失败
- 真正失败时显示错误和关闭按钮

### 原厂页面图片 data URI 失效

图片文件本身是 gzip 压缩的，直接 base64 得到的是 gzip 字节，不是图片。
修复：`gzip.decompress()` 后再 base64，并在 IE<8 下回退到外链。

后续因原厂页面出现布局问题，按要求**整体回退**到未优化状态：恢复
`./images/...` 外链，只保留内存显示修正。

### 其他

- `sys_log_clean.cgi` 返回体前多一行 `content-type:`，解析前剥掉
- `new.htm` / `index.htm` 改名：新控制台为 `/index.htm`，原厂为 `/index_old.htm`
- 固件上传只允许 `.bin`，前端二次校验
- 系统日志时间统一为 `MM-DD HH:MM:SS`，类别用 `WLAN` / `KERNEL`

### 升级后首页空白 / 未重连 Wi-Fi

- 现象：固件升级等待框转一段时间后跳到 `/index.htm`，页面框架出来但数据全空。
- 原因一：`waitForRouter` 只看 HTTP 请求是否成功，路由器在 CGI 尚未就绪时就会返回页面，导致过早跳转。
- 原因二：跳转后所有状态 CGI 失败，页面没有兜底提示。
- 修复：
  - `waitForRouter` 改为解析 `topstatus_interface_parame_show.cgi`，必须拿到 `lan_ip` 或 `version` 才认为恢复
  - 首页状态接口全部失败时显示“无法连接到路由器”提示，说明检查电脑/手机是否已重新连接 WF2403 的 Wi-Fi
  - 提供“重试”按钮，并每 6 秒自动探测，恢复后自动刷新
  - 启动遮罩最多 12 秒，避免一直转圈

## 阶段 6：打包与发布

- 新控制台 gzip 约 67 KB
- 原厂页面 gzip 约 86 KB
- 固件 3,892,322 字节，双块校验通过
- 原厂 `web_upgrade_stock.bin` 与自定义 `web_upgrade_custom.bin` 作为 Release 资产

## igdmptd 后门审计

- `igdmptd`（也写作 `igmptd`）不是 IGMP 守护进程，而是 Netcore / Netis 系列路由器已知后门：
  UDP 53413、硬编码 `netcore` 认证、可读文件/上传文件/执行系统命令。
- 本固件审计结果：
  - 根文件系统不存在 `/bin/igdmptd` 或 `/bin/igmptd`
  - `etc/profile`、`bin/start_daemon.sh`、`etc/inetd.conf`、`bin/generate_inet_conf.sh`
    里的相关行全部是注释
  - 运行设备上没有 `igdmptd` 进程，`/proc/net/udp` 没有 53413
  - `/etc/services` 仍保留 `igdmptd 53413/udp` 的名字映射，但没有二进制/启动项，不会监听
- 新增 `tools/check_igdmptd.py` 做离线复检；`pack_firmware.py` 在打包前拒绝包含该二进制的镜像。
- 同一轮清理了同样已停用的 `cdrom_wizard`（UDP 20010）：
  - 所有 `profile.*` 变体中的激活行改为注释
  - `etc/services` 中 `igdmptd 53413/udp` 与 `cdrom_wizard 20010/udp` 改为注释
  - 删除未被 manifest 引用的 `manifest.json.bak`
- 合法的 IGMP 代理是 `/bin/igmpproxy`，与本后门无关。

## 未完成 / 已知限制

- 客户端/中继模式只做了请求序列模拟验证，未实际切换（会改变 LAN 地址）
- QoS 限速、ACL 实际拦截、端口转发 DNAT、DDNS 真实解析均只验证了配置读写
- WPS PBC/PIN 实际配对未验证
- 原厂本身没有 WDS 配置页、独立防火墙、LED、TFTP/FTP 升级、配置备份
- 设备内存只有 10.6 MB，长期可用内存约 0.5–2 MB
