"""
Netis WF2403 E2E Test Suite - Core Test Harness & Opaque-Box Inspect Tools
Provides DOM inspection, static JS analysis, firmware binary validation,
manifest auditing, gzip artifact verification, and CGI specification contracts.
"""

import os
import sys
import re
import json
import gzip
import struct
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Set

# Beautiful Soup is available in current environment; fallback parser if ever missing
try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False


# Root and default paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SPA_SOURCE_PATH = PROJECT_ROOT / "squashfs-root" / "web" / "new.decompressed.htm"
SPA_ARTIFACT_PATH = PROJECT_ROOT / "squashfs-root" / "web" / "new.htm"
SPA_ORIGINAL_PATH = PROJECT_ROOT / "squashfs-root" / "web" / "index.decompressed.htm"
MANIFEST_PATH = PROJECT_ROOT / "squashfs-root" / "manifest.json"
FIRMWARE_CUSTOM_PATH = PROJECT_ROOT / "firmware_backup" / "web_upgrade_custom.bin"
FIRMWARE_STOCK_PATH = PROJECT_ROOT / "firmware_backup" / "web_upgrade_stock.bin"


class CGISpecificationOracle:
    """Authoritative ground-truth definitions derived from cgitest.cgi disassembly and surveys."""

    REGIONS = {
        "1": {"name": "FCC", "channels": list(range(1, 12))},        # 1-11
        "2": {"name": "IC", "channels": list(range(1, 12))},         # 1-11
        "3": {"name": "ETSI", "channels": list(range(1, 14))},       # 1-13
        "4": {"name": "SPAIN", "channels": [10, 11]},                # 10-11
        "5": {"name": "FRANCE", "channels": list(range(10, 14))},    # 10-13
        "6": {"name": "MKK", "channels": list(range(1, 15))},        # 1-14
    }

    CHANNEL_FREQ_MAP = {
        1: 2412, 2: 2417, 3: 2422, 4: 2427, 5: 2432, 6: 2437, 7: 2442,
        8: 2447, 9: 2452, 10: 2457, 11: 2462, 12: 2467, 13: 2472, 14: 2484
    }

    OP_MODES = {
        0: {
            "name": "Router",
            "primary": ["#3f51b5", "#3F51B5"],
            "accent": ["#009688", "#009688"],
            "badge_zh": "路由模式",
            "badge_en": "Router Mode"
        },
        1: {
            "name": "AP",
            "primary": ["#00897b", "#009688", "#00695c"],
            "accent": ["#ff8f00", "#ffc107", "#FFC107"],
            "badge_zh": "接入点模式",
            "badge_en": "AP Mode"
        },
        2: {
            "name": "Client",
            "primary": ["#f4511e", "#ff5722", "#FF5722", "#d84315"],
            "accent": ["#0097a7", "#00acc1", "#00ACC1"],
            "badge_zh": "客户端模式",
            "badge_en": "Client Mode"
        }
    }

    MTU_BOUNDS = {
        "DHCP": {"min": 576, "max": 1500, "default": 1496},
        "STATIC": {"min": 576, "max": 1500, "default": 1500},
        "PPPOE": {"min": 576, "max": 1492, "default": 1492},
    }

    FIRMWARE_SPEC = {
        "total_size": 3892322,
        "block1_sig": b"cr6b",
        "block1_addr": 0x80500000,
        "block1_burn": 0x00030000,
        "block1_len": 615490,
        "block2_sig": b"r6br",
        "block2_addr": 0x80c00000,
        "block2_burn": 0x000D0000,
        "block2_len": 3276800,
        "squashfs_magic": b"sqsh",
        "squashfs_major": 2,
        "squashfs_minor": 0,
        "rootfs_flash_limit": 3276800,
    }


