import os
import sys
import struct
import lzma
import json
import time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

class SquashFS2Writer:
    def __init__(self, block_size=65536):
        self.block_size = block_size
        self.block_log = 16 # for 65536
        self.out = bytearray(63) # Reserve exactly 63 bytes for compact SquashFS 2.0 superblock
        self.lzma_filters = [{'id': lzma.FILTER_LZMA1, 'dict_size': 65536, 'lc': 3, 'lp': 0, 'pb': 2}]

        # Fragment management
        self.fragment_entries = [] # list of (start_block, size)
        self.cur_frag_buf = bytearray()
        self.cur_frag_map = {} # (frag_idx, offset) for each item

        # Metadata blocks writer
        # Inodes metadata
        self.inode_table = bytearray()
        self.cur_inode_buf = bytearray()
        self.inode_disk_blocks = [] # disk offsets of inode blocks

        # Directory metadata
        self.dir_table = bytearray()
        self.cur_dir_buf = bytearray()
        self.dir_disk_blocks = []

    def compress_lzma(self, data):
        return lzma.compress(data, format=lzma.FORMAT_RAW, filters=self.lzma_filters)

    def write_data_block(self, chunk):
        start_block = len(self.out)
        if len(chunk) == 0:
            return start_block, 0

        compressed = self.compress_lzma(chunk)
        if len(compressed) < len(chunk):
            self.out.extend(compressed)
            return start_block, len(compressed)
        else:
            self.out.extend(chunk)
            return start_block, len(chunk) | (1 << 24)

    def add_fragment(self, chunk):
        # chunk is < block_size
        if len(self.cur_frag_buf) + len(chunk) > self.block_size:
            self.flush_fragment()

        offset = len(self.cur_frag_buf)
        frag_idx = len(self.fragment_entries)
        self.cur_frag_buf.extend(chunk)
        return frag_idx, offset

    def flush_fragment(self):
        if len(self.cur_frag_buf) == 0:
            return
        start_blk, bsz = self.write_data_block(self.cur_frag_buf)
        self.fragment_entries.append((start_blk, bsz))
        self.cur_frag_buf = bytearray()

    def add_inode_bytes(self, raw_bytes):
        # We need to return (block_start_index, offset) relative to inode table start
        # If adding raw_bytes would overflow 8192, flush current buffer
        if len(self.cur_inode_buf) + len(raw_bytes) > 8192:
            self.flush_inode_buf()

        block_start = len(self.inode_table)
        offset = len(self.cur_inode_buf)
        self.cur_inode_buf.extend(raw_bytes)
        return block_start, offset

    def flush_inode_buf(self):
        if len(self.cur_inode_buf) == 0:
            return
        compressed = self.compress_lzma(self.cur_inode_buf)
        if len(compressed) < len(self.cur_inode_buf):
            c_byte = len(compressed)
            self.inode_table.extend(struct.pack(">H", c_byte))
            self.inode_table.extend(compressed)
        else:
            c_byte = len(self.cur_inode_buf) | 0x8000
            self.inode_table.extend(struct.pack(">H", c_byte))
            self.inode_table.extend(self.cur_inode_buf)
        self.cur_inode_buf = bytearray()

    def add_dir_bytes(self, raw_bytes):
        if len(self.cur_dir_buf) + len(raw_bytes) > 8192:
            self.flush_dir_buf()

        block_start = len(self.dir_table)
        offset = len(self.cur_dir_buf)
        self.cur_dir_buf.extend(raw_bytes)
        return block_start, offset

    def flush_dir_buf(self):
        if len(self.cur_dir_buf) == 0:
            return
        compressed = self.compress_lzma(self.cur_dir_buf)
        if len(compressed) < len(self.cur_dir_buf):
            c_byte = len(compressed)
            self.dir_table.extend(struct.pack(">H", c_byte))
            self.dir_table.extend(compressed)
        else:
            c_byte = len(self.cur_dir_buf) | 0x8000
            self.dir_table.extend(struct.pack(">H", c_byte))
            self.dir_table.extend(self.cur_dir_buf)
        self.cur_dir_buf = bytearray()

    def pack_tree(self, input_dir, output_path):
        manifest_path = os.path.join(input_dir, "manifest.json")
        with open(manifest_path, "r", encoding='utf-8') as f:
            manifest = json.load(f)

        orig_sb = manifest['superblock']
        files_meta = {item['path']: item for item in manifest['files']}

        print(f"[*] Packing tree from: {input_dir}")
        print(f"    Superblock template: version {orig_sb['s_major']}.{orig_sb['s_minor']}, inodes: {orig_sb['inodes']}")

        # Phase 1: Write all file data blocks and fragments
        inode_records = {} # path -> dict with inode info

        for item in manifest['files']:
            path = item['path']
            itype = item['inode_type']
            rel_disk_path = os.path.join(input_dir, path.replace('/', os.sep))

            if itype == 2: # Regular file
                with open(rel_disk_path, "rb") as f:
                    file_data = f.read()

                fsize = len(file_data)
                num_full_blocks = fsize // self.block_size
                rem_size = fsize % self.block_size

                start_block = len(self.out)
                block_sizes = []

                for bi in range(num_full_blocks):
                    chunk = file_data[bi*self.block_size : (bi+1)*self.block_size]
                    s_blk, bsz = self.write_data_block(chunk)
                    block_sizes.append(bsz)

                if rem_size > 0:
                    frag_chunk = file_data[num_full_blocks*self.block_size :]
                    frag_idx, frag_offset = self.add_fragment(frag_chunk)
                else:
                    frag_idx = 0xffffffff
                    frag_offset = 0

                inode_records[path] = {
                    'inode_type': 2,
                    'mode': item['mode'],
                    'uid': item['uid'],
                    'guid': item['guid'],
                    'mtime': item['mtime'],
                    'file_size': fsize,
                    'start_block': start_block,
                    'fragment': frag_idx,
                    'frag_offset': frag_offset,
                    'block_sizes': block_sizes
                }

            elif itype == 3: # Symlink
                target = item.get('symlink_target', '')
                if not target:
                    # check .symlink file
                    sym_file = rel_disk_path + ".symlink"
                    if os.path.exists(sym_file):
                        with open(sym_file, "r", encoding='utf-8') as f:
                            target = f.read()

                inode_records[path] = {
                    'inode_type': 3,
                    'mode': item['mode'],
                    'uid': item['uid'],
                    'guid': item['guid'],
                    'mtime': item['mtime'],
                    'symlink': target
                }

            elif itype in (4, 5): # Device
                inode_records[path] = {
                    'inode_type': itype,
                    'mode': item['mode'],
                    'uid': item['uid'],
                    'guid': item['guid'],
                    'mtime': item['mtime'],
                    'rdev': item.get('rdev', 0)
                }

            elif itype in (1, 8): # Directory (will process after children)
                inode_records[path] = {
                    'inode_type': 1,
                    'mode': item['mode'],
                    'uid': item['uid'],
                    'guid': item['guid'],
                    'mtime': item['mtime'],
                    'entries': list(item.get('entries', []))
                }

        # Auto-ensure all children in manifest are present in parent directory entries
        for item in manifest['files']:
            p = item['path']
            if not p:
                continue
            parent = os.path.dirname(p).replace('\\', '/')
            base = os.path.basename(p)
            if parent in inode_records and inode_records[parent]['inode_type'] == 1:
                if base not in inode_records[parent]['entries']:
                    inode_records[parent]['entries'].append(base)

        # Flush any remaining fragments
        self.flush_fragment()
        print(f"[+] Data blocks and {len(self.fragment_entries)} fragments written. Current data size: {len(self.out)} bytes")

        # Phase 2: Build Directory and Inode Tables
        # Bottom-up approach: directories need children inodes' coordinates!
        # Sort paths by depth descending (deepest first)
        sorted_paths = sorted(manifest['files'], key=lambda x: len(x['path'].split('/')) if x['path'] else 0, reverse=True)

        # Inode coordinates: path -> (inode_block_start, inode_offset)
        inode_coords = {}

        # First, serialize all non-directory inodes
        for item in sorted_paths:
            path = item['path']
            itype = item['inode_type']
            rec = inode_records[path]

            if itype == 2: # FILE
                # Base header: 4 bytes
                v = (2 << 28) | ((rec['mode'] & 0xfff) << 16) | ((rec['uid'] & 0xff) << 8) | (rec['guid'] & 0xff)
                raw_inode = bytearray(struct.pack(">I", v))
                # Reg header: mtime: 32, start_block: 32, fragment: 32, offset: 32, file_size: 32
                raw_inode.extend(struct.pack(">i4I", rec['mtime'], rec['start_block'], rec['fragment'], rec['frag_offset'], rec['file_size']))
                # Block sizes
                for bsz in rec['block_sizes']:
                    raw_inode.extend(struct.pack(">I", bsz))

                blk, off = self.add_inode_bytes(raw_inode)
                inode_coords[path] = (blk, off)

            elif itype == 3: # SYMLINK
                v = (3 << 28) | ((rec['mode'] & 0xfff) << 16) | ((rec['uid'] & 0xff) << 8) | (rec['guid'] & 0xff)
                raw_inode = bytearray(struct.pack(">I", v))
                sym_bytes = rec['symlink'].encode('latin1')
                raw_inode.extend(struct.pack(">H", len(sym_bytes)))
                raw_inode.extend(sym_bytes)

                blk, off = self.add_inode_bytes(raw_inode)
                inode_coords[path] = (blk, off)

            elif itype in (4, 5): # DEV
                v = (itype << 28) | ((rec['mode'] & 0xfff) << 16) | ((rec['uid'] & 0xff) << 8) | (rec['guid'] & 0xff)
                raw_inode = bytearray(struct.pack(">I", v))
                raw_inode.extend(struct.pack(">H", rec['rdev']))

                blk, off = self.add_inode_bytes(raw_inode)
                inode_coords[path] = (blk, off)

        # Now serialize directories from deepest to root
        for item in sorted_paths:
            path = item['path']
            itype = item['inode_type']
            if itype not in (1, 8):
                continue

            rec = inode_records[path]
            child_names = [c for c in rec['entries'] if (f"{path}/{c}" if path else c) in inode_coords]

            # Build directory entries data
            dir_data = bytearray()
            # Group entries by child inode_block
            # For simplicity, each entry can have its own header or grouped by start_block
            i = 0
            while i < len(child_names):
                child_name = child_names[i]
                child_path = f"{path}/{child_name}" if path else child_name
                c_blk, c_off = inode_coords[child_path]
                c_type = inode_records[child_path]['inode_type']

                # Find how many consecutive entries share the same c_blk
                group = []
                j = i
                while j < len(child_names):
                    c_name_j = child_names[j]
                    c_path_j = f"{path}/{c_name_j}" if path else c_name_j
                    b_j, o_j = inode_coords[c_path_j]
                    t_j = inode_records[c_path_j]['inode_type']
                    if b_j == c_blk and len(group) < 256:
                        group.append((c_name_j, t_j, o_j))
                        j += 1
                    else:
                        break

                # Write dir header: count: 8 (count-1), start_block: 24
                hdr_val = ((len(group) - 1) << 24) | (c_blk & 0xffffff)
                dir_data.extend(struct.pack(">I", hdr_val))

                for c_name_entry, c_t, c_o in group:
                    # Write dir entry header: offset: 13, type: 3, size: 8
                    name_bytes = c_name_entry.encode('latin1')
                    size_val = len(name_bytes) - 1
                    w = ((c_o & 0x1fff) << 11) | ((c_t & 0x07) << 8) | (size_val & 0xff)
                    dir_data.extend(bytes([(w >> 16) & 0xff, (w >> 8) & 0xff, w & 0xff]))
                    dir_data.extend(name_bytes)

                i = j

            # Write directory data to dir table
            dir_blk, dir_off = self.add_dir_bytes(dir_data)
            dir_size = len(dir_data)

            # Now create directory inode
            # squashfs_dir_inode_header_2:
            # v: type: 4, mode: 12, uid: 8, guid: 8 (4 bytes)
            # w1: file_size: 19, offset: 13 (4 bytes)
            # mtime: 32 (4 bytes)
            # w2: start_block: 24 (3 bytes)
            v = (1 << 28) | ((rec['mode'] & 0xfff) << 16) | ((rec['uid'] & 0xff) << 8) | (rec['guid'] & 0xff)
            w1 = ((dir_size & 0x7ffff) << 13) | (dir_off & 0x1fff)
            mtime = rec['mtime']
            raw_dir_inode = bytearray(struct.pack(">2Ii", v, w1, mtime))
            raw_dir_inode.extend(bytes([(dir_blk >> 16) & 0xff, (dir_blk >> 8) & 0xff, dir_blk & 0xff]))

            blk, off = self.add_inode_bytes(raw_dir_inode)
            inode_coords[path] = (blk, off)

        # Flush remaining inode and dir metadata buffers
        self.flush_inode_buf()
        self.flush_dir_buf()

        # Phase 3: Assemble complete SquashFS image
        # Order:
        # 1. Data blocks (already in self.out[64:])
        # 2. Inode table
        # 3. Directory table
        # 4. Fragment table metadata block & index
        # 5. UID/GID table
        # 6. Superblock

        inode_table_start = len(self.out)
        self.out.extend(self.inode_table)

        dir_table_start = len(self.out)
        self.out.extend(self.dir_table)

        # Fragment table
        # First write fragment table metadata block
        frag_meta_raw = bytearray()
        for s_blk, fsz in self.fragment_entries:
            frag_meta_raw.extend(struct.pack(">2I", s_blk, fsz))

        # Compress fragment metadata block
        frag_meta_block_offset = len(self.out)
        comp_frag_meta = self.compress_lzma(frag_meta_raw)
        c_byte = len(comp_frag_meta)
        self.out.extend(struct.pack(">H", c_byte))
        self.out.extend(comp_frag_meta)

        # Now write fragment table index
        fragment_table_start = len(self.out)
        self.out.extend(struct.pack(">I", frag_meta_block_offset))

        # UID/GID table: UID 0 (root)
        uid_start = len(self.out)
        self.out.extend(struct.pack(">I", 0)) # UID 0
        guid_start = 0

        bytes_used = len(self.out)

        # Root inode coordinates
        root_blk, root_off = inode_coords[""]
        root_inode_raw = (root_blk << 16) | root_off

        # Build Superblock (exactly 63 bytes in SquashFS 2.0)
        sb_buf = bytearray(63)
        struct.pack_into(">7I4H3BI", sb_buf, 0,
                         0x73717368,               # s_magic
                         len(manifest['files']),   # inodes
                         bytes_used,               # bytes_used
                         uid_start,                # uid_start
                         guid_start,               # guid_start
                         inode_table_start,        # inode_table_start
                         dir_table_start,          # directory_table_start
                         2,                        # s_major
                         0,                        # s_minor
                         0,                        # block_size_1
                         16,                       # block_log
                         64,                       # flags (SQUASHFS_DUPLICATES)
                         1,                        # no_uids
                         0,                        # no_guids
                         orig_sb['mkfs_time']      # mkfs_time
        )
        struct.pack_into(">Q", sb_buf, 43, root_inode_raw)
        struct.pack_into(">3I", sb_buf, 51,
                         65536,                    # block_size
                         len(self.fragment_entries), # fragments
                         fragment_table_start      # fragment_table_start
        )

        # Copy superblock into self.out[:63]
        self.out[:63] = sb_buf

        # Pad to MTD partition boundary (3,276,800 bytes) with 0x00
        target_size = 3276800
        if len(self.out) < target_size:
            pad_len = target_size - len(self.out)
            self.out.extend(b'\x00' * pad_len)
            print(f"[+] Padded with {pad_len} bytes of 0x00 up to partition size {target_size} bytes")

        # Write Netcore UUID signature at 0x1fb000 (checked by Bootloader & checkupfile)
        uuid_str = b"VersionUUID2;NetcoreAR4A4\x00"
        self.out[0x1fb000 : 0x1fb000 + len(uuid_str)] = uuid_str
        self.out[0x1fb040 : 0x1fb042] = b"\x18\xcd"
        print(f"[+] Embedded Netcore UUID signature at 0x1fb000")

        # Compute and adjust 16-bit word checksum (fmCheck == 0)
        sum16 = 0
        for i in range(0, target_size - 2, 2):
            w = (self.out[i] << 8) | self.out[i+1]
            sum16 = (sum16 + w) & 0xffff
        last_w = (-sum16) & 0xffff
        self.out[target_size - 2] = (last_w >> 8) & 0xff
        self.out[target_size - 1] = last_w & 0xff

        # Verify checksum
        v_sum = 0
        for i in range(0, target_size, 2):
            w = (self.out[i] << 8) | self.out[i+1]
            v_sum = (v_sum + w) & 0xffff
        assert v_sum == 0, f"Checksum verification failed: {v_sum}"
        print(f"[+] 16-bit word checksum adjusted (fmCheck == 0: {v_sum == 0})")

        with open(output_path, "wb") as f:
            f.write(self.out)

        print(f"[+] Successfully repacked SquashFS 2.0 image to: {output_path}")
        print(f"    Image size: {len(self.out)} bytes (bytes used: {bytes_used})")
        print(f"    Inodes: {len(manifest['files'])}, Fragments: {len(self.fragment_entries)}")
        print(f"    Root inode: {hex(root_inode_raw)}")

if __name__ == "__main__":
    writer = SquashFS2Writer()
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    writer.pack_tree(os.path.join(base, "squashfs-root"),
                     os.path.join(base, "firmware_backup", "mtd1_rootfs_repacked.bin"))
