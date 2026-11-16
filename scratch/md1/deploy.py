# -*- coding: utf-8 -*-
"""Hot-deploy squashfs-root/web/index.htm to a running WF2403 via TFTP + bind mount."""
import os
import socket
import struct
import sys
import threading
import time

ROUTER_IP = sys.argv[1] if len(sys.argv) > 1 else "192.168.0.1"
TFTP_PORT = 6969
SOURCE_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "squashfs-root", "web", "index.htm"))
FILE_SIZE = os.path.getsize(SOURCE_FILE)

s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.connect((ROUTER_IP, 80))
TFTP_IP = s.getsockname()[0]
s.close()

print("[*] %s (%d bytes) via TFTP %s:%d -> %s" % (SOURCE_FILE, FILE_SIZE, TFTP_IP, TFTP_PORT, ROUTER_IP))
done = threading.Event()


def serve():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", TFTP_PORT))
    sock.settimeout(20.0)
    try:
        data, addr = sock.recvfrom(1024)
        opcode = int.from_bytes(data[:2], "big")
        print("[+] TFTP request from %s opcode=%d" % (addr, opcode))
        if opcode != 1:
            return
        with open(SOURCE_FILE, "rb") as f:
            block = 1
            while True:
                chunk = f.read(512)
                pkt = struct.pack(">HH", 3, block) + chunk
                for _ in range(6):
                    sock.sendto(pkt, addr)
                    try:
                        sock.settimeout(2.0)
                        ack, _a = sock.recvfrom(512)
                        if len(ack) >= 4 and int.from_bytes(ack[:2], "big") == 4 and int.from_bytes(ack[2:4], "big") == block:
                            break
                    except socket.timeout:
                        continue
                block = (block + 1) & 0xFFFF
                if len(chunk) < 512:
                    print("[+] sent %d blocks" % (block - 1))
                    done.set()
                    break
    except Exception as e:
        print("TFTP error:", e)
    finally:
        sock.close()


threading.Thread(target=serve, daemon=True).start()
time.sleep(0.4)

tn = socket.create_connection((ROUTER_IP, 23), timeout=6)


def read_until(patterns, timeout=4.0):
    buf = b""
    end = time.time() + timeout
    while time.time() < end:
        tn.settimeout(0.4)
        try:
            chunk = tn.recv(2048)
        except socket.timeout:
            continue
        if not chunk:
            break
        buf += chunk
        if any(p in buf for p in patterns):
            break
    return buf.decode("utf-8", "ignore")


def cmd(c, wait=1.2, expect=b"# "):
    tn.sendall(c.encode() + b"\n")
    out = read_until([expect], timeout=12)
    time.sleep(wait)
    return out


read_until([b"login:"])
tn.sendall(b"guest\n")
read_until([b"Password:"])
tn.sendall(b"guest\n")
read_until([b"# "])

print(cmd("umount /web/index.htm").strip())
print(cmd("rm -f /var/index.htm").strip())

print("[*] tftp -g -l /var/index.htm -r index.htm %s %d" % (TFTP_IP, TFTP_PORT))
print(cmd("tftp -g -l /var/index.htm -r index.htm %s %d" % (TFTP_IP, TFTP_PORT)).strip())
done.wait(timeout=10)
time.sleep(0.6)

lst = cmd("ls -l /var/index.htm")
print(lst.strip())
if str(FILE_SIZE) not in lst:
    print("[FAIL] size mismatch on router")
    sys.exit(1)

print(cmd("mount -o bind /var/index.htm /web/index.htm").strip())
print(cmd("ls -l /web/index.htm").strip())
print("[OK] hot deploy done")
tn.close()
