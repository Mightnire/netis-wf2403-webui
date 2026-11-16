# 固件说明

本目录只保存固件说明与校验值，固件本体作为 GitHub Release 资产发布。

当前版本：**v1.0.2**（升级后断线提示 + `igdmptd` / `cdrom_wizard` 清理）

## 资产

| Release 文件名 | 来源 | 大小 |
|---|---|---:|
| `wf2403-stock-firmware.bin` | 原厂升级镜像备份（未修改） | 3,892,322 |
| `wf2403-custom-webui.bin` | 本项目重打包，含自定义 WebUI | 3,892,322 |

- 原厂镜像：`web_upgrade_stock.bin`
- 自定义镜像：`web_upgrade_custom.bin`

## 校验

两个镜像都必须是 **3,892,322 字节**，且两个块 payload 的 16 位字和均为 `0x0000`。

```text
Block 1: cr6b, burn 0x030000, len 615,490
Block 2: r6br, burn 0x0D0000, len 3,276,800
```

SHA256 见 `SHA256SUMS`。

## 刷机

1. 备份当前配置和原厂固件
2. 通过原厂 Web 升级页或 TFTP 恢复流程上传 `.bin`
3. 过程中不要断电
4. 刷完后访问 `http://192.168.0.1/`，默认进入新控制台；原厂页面在 `/index_old.htm`

## 风险

非官方固件。硬件版本不一致、刷写中断、镜像损坏都可能导致设备无法启动。
建议先确认设备可进入 TFTP 恢复模式，并保留 `full_firmware_backup.bin`。
