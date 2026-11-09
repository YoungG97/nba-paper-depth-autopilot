#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate JianYing Pro (剪映专业版) Draft for Episode 0: 《第 0 期：NBA百亿球衣王座宫斗史》
Tracks:
1. VideoTrack: 41 synchronized, labeled 1080P video clips
2. VoiceOver Track: 04:13.15 master voiceover (44.1kHz mono)
3. Subtitles Track: 119 synchronized, styled broadcast subtitles
"""

import os
import sys
import json

# Add jianying-editor scripts to path
JY_DIR = "/Users/young/.gemini/config/skills/jianying-editor"
SCRIPTS_DIR = os.path.join(JY_DIR, "scripts")
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

from jy_wrapper import JyProject
import pyJianYingDraft as draft

BASE_DIR = "/Users/young/Downloads/NBA品牌发展史"
SLICES_DIR = os.path.join(BASE_DIR, "02_音画对齐分镜切片")
WAV_PATH = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_配音_微调提速+紧凑气口版.wav")
JSON_PATH = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_分镜时间轴对齐表.json")

PROJECT_NAME = "第0期_NBA百亿球衣王座宫斗史"

with open(JSON_PATH, "r", encoding="utf-8") as jf:
    data = json.load(jf)

shots = data["shots"]
clauses = data["clauses"]
total_dur = data["total_duration"]

print(f"Initializing JianYing Draft: '{PROJECT_NAME}'...")
project = JyProject(project_name=PROJECT_NAME, overwrite=True)
project.script.width = 1920
project.script.height = 1080
project.script.fps = 30

# 1. Add Video Slices to Main Video Track
print(f"Adding {len(shots)} video clips to VideoTrack...")
for s in shots:
    s_id = s["shot_id"]
    slice_path = os.path.join(SLICES_DIR, f"{s_id}_{s['title']}.mp4")
    if not os.path.exists(slice_path):
        print(f"⚠️ Warning: slice not ready yet: {slice_path}")
        continue
    start_us = int(round(s["start"] * 1000000))
    dur_us = int(round(s["duration"] * 1000000))
    project.add_media_safe(
        slice_path,
        start_time=start_us,
        duration=dur_us,
        track_name="VideoTrack"
    )

# 2. Add Voiceover Track
print("Adding master voiceover to VoiceOver track...")
project.add_media_safe(
    WAV_PATH,
    start_time=0,
    duration=int(round(total_dur * 1000000)),
    track_name="VoiceOver"
)

# 3. Add Subtitles Track
print(f"Adding {len(clauses)} subtitle segments to Subtitles track...")
clip_settings = draft.ClipSettings(transform_y=-0.80)
sub_style = draft.TextStyle(size=5.2)
sub_border = draft.TextBorder(color=(0.0, 0.0, 0.0), alpha=1.0, width=35.0)

for c in clauses:
    start_us = int(round(c["start"] * 1000000))
    dur_us = int(round(c["duration"] * 1000000))
    text = c["text"]
    project.add_text_simple(
        text,
        start_time=start_us,
        duration=dur_us,
        track_name="Subtitles",
        clip_settings=clip_settings,
        style=sub_style,
        border=sub_border
    )

print("Saving JianYing project draft...")
project.save()
print(f"🎉 Successfully created JianYing Pro Draft: '{PROJECT_NAME}'!")
