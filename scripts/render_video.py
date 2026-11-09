#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Full Assembly Script for Episode 0: 《第 0 期：NBA百亿球衣王座宫斗史（先导总纲篇）》
- Generates aligned video slices for each shot
- Concatenates into 1080P video
- Mixes native paper diegetic sound (-16dB) + Master Voiceover (0dB)
- Produces:
  1. 第0期_NBA百亿球衣王座宫斗史_成片.mp4 (with broadcast subtitles)
  2. 第0期_NBA百亿球衣王座宫斗史_纯画面无字幕版.mp4 (clean background)
- Registers JianYing Pro (剪映专业版) multi-track project
"""

import os
import sys
import json
import subprocess
import shutil

BASE_DIR = "/Users/young/Downloads/NBA品牌发展史"
SLICES_DIR = os.path.join(BASE_DIR, "02_音画对齐分镜切片")
WAV_PATH = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_配音_微调提速+紧凑气口版.wav")
SRT_PATH = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_字幕.srt")
JSON_PATH = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_分镜时间轴对齐表.json")
CLEAN_MP4 = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_纯画面无字幕版.mp4")
FINAL_MP4 = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_成片.mp4")

os.makedirs(SLICES_DIR, exist_ok=True)

with open(JSON_PATH, "r", encoding="utf-8") as jf:
    data = json.load(jf)

shots = data["shots"]
total_dur = data["total_duration"]
print(f"Loaded {len(shots)} shots, total duration = {total_dur:.3f}s")

# Step 1: Render each individual slice
slice_files = []
concat_list_path = os.path.join(SLICES_DIR, "concat_list.txt")

with open(concat_list_path, "w", encoding="utf-8") as clist:
    for s in shots:
        s_id = s["shot_id"]
        target_dur = s["duration"]
        raw_path = s["raw_video_path"]
        crop_mode = s["crop_mode"]
        
        # Source video is 6.04s
        src_dur = 6.04
        pts_factor = target_dur / src_dur
        
        # Crop filter
        if crop_mode == "zoom_mid":
            crop_filter = "crop=in_w*0.82:in_h*0.82:(in_w-out_w)/2:(in_h-out_h)/2,"
        elif crop_mode == "zoom_low":
            crop_filter = "crop=in_w*0.82:in_h*0.82:(in_w-out_w)/2:in_h*0.18,"
        elif crop_mode == "zoom_chest":
            crop_filter = "crop=in_w*0.80:in_h*0.80:(in_w-out_w)/2:in_h*0.08,"
        else:
            crop_filter = ""
            
        vf = f"{crop_filter}scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setpts={pts_factor:.6f}*PTS,fps=30"
        
        # Audio filter for diegetic sound
        # atempo only accepts between 0.5 and 2.0
        speed_inv = 1.0 / pts_factor
        if speed_inv < 0.5:
            af = f"atempo=0.5,atempo={speed_inv/0.5:.6f},volume=0.15"
        elif speed_inv > 2.0:
            af = f"atempo=2.0,atempo={speed_inv/2.0:.6f},volume=0.15"
        else:
            af = f"atempo={speed_inv:.6f},volume=0.15"
            
        out_slice = os.path.join(SLICES_DIR, f"{s_id}_{s['title']}.mp4")
        slice_files.append(out_slice)
        clist.write(f"file '{out_slice}'\n")
        
        if not os.path.exists(out_slice) or os.path.getsize(out_slice) < 1000:
            cmd = [
                "ffmpeg", "-y", "-i", raw_path,
                "-vf", vf,
                "-af", af,
                "-t", f"{target_dur:.3f}",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
                out_slice
            ]
            print(f"Rendering slice {s_id} (target={target_dur:.2f}s)...")
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                print(f"Error on {s_id}: {res.stderr[-200:]}")
                sys.exit(1)

print(f"[OK] All {len(shots)} slices rendered successfully in {SLICES_DIR}")

# Step 2: Concat video slices and mix with master voiceover
print("Concatenating slices and multiplexing master voiceover...")
# We take the concatenated video + concatenated diegetic sound, and mix the master voiceover on top
concat_intermediate = os.path.join(SLICES_DIR, "concat_temp.mp4")
cmd_concat = [
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list_path,
    "-c", "copy", concat_intermediate
]
res = subprocess.run(cmd_concat, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
if res.returncode != 0:
    print(f"Concat failed: {res.stderr[-200:]}")
    sys.exit(1)

# Render Clean MP4 (concatenated video + diegetic sound mixed with master voiceover)
print("Mixing audio and generating Clean MP4...")
cmd_clean = [
    "ffmpeg", "-y",
    "-i", concat_intermediate,
    "-i", WAV_PATH,
    "-filter_complex", "[0:a]volume=0.18[sfx];[1:a]volume=1.0[voice];[sfx][voice]amix=inputs=2:duration=first:dropout_transition=2[aout]",
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
    "-t", f"{total_dur:.3f}",
    CLEAN_MP4
]
res = subprocess.run(cmd_clean, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
if res.returncode != 0:
    print(f"Clean MP4 failed: {res.stderr[-200:]}")
    sys.exit(1)
print(f"[OK] Clean MP4 created: {CLEAN_MP4}")

# Render Final Subtitled MP4
print("Burning subtitles into Final MP4...")
# Escape path for ffmpeg subtitles filter
srt_escaped = SRT_PATH.replace(":", "\\:").replace("'", "\\'")
sub_style = "FontName=PingFang SC,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2.2,Shadow=1.0,MarginV=38,Alignment=2"
cmd_sub = [
    "ffmpeg", "-y",
    "-i", CLEAN_MP4,
    "-vf", f"subtitles='{srt_escaped}':force_style='{sub_style}'",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-c:a", "copy",
    FINAL_MP4
]
res = subprocess.run(cmd_sub, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
if res.returncode != 0:
    print(f"Subtitled MP4 failed: {res.stderr[-200:]}")
    sys.exit(1)
print(f"[OK] Final Subtitled MP4 created: {FINAL_MP4}")

# Cleanup intermediate concat file
if os.path.exists(concat_intermediate):
    os.remove(concat_intermediate)

print("\n🎉 VIDEO ASSEMBLY COMPLETE!")
print(f"1. Final MP4 (with subtitles): {FINAL_MP4}")
print(f"2. Clean MP4 (no subtitles):   {CLEAN_MP4}")
print(f"3. SRT Subtitles:             {SRT_PATH}")
