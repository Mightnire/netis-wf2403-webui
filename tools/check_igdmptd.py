# -*- coding: utf-8 -*-
"""Check a WF2403 rootfs for the Netcore igdmptd/igmptd backdoor.

Usage: python tools/check_igdmptd.py [rootfs-dir]
Exit code 0 = clean, 1 = suspicious/active backdoor, 2 = missing rootfs.
"""
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "squashfs-root")

if not os.path.isdir(ROOT):
    print("rootfs not found:", ROOT)
    sys.exit(2)

problems = []
warnings = []

for rel in ("bin/igdmptd", "bin/igmptd", "usr/bin/igdmptd", "usr/sbin/igdmptd"):
    if os.path.exists(os.path.join(ROOT, rel)):
        problems.append("backdoor binary present: " + rel)

launchers = ["etc/profile", "bin/start_daemon.sh", "etc/inetd.conf", "bin/generate_inet_conf.sh"]
for rel in launchers:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        continue
    for no, line in enumerate(open(p, encoding="utf-8", errors="ignore"), 1):
        s = line.strip()
        if "igdmptd" in s and not s.startswith("#"):
            problems.append("%s:%d active launcher: %s" % (rel, no, s))

svc = os.path.join(ROOT, "etc/services")
if os.path.exists(svc):
    for no, line in enumerate(open(svc, encoding="utf-8", errors="ignore"), 1):
        if "igdmptd" in line and "53413" in line:
            warnings.append("etc/services:%d defines 53413/udp (no binary present)" % no)

for w in warnings:
    print("WARN:", w)
for p in problems:
    print("FAIL:", p)

if problems:
    print("RESULT: FAIL — possible igdmptd backdoor")
    sys.exit(1)
print("RESULT: OK — no igdmptd binary or active launcher")