class SPAPageInspector:
    """Opaque-box inspector for SPA HTML files (DOM elements, CSS, i18n, JavaScript)."""

    def __init__(self, file_path: Optional[Path] = None, html_content: Optional[str] = None):
        self.file_path = file_path or SPA_SOURCE_PATH
        if html_content is not None:
            self.content = html_content
        else:
            if not os.path.exists(self.file_path):
                raise FileNotFoundError(f"SPA file not found: {self.file_path}")
            with open(self.file_path, "r", encoding="utf-8", errors="replace") as f:
                self.content = f.read()

        if BS4_AVAILABLE:
            self.soup = BeautifulSoup(self.content, "html.parser")
        else:
            self.soup = None

    def find_element_by_id(self, elem_id: str) -> Optional[Any]:
        if self.soup:
            return self.soup.find(id=elem_id)
        match = re.search(r'<[^>]*\bid=[\'"]' + re.escape(elem_id) + r'[\'"][^>]*>', self.content)
        return match.group(0) if match else None

    def find_all_by_tag(self, tag_name: str) -> List[Any]:
        if self.soup:
            return self.soup.find_all(tag_name)
        return re.findall(r'<' + re.escape(tag_name) + r'\b[^>]*>', self.content, re.IGNORECASE)

    def find_all_by_class(self, class_name: str) -> List[Any]:
        if self.soup:
            return self.soup.find_all(class_=re.compile(r'\b' + re.escape(class_name) + r'\b'))
        return re.findall(r'<[^>]*\bclass=[\'"][^\'"]*\b' + re.escape(class_name) + r'\b[^\'"]*[\'"][^>]*>', self.content)

    def find_all_by_data_key(self, key_name: Optional[str] = None) -> List[Any]:
        if self.soup:
            if key_name:
                return self.soup.find_all(attrs={"data-key": key_name})
            return self.soup.find_all(attrs={"data-key": True})
        if key_name:
            return re.findall(r'<[^>]*\bdata-key=[\'"]' + re.escape(key_name) + r'[\'"][^>]*>', self.content)
        return re.findall(r'<[^>]*\bdata-key=[\'"][^\'"]+[\'"][^>]*>', self.content)

    def extract_css_text(self) -> str:
        styles = re.findall(r'<style[^>]*>(.*?)</style>', self.content, re.DOTALL | re.IGNORECASE)
        return "\n".join(styles)

    def extract_javascript_text(self) -> str:
        scripts = re.findall(r'<script[^>]*>(.*?)</script>', self.content, re.DOTALL | re.IGNORECASE)
        return "\n".join(scripts)

    def extract_all_cgi_calls(self) -> Set[str]:
        """Extract all .cgi endpoints referenced in frontend code."""
        return set(re.findall(r'[\'"`]([a-zA-Z0-9_]+\.cgi)[\'"`]', self.content))

    def extract_i18n_dictionary(self) -> Dict[str, Dict[str, str]]:
        """Extract the i18n dictionary (zh and en) from the JavaScript source."""
        js = self.extract_javascript_text()
        i18n_dict: Dict[str, Dict[str, str]] = {"zh": {}, "en": {}}

        # Locate const i18n = { ... }
        match = re.search(r'(?:const|let|var)\s+i18n\s*=\s*\{', js)
        if not match:
            return i18n_dict

        start_pos = match.start()
        # Extract balanced block
        brace_count = 0
        started = False
        block = ""
        for char in js[start_pos:]:
            if char == '{':
                brace_count += 1
                started = True
            elif char == '}':
                brace_count -= 1
            block += char
            if started and brace_count == 0:
                break

        # Extract keys under zh: { ... } and en: { ... }
        for lang in ["zh", "en"]:
            lang_match = re.search(r'\b' + lang + r'\s*:\s*\{', block)
            if not lang_match:
                continue
            l_start = lang_match.end() - 1
            l_brace = 0
            l_block = ""
            for c in block[l_start:]:
                if c == '{':
                    l_brace += 1
                elif c == '}':
                    l_brace -= 1
                l_block += c
                if l_brace == 0:
                    break
            # Parse key-values in l_block
            pairs = re.findall(r'([a-zA-Z0-9_]+)\s*:\s*[\'"`](.*?)[\'"`]\s*[,}]', l_block)
            for k, v in pairs:
                i18n_dict[lang][k] = v

        return i18n_dict

    def has_original_ui_escape_link(self) -> bool:
        """Check if top-right original UI escape link exists with href pointing to /index.htm."""
        if self.soup:
            links = self.soup.find_all("a", href=re.compile(r'/index\.htm|index\.htm'))
            return len(links) > 0
        return bool(re.search(r'<a\b[^>]*\bhref=[\'"][^\'"]*index\.htm[\'"][^>]*>', self.content, re.IGNORECASE))

    def get_brand_headers(self) -> List[str]:
        """Extract occurrences of brand strings."""
        pattern = re.compile(r'Netis\s+WF2403(?:\s+300M\s+Portable\s+Router)?', re.IGNORECASE)
        return pattern.findall(self.content)


