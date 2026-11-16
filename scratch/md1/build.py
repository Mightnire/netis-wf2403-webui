# -*- coding: utf-8 -*-
"""Assemble the MD1 console from parts, gzip it, and refresh manifest sizes."""
import base64
import gzip
import json
import os
import time

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PARTS = os.path.join(BASE, "scratch", "md1")
WEB = os.path.join(BASE, "squashfs-root", "web")

CSS = open(os.path.join(PARTS, "part_css.css"), encoding="utf-8-sig").read()
BODY = open(os.path.join(PARTS, "part_body.html"), encoding="utf-8-sig").read()
I18N = open(os.path.join(PARTS, "part_i18n.js"), encoding="utf-8-sig").read()
CORE = open(os.path.join(PARTS, "part_core.js"), encoding="utf-8-sig").read()
PAGES = open(os.path.join(PARTS, "part_pages.js"), encoding="utf-8-sig").read()
ICONS = json.load(open(os.path.join(PARTS, "icons.json"), encoding="utf-8-sig"))

ASSETS = os.path.join(PARTS, "assets")
FAVICON = base64.b64encode(open(os.path.join(ASSETS, "netis.ico"), "rb").read()).decode("ascii")
BRAND_LOGO = base64.b64encode(open(os.path.join(ASSETS, "netis.svg"), "rb").read()).decode("ascii")

symbols = []
for name in sorted(ICONS):
    d = ICONS[name]
    symbols.append('<symbol id="i-%s" viewBox="0 0 24 24"><path d="%s"/></symbol>' % (name, d))
BODY = BODY.replace("<!--ICONS-->", "\n".join(symbols))

HTML = """<!DOCTYPE html>
<html lang="zh-CN" data-mode="router">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="theme-color" content="#3f51b5" id="themeColor"/>
<link rel="icon" type="image/x-icon" href="data:image/x-icon;base64,__FAVICON__"/>
<title>Netis WF2403 · 管理控制台</title>
<style>
__CSS__
</style>
</head>
__BODY__
<script>
__I18N__
</script>
<script>
__CORE__
</script>
<script>
__PAGES__
</script>
</body>
</html>
"""
HTML = (HTML.replace("__CSS__", CSS).replace("__BODY__", BODY)
        .replace("__I18N__", I18N).replace("__CORE__", CORE).replace("__PAGES__", PAGES)
        .replace("__FAVICON__", FAVICON).replace("__BRAND__", BRAND_LOGO))

out_html = os.path.join(WEB, "index.decompressed.htm")
with open(out_html, "w", encoding="utf-8", newline="\n") as f:
    f.write(HTML)

raw = HTML.encode("utf-8")
gz = gzip.compress(raw, 9, mtime=0)
out_gz = os.path.join(WEB, "index.htm")
with open(out_gz, "wb") as f:
    f.write(gz)

# refresh manifest sizes for the two web artifacts
mft_path = os.path.join(BASE, "squashfs-root", "manifest.json")
mft = json.load(open(mft_path, encoding="utf-8-sig"))
now = int(time.time())
for item in mft["files"]:
    if item.get("path") == "web/index.htm":
        item["size"] = len(gz)
        item["mtime"] = now
    elif item.get("path") == "web/index_old.htm":
        item["size"] = os.path.getsize(os.path.join(WEB, "index_old.htm"))
with open(mft_path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(mft, f, indent=2, ensure_ascii=False)

print("HTML: %d bytes" % len(raw))
print("GZ  : %d bytes (%.1f%% of raw)" % (len(gz), 100.0 * len(gz) / len(raw)))
print("icons: %d symbols" % len(ICONS))
