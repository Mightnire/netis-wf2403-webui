# 安全审计：igdmptd / igmptd 后门

## 结论

`igdmptd`（部分文档写作 `igmptd`）不是正常的 IGMP 守护进程，而是 **Netcore / Netis 系列路由器已知后门**。

- 监听 **UDP 53413**
- 使用硬编码认证串 `netcore`
- 可获得文件读取、文件上传和任意系统命令执行能力
- 2014 年披露，Netcore 后续固件在更新说明中写有“修复 IGDMPTD 漏洞”

参考：

- [Netcore / Netis 路由器后门应急概要（KnownSec）](https://blog.knownsec.com/2015/01/a-brief-analysis-of-netcore-netis-leak-emergency/index.html)
- [Metasploit: netcore_udp_53413_backdoor](https://github.com/rapid7/metasploit-framework/blob/2b4dfe15945da1172c18b110bde29e47726488b0/documentation/modules/exploit/linux/misc/netcore_udp_53413_backdoor.md)
- [Netcore NW719 固件更新说明：修复 IGDMPTD 漏洞](https://www.netcoretec.com/service-support/download/firmware/286.html)
- [NetCore 全系列路由器后门漏洞分析（安全客）](https://www.anquanke.com/post/id/246510)

## 对 WF2403 固件的审计

审计对象：本仓库 `squashfs-root/`，以及运行中的设备（只读检查）。

| 检查项 | 结果 |
|---|---|
| `/bin/igdmptd`、`/bin/igmptd` | **不存在** |
| `etc/profile` 中的 `igdmptd` | 仅 `#igdmptd &` 注释 |
| `bin/start_daemon.sh` | 仅注释行 |
| `etc/inetd.conf` | 仅注释行 |
| `bin/generate_inet_conf.sh` | 生成 `inetd.conf` 时相关行已注释 |
| `etc/services` | 仍有 `igdmptd 53413/udp` 服务名映射，但没有可执行文件/启动项 |
| 运行进程 | 无 `igdmptd`；IGMP 由 `/bin/igmpproxy eth1 br0 -D` 提供 |
| UDP 监听 | `/proc/net/udp` 中没有 53413（0xD0A5） |
| `/var/inetd.conf` | 运行设备上不存在，未通过 inetd 启动 |

因此：**该固件镜像不包含后门程序，也没有把它拉起来**。`/etc/services` 里的名字只是端口名映射，不会创建监听。

## 仍建议的处理

1. **不要**从其他 Netcore/Netis 固件把 `/bin/igdmptd` 拷回来；本仓库的 `pack_firmware.py` 已加构建守卫，发现该文件会拒绝打包。
2. 在 WAN 侧阻断 **UDP 53413** 入站；管理页面不要暴露到公网。
3. 如果设备曾运行过未修复的原厂旧固件，按已失陷处理：检查 DNS、管理员密码、固件版本和异常进程。
4. 每次重打包后运行 `python tools/check_igdmptd.py`，或直接检查：
   ```sh
   ls -l /bin/igdmptd
   grep -n '^[^#].*igdmptd' /etc/profile /etc/inetd.conf
   grep -i 'D0A5' /proc/net/udp
   ps | grep igdmptd
   ```
5. 该后门与“IGMP 代理”不是一回事；IGMP 代理的合法程序是 `igmpproxy`。
