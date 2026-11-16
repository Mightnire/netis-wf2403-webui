# -*- coding: utf-8 -*-
"""Repack the rootfs with the new console and assemble the dual-block upgrade image."""
import os
import struct
import sys

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, BASE)
sys.path.insert(0, os.path.dirname(__file__))

from squashfs2_packer import SquashFS2Writer
from tests.e2e.harness import FirmwareImageInspector

ROOTFS_OUT = os.path.join(BASE, "firmware_backup", "mtd1_rootfs_repacked.bin")
MTD0 = os.path.join(BASE, "firmware_backup", "mtd0_boot_cfg_linux.bin")
FW_OUT = os.path.join(BASE, "firmware_backup", "web_upgrade_custom.bin")
PART_SIZE = 3276800

# Refuse to package the known Netcore/Netis igdmptd backdoor.
_ROOTFS = os.path.join(BASE, "squashfs-root")
for _rel in ("bin/igdmptd", "bin/igmptd", "usr/bin/igdmptd", "usr/sbin/igdmptd"):
    if os.path.exists(os.path.join(_ROOTFS, _rel)):
        raise SystemExit("refusing to pack: Netcore igdmptd backdoor present: " + _rel)


def wsum16(b):
    if len(b) % 2:
        b += b"\x00"
    s = 0
    for i in range(0, len(b), 2):
        s += (b[i] << 8) | b[i + 1]
    return s & 0xFFFF


def main():
    print("[*] Repacking SquashFS 2.0 rootfs...")
    SquashFS2Writer().pack_tree(os.path.join(BASE, "squashfs-root"), ROOTFS_OUT)

    rootfs = open(ROOTFS_OUT, "rb").read()
    assert len(rootfs) == PART_SIZE, "rootfs size %d != %d" % (len(rootfs), PART_SIZE)
    used = struct.unpack(">I", rootfs[8:12])[0]
    print("[+] rootfs: %d bytes, bytes_used=%d, sum16=0x%04X" % (len(rootfs), used, wsum16(rootfs)))
    assert wsum16(rootfs) == 0, "rootfs checksum is not zero"
    assert used <= PART_SIZE, "rootfs overflows partition"

    mtd0 = open(MTD0, "rb").read()
    magic, load, burn, klen = struct.unpack(">4s3I", mtd0[0x30000:0x30010])
    assert magic == b"cr6b", magic
    kernel = mtd0[0x30010:0x30010 + klen]
    print("[+] kernel block: magic=%s load=0x%08X burn=0x%06X len=%d" % (magic, load, burn, klen))

    r6br = struct.pack(">4s3I", b"r6br", 0x80C00000, 0x000D0000, len(rootfs))
    image = mtd0[0x30000:0x30010] + kernel + r6br + rootfs
    with open(FW_OUT, "wb") as f:
        f.write(image)
    print("[+] firmware: %d bytes" % len(image))

    res = FirmwareImageInspector.validate_firmware_file(FW_OUT)
    print("[*] inspector:", res)
    assert res.get("valid"), res

    # per-block payload checksums (what checkupfile verifies)
    b1 = image[:16 + klen]
    b2 = image[16 + klen:]
    print("[+] block1 payload sum=0x%04X, block2 payload sum=0x%04X" % (wsum16(b1[16:]), wsum16(b2[16:])))
    print("[SUCCESS] firmware built and validated")


if __name__ == "__main__":
    main()