class FirmwareImageInspector:
    """Inspector for dual-block Netis WF2403 firmware binary."""

    @staticmethod
    def calculate_16bit_word_sum(payload: bytes) -> int:
        """Calculate 16-bit big-endian unsigned word sum modulo 65536."""
        if len(payload) % 2 != 0:
            raise ValueError(f"Payload length {len(payload)} is not even!")
        words = struct.unpack(f">{len(payload)//2}H", payload)
        return sum(words) & 0xFFFF

    @staticmethod
    def calculate_compensation_word(payload_without_comp: bytes) -> int:
        """Calculate 2-byte compensation word so sum is 0x0000."""
        s = FirmwareImageInspector.calculate_16bit_word_sum(payload_without_comp)
        return (65536 - s) & 0xFFFF

    @classmethod
    def validate_firmware_file(cls, fw_path: Path) -> Dict[str, Any]:
        """Perform comprehensive dual-block validation."""
        result: Dict[str, Any] = {
            "valid": False,
            "errors": [],
            "block1": {},
            "block2": {},
            "squashfs": {}
        }
        if not os.path.exists(fw_path):
            result["errors"].append(f"Firmware binary not found: {fw_path}")
            return result

        file_size = os.path.getsize(fw_path)
        result["file_size"] = file_size
        if file_size != CGISpecificationOracle.FIRMWARE_SPEC["total_size"]:
            result["errors"].append(
                f"File size mismatch: expected {CGISpecificationOracle.FIRMWARE_SPEC['total_size']}, got {file_size}"
            )

        with open(fw_path, "rb") as f:
            data = f.read()

        if len(data) < 32:
            result["errors"].append("Firmware binary too small for dual-block headers")
            return result

        # Block 1 Header
        sig1, addr1, burn1, len1 = struct.unpack(">4sIII", data[:16])
        result["block1"] = {
            "sig": sig1,
            "addr": hex(addr1),
            "burnAddr": hex(burn1),
            "len": len1
        }
        if sig1 != CGISpecificationOracle.FIRMWARE_SPEC["block1_sig"]:
            result["errors"].append(f"Block 1 signature invalid: {sig1}")
        if addr1 != CGISpecificationOracle.FIRMWARE_SPEC["block1_addr"]:
            result["errors"].append(f"Block 1 load address invalid: {hex(addr1)}")
        if burn1 != CGISpecificationOracle.FIRMWARE_SPEC["block1_burn"]:
            result["errors"].append(f"Block 1 burn address invalid: {hex(burn1)}")
        if len1 != CGISpecificationOracle.FIRMWARE_SPEC["block1_len"]:
            result["errors"].append(f"Block 1 length invalid: {len1}")

        payload1 = data[16 : 16 + len1]
        sum1 = cls.calculate_16bit_word_sum(payload1)
        result["block1"]["fmCheck"] = hex(sum1)
        if sum1 != 0x0000:
            result["errors"].append(f"Block 1 fmCheck failure: word sum = {hex(sum1)} != 0x0000")

        # Block 2 Header
        b2_off = 16 + len1
        if len(data) < b2_off + 16:
            result["errors"].append("Truncated at Block 2 header")
            return result

        sig2, addr2, burn2, len2 = struct.unpack(">4sIII", data[b2_off : b2_off + 16])
        result["block2"] = {
            "sig": sig2,
            "addr": hex(addr2),
            "burnAddr": hex(burn2),
            "len": len2
        }
        if sig2 != CGISpecificationOracle.FIRMWARE_SPEC["block2_sig"]:
            result["errors"].append(f"Block 2 signature invalid: {sig2}")
        if addr2 != CGISpecificationOracle.FIRMWARE_SPEC["block2_addr"]:
            result["errors"].append(f"Block 2 load address invalid: {hex(addr2)}")
        if burn2 != CGISpecificationOracle.FIRMWARE_SPEC["block2_burn"]:
            result["errors"].append(f"Block 2 burn address invalid: {hex(burn2)}")
        if len2 != CGISpecificationOracle.FIRMWARE_SPEC["block2_len"]:
            result["errors"].append(f"Block 2 length invalid: {len2}")

        payload2 = data[b2_off + 16 : b2_off + 16 + len2]
        sum2 = cls.calculate_16bit_word_sum(payload2)
        result["block2"]["fmCheck"] = hex(sum2)
        if sum2 != 0x0000:
            result["errors"].append(f"Block 2 fmCheck failure: word sum = {hex(sum2)} != 0x0000")

        # Check SquashFS Superblock
        if len(payload2) >= 32:
            sq_magic = payload2[:4]
            sq_major, sq_minor = struct.unpack(">HH", payload2[28:32])
            result["squashfs"] = {
                "magic": sq_magic,
                "major": sq_major,
                "minor": sq_minor
            }
            if sq_magic != CGISpecificationOracle.FIRMWARE_SPEC["squashfs_magic"]:
                result["errors"].append(f"Rootfs SquashFS magic invalid: {sq_magic}")
            if sq_major != 2 or sq_minor != 0:
                result["errors"].append(f"SquashFS version mismatch: {sq_major}.{sq_minor} != 2.0")

        result["valid"] = len(result["errors"]) == 0
        return result


