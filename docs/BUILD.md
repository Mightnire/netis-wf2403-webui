# 构建与刷机

## 环境

- Python 3.10+
- Node.js + Chrome（仅 UI 自动化测试需要）
- Windows PowerShell（示例命令）；Linux/macOS 把路径分隔符换掉即可

构建本身不依赖第三方 Python 包。

## 1. 生成 Web 控制台

```powershell
python scratch\md1\build.py
```

做三件事：

1. 将 `part_css.css`、`part_body.html`、`part_i18n.js`、`part_core.js`、`part_pages.js` 合成
   `squashfs-root/web/index.decompressed.htm`
2. gzip(`mtime=0`) 输出 `squashfs-root/web/index.htm`
3. 更新 `squashfs-root/manifest.json` 中 `web/index.htm` 的尺寸

当前产物约 **67 KB gzip**。

favicon（ICO）和左上角 SVG 徽标从 `scratch/md1/assets/` 读取，构建时以 base64 内嵌，不额外请求文件。

## 2. 重打包固件

```powershell
python scratch\md1\pack_firmware.py
```

流程：

1. `squashfs2_packer.py` 按 `manifest.json` 重新生成 SquashFS 2.0 根分区
2. 填充到 3,276,800 字节分区上限
3. 与 `firmware_backup/mtd0_boot_cfg_linux.bin` 的内核块组装
4. 校验两个块的 16 位字和均为 `0x0000`

产物：

| 文件 | 大小 |
|---|---:|
| `firmware_backup/mtd1_rootfs_repacked.bin` | 3,276,800 |
| `firmware_backup/web_upgrade_custom.bin` | 3,892,322 |

## 3. 热部署（不刷机，重启丢失）

设备需开启 telnet，且 PC 与设备 LAN 同网段。

```powershell
# 部署新控制台到 /web/index.htm
python scratch\md1\deploy.py 192.168.0.1

# 部署原厂页面到 /web/index_old.htm
python scratch\md1\deploy_index.py 192.168.0.1
```

原理：本机起 TFTP 服务（UDP 6969），telnet 登录后 `tftp -g` 到 `/var`，再
`mount -o bind` 到 `/web/*.htm`。重启后恢复固件内文件。

注意：

- `deploy.py` 源文件是 `web/index.htm`
- `deploy_index.py` 源文件是 `web/index_old.htm`
- 热部署期间路由器可访问，但文件在 tmpfs 中，占用 RAM

## 4. 刷入固件

使用原厂 Web 升级页或 TFTP 恢复流程，上传：

```text
firmware_backup/web_upgrade_custom.bin
```

要求：

- 文件必须正好 **3,892,322 字节**
- 两个块校验和必须为 `0x0000`
- 升级过程中不要断电

原厂升级页只接受 `.bin`。本项目的系统升级页同样只允许 `.bin`，并会在路由器重启期间保持等待框。

## 5. 原厂页面

`web/index_old.htm` 是原厂经典页面，构建时不会被 `build.py` 覆盖。

- 保持原厂图片外链（`./images/*.jpg` 等，文件本身为 gzip 压缩，由 `webs` 带 `Content-Encoding` 返回）
- 仅修正了原厂内存显示反转问题：按 `(total-free)/total` 计算使用率
- 原厂页面内部重启跳转已改为 `/index_old.htm`

如果修改了 `web/index_old.decompressed.htm`，需要重新 gzip：

```python
import gzip
raw = open("squashfs-root/web/index_old.decompressed.htm", "rb").read()
with gzip.GzipFile("squashfs-root/web/index_old.htm", "wb", mtime=0) as f:
    f.write(raw)
```

并更新 `manifest.json` 里 `web/index_old.htm` 的 `size`。

## 常见问题

- **页面白屏 / 无样式**：CSS 文件被写入了 UTF-8 BOM，导致 `:root` 变量失效。`build.py` 已统一用
  `utf-8-sig` 读取，源文件建议保持无 BOM。
- **固件过大**：rootfs 上限 3,276,800 字节；`pack_firmware.py` 会拒绝溢出。
- **升级提示一闪而过**：已修复。确认按钮 `onClick` 必须 `return false`，否则通用弹窗会在
  `showWaitDialog()` 后立即 `closeDialog()`。
- **热部署后重启丢失**：bind mount 是临时的，持久化必须刷固件。
