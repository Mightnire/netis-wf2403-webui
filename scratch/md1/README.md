# 构建器

| 文件 | 用途 |
|---|---|
| `part_body.html` | 页面骨架（8 个主页面、对话框、日志、品牌区） |
| `part_css.css` | MD1 设计系统、模式主题、响应式 |
| `part_core.js` | 状态、CGI 客户端、模式检测、弹窗/遮罩/Toast |
| `part_pages.js` | 各页面控制器、图表、表格、表单 |
| `part_i18n.js` | 中英文字典 |
| `icons.json` | 内联 SVG sprite（73 个图标） |
| `assets/netis.ico` | 浏览器 favicon |
| `assets/netis.svg` | 左上角 Netis 徽标 |
| `build.py` | 合成 HTML、gzip、更新 manifest |
| `pack_firmware.py` | 重打包 SquashFS、组装双块固件 |
| `deploy.py` | 热部署新控制台到 `/web/index.htm` |
| `deploy_index.py` | 热部署原厂页面到 `/web/index_old.htm` |
| `squashfs2_packer.py` | SquashFS 2.0 写入器 |

构建与刷机步骤见仓库根目录 `docs/BUILD.md`。