class ManifestInspector:
    """Inspector for squashfs-root/manifest.json inode table and source isolation."""

    @classmethod
    def audit_manifest(cls, manifest_path: Path) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "valid": False,
            "errors": [],
            "inodes": 0,
            "files_count": 0,
            "dangling_entries": [],
            "source_isolation_violations": []
        }
        if not os.path.exists(manifest_path):
            result["errors"].append(f"Manifest not found: {manifest_path}")
            return result

        with open(manifest_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except Exception as e:
                result["errors"].append(f"Manifest JSON corrupt: {e}")
                return result

        superblock = data.get("superblock", {})
        files = data.get("files", [])
        result["inodes"] = superblock.get("inodes", 0)
        result["files_count"] = len(files)

        if result["inodes"] != result["files_count"]:
            result["errors"].append(
                f"Superblock inode count mismatch: superblock.inodes ({result['inodes']}) != len(files) ({result['files_count']})"
            )

        known_paths = set(f.get("path", "") for f in files)

        # Check for dangling entries in directories
        for f in files:
            p = f.get("path", "")
            entries = f.get("entries", [])
            for e in entries:
                child_p = f"{p}/{e}" if p else e
                if child_p not in known_paths:
                    result["dangling_entries"].append({"parent": p, "entry": e, "full_path": child_p})

        if result["dangling_entries"]:
            result["errors"].append(f"Found {len(result['dangling_entries'])} dangling directory entries")

        # Source code isolation check
        banned_patterns = [r'\.decompressed\.htm$', r'\.bak$', r'\.tmp$', r'~']
        for p in known_paths:
            for pat in banned_patterns:
                if re.search(pat, p, re.IGNORECASE):
                    result["source_isolation_violations"].append(p)

        if result["source_isolation_violations"]:
            result["errors"].append(f"Source isolation violated: {len(result['source_isolation_violations'])} banned files in manifest")

        result["valid"] = len(result["errors"]) == 0
        return result


class GzipArtifactInspector:
    """Inspector for gzip production artifact web/new.htm."""

    @classmethod
    def validate_gzip_artifact(cls, artifact_path: Path, source_path: Optional[Path] = None) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "valid": False,
            "errors": [],
            "size": 0,
            "decompressed_size": 0,
            "matches_source": False
        }
        if not os.path.exists(artifact_path):
            result["errors"].append(f"Gzip artifact not found: {artifact_path}")
            return result

        with open(artifact_path, "rb") as f:
            raw = f.read()

        result["size"] = len(raw)
        if len(raw) < 2 or raw[:2] != b"\x1f\x8b":
            result["errors"].append(f"Invalid gzip magic: {raw[:2] if len(raw) >= 2 else raw}")
            return result

        try:
            decomp = gzip.decompress(raw)
            result["decompressed_size"] = len(decomp)
        except Exception as e:
            result["errors"].append(f"Gzip decompression failed: {e}")
            return result

        if source_path and os.path.exists(source_path):
            with open(source_path, "rb") as sf:
                src_bytes = sf.read()
            result["matches_source"] = (decomp == src_bytes)
            if not result["matches_source"]:
                result["errors"].append(f"Decompressed artifact differs from source file {source_path}")

        result["valid"] = len(result["errors"]) == 0
        return result


class TestRecord:
    """Individual test execution record."""
    def __init__(self, test_id: str, tier: int, milestone: str, feature_id: int, name: str):
        self.test_id = test_id
        self.tier = tier
        self.milestone = milestone
        self.feature_id = feature_id
        self.name = name
        self.status = "PENDING"  # PASS, FAIL, GAP
        self.message = ""
        self.details: Dict[str, Any] = {}

    def pass_test(self, message: str = "Passed"):
        self.status = "PASS"
        self.message = message

    def fail_test(self, message: str, details: Optional[Dict[str, Any]] = None):
        self.status = "FAIL"
        self.message = message
        if details:
            self.details = details

    def gap_test(self, message: str, details: Optional[Dict[str, Any]] = None):
        """Mark as implementation gap (feature specification verified, implementation pending/missing)."""
        self.status = "GAP"
        self.message = message
        if details:
            self.details = details

    def to_dict(self) -> Dict[str, Any]:
        return {
            "test_id": self.test_id,
            "tier": self.tier,
            "milestone": self.milestone,
            "feature_id": self.feature_id,
            "name": self.name,
            "status": self.status,
            "message": self.message,
            "details": self.details
        }
