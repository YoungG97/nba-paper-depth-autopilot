# -*- coding: utf-8 -*-
import os, json, zlib, struct

EXT_DIR = "/Users/young/.gemini/antigravity/scratch/google-flow-batch-feeder"
os.makedirs(os.path.join(EXT_DIR, "icons"), exist_ok=True)
os.makedirs(os.path.join(EXT_DIR, "sidepanel"), exist_ok=True)

def create_png(path, width, height):
    # Create a sleek dark-red & gold badge icon PNG at exact pixel dimensions
    raw_data = bytearray()
    cx, cy = width / 2.0, height / 2.0
    r_outer = width * 0.45
    for y in range(height):
        raw_data.append(0)  # filter type 0
        for x in range(width):
            dx, dy = x - cx, y - cy
            dist = (dx*dx + dy*dy) ** 0.5
            # Rounded square background (#18181B) with vibrant red accent (#E11D48) and play triangle
            if dist <= r_outer:
                # Play triangle in center
                if x > width * 0.36 and x < width * 0.70 and abs(y - cy) < (width * 0.70 - x) * 0.65:
                    raw_data.extend((250, 204, 21, 255))  # Gold play icon
                elif dist > r_outer * 0.82:
                    raw_data.extend((225, 29, 72, 255))   # Alert red ring
                else:
                    raw_data.extend((24, 24, 27, 255))    # Dark slate core
            else:
                raw_data.extend((0, 0, 0, 0))

    def make_chunk(chunk_type, data):
        chunk = struct.pack(">I", len(data)) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return chunk + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_data), 9)
    png = b"\x89PNG\r\n\x1a\n" + make_chunk(b"IHDR", ihdr) + make_chunk(b"IDAT", idat) + make_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)

for sz in (16, 48, 128):
    create_png(os.path.join(EXT_DIR, "icons", f"icon-{sz}.png"), sz, sz)

# Also convert SHOTS from build_storyboard.py into sidepanel/default-ep0.js
import sys
sys.path.insert(0, "/Users/young/.gemini/antigravity/brain/29910bd4-8f27-40c7-9508-f565bb2ed201/scratch")
import build_storyboard as bs

shots_data = []
for s in bs.SHOTS:
    shots_data.append({
        "id": s["id"],
        "time": s["time"],
        "dur": s["dur"],
        "act": s["act"],
        "text": s["text"],
        "visual": s["visual"],
        "cam": s["cam"],
        "imagePrompt": f"{s['img_body']} {bs.IMG_LOCK} 画面比例16:9。",
        "videoPrompt": f"{s['vid_body']} {bs.VID_LOCK}",
        "imgDone": False,
        "vidDone": False
    })

default_project = {
    "id": "ep0-nba-jersey-empire",
    "name": "第0期：NBA百亿球衣王座宫斗史（42镜）",
    "createdAt": "2026-11-07",
    "shots": shots_data
}

with open(os.path.join(EXT_DIR, "sidepanel", "default-ep0.js"), "w", encoding="utf-8") as f:
    f.write("window.DEFAULT_EP0_PROJECT = " + json.dumps(default_project, ensure_ascii=False, indent=2) + ";\n")

print("Icons and default-ep0.js generated successfully.")
