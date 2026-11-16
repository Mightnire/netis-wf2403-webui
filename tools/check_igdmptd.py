# -*- coding: utf-8 -*-
"""Check a WF2403 rootfs for the Netcore igdmptd/igmptd backdoor and cdrom_wizard."""
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "squashfs-root")

if not os.path.isdir(ROOT):
    print("rootfs not found:", ROOT)
    sys.exit(2)

problems = []
warnings = []

for rel in ("bin/igdmptd", "bin/igmptd", "usr/bin/igdmptd", "usr/sbin/igdmptd",
            "bin/cdrom_wizard", "usr/bin/cdrom_wizard", "usr/sbin/cdrom_wizard"):
    if os.path.exists(os.path.join(ROOT, rel)):
        problems.append("legacy daemon binary present: " + rel)

launchers = ["etc/profile", "bin/start_daemon.sh", "etc/inetd.conf", "bin/generate_inet_conf.sh"]
for rel in launchers:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        continue
    for no, line in enumerate(open(p, encoding="utf-8", errors="ignore"), 1):
        s = line.strip()
        if ("igdmptd" in s or "igmptd" in s or "cdrom_wizard" in s) and not s.startswith("#"):
            problems.append("%s:%d active launcher: %s" % (rel, no, s))

svc = os.path.join(ROOT, "etc/services")
if os.path.exists(svc):
    for no, line in enumerate(open(svc, encoding="utf-8", errors="ignore"), 1):
        s = line.strip()
        if s.startswith("#"):
            continue
        if "igdmptd" in s or "cdrom_wizard" in s:
            warnings.append("etc/services:%d defines legacy service: %s" % (no, s))

for w in warnings:
    print("WARN:", w)
for p in problems:
    print("FAIL:", p)

if problems:
    print("RESULT: FAIL — possible legacy backdoor/daemon")
    sys.exit(1)
print("RESULT: OK — no igdmptd/igmptd/cdrom_wizard binary or active launcher")
