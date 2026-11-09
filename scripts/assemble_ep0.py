#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Assemble Episode 0: 《第 0 期：NBA百亿球衣王座宫斗史（先导总纲篇）》
1. Exact acoustic-to-clause DP alignment for 253.151s (04:13.15) voiceover
2. Export SRT subtitles + JSON timeline
3. Copy & rename all 35 raw video clips into chronological order in 01_按分镜排序视频素材/
4. Render 1080P MP4 video (both clean & burned-in subtitles) with synchronized video clips, voiceover, and subtle diegetic paper sound effects
5. Generate multi-track JianYing Pro (剪映专业版) draft project
"""

import os
import re
import json
import wave
import shutil
import subprocess
import numpy as np

BASE_DIR = "/Users/young/Downloads/NBA品牌发展史"
RAW_VID_DIR = os.path.join(BASE_DIR, "下载内容")
SORTED_VID_DIR = os.path.join(BASE_DIR, "01_按分镜排序视频素材")
ALIGNED_SEG_DIR = os.path.join(BASE_DIR, "02_音画对齐分镜切片")
WAV_PATH = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_配音_微调提速+紧凑气口版.wav")
TXT_PATH = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_TTS口播文案.txt")
SRT_PATH = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_字幕.srt")
JSON_PATH = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_分镜时间轴对齐表.json")
OUT_CLEAN_MP4 = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_纯画面无字幕版.mp4")
OUT_FINAL_MP4 = os.path.join(BASE_DIR, "第0期_NBA百亿球衣王座宫斗史_成片.mp4")

os.makedirs(SORTED_VID_DIR, exist_ok=True)
os.makedirs(ALIGNED_SEG_DIR, exist_ok=True)

# ---------------------------------------------------------
# STEP 1: Acoustic-to-Clause Alignment (119 clauses, 253.151s)
# ---------------------------------------------------------
with wave.open(WAV_PATH, "rb") as wf:
    sr = wf.getframerate()
    n_frames = wf.getnframes()
    total_audio_dur = n_frames / sr
    data = np.frombuffer(wf.readframes(n_frames), dtype=np.int16).astype(np.float32) / 32768.0

win_size = int(sr * 0.01)
n_wins = len(data) // win_size
rms = np.sqrt(np.mean(data[:n_wins * win_size].reshape(n_wins, win_size) ** 2, axis=1))
is_sil = rms < 0.012
min_sil_wins = 7  # 70ms

sil_runs = []
in_run = False
start = 0
for i, v in enumerate(is_sil):
    if v and not in_run:
        in_run = True
        start = i
    elif not v and in_run:
        in_run = False
        if i - start >= min_sil_wins:
            sil_runs.append((start * 0.01, i * 0.01))
if in_run and (len(is_sil) - start) >= min_sil_wins:
    sil_runs.append((start * 0.01, len(is_sil) * 0.01))

voiced = []
prev_end = 0.0
for s, e in sil_runs:
    if s - prev_end > 0.05:
        voiced.append([prev_end, s])
    prev_end = e
if total_audio_dur - prev_end > 0.05:
    voiced.append([prev_end, total_audio_dur])

# Note: In `45.10 - 48.49`, TTS read "在1990年以前，NBA球衣根本就不是一门面向大众的生意" with a micro-dip at 46.05s.
# Let's split voiced segment [45.10, 47.18] at 46.05s so clauses 023 and 024 align 1:1.
new_voiced = []
for s, e in voiced:
    if abs(s - 45.10) < 0.05 and e > 46.5:
        new_voiced.append([s, 46.02])
        new_voiced.append([46.10, e])
    else:
        new_voiced.append([s, e])
voiced = new_voiced

txt = open(TXT_PATH, "r", encoding="utf-8").read().strip()
raw_clauses = [c.strip() for c in re.split(r"[，。！？；：—\n]+", txt) if c.strip()]
clauses = []
for rc in raw_clauses:
    if "、" in rc and len(rc) >= 18 and "库里" not in rc and "杰克琼斯" not in rc:
        for sub in rc.split("、"):
            if sub.strip():
                clauses.append(sub.strip())
    else:
        clauses.append(rc)

def est_weight(c):
    cn = len(re.findall(r"[\u4e00-\u9fff]", c))
    en = len(re.findall(r"[A-Za-z]+", c))
    num = len(re.findall(r"\d+", c))
    return max(0.8, cn * 1.0 + en * 2.2 + num * 1.6)

weights = [est_weight(c) for c in clauses]
total_v_dur = sum(e - s for s, e in voiced)
target_durs = [w / sum(weights) * total_v_dur for w in weights]

M = len(voiced)
N = len(clauses)
v_durs = [e - s for s, e in voiced]
v_gaps = [voiced[i+1][0] - voiced[i][1] if i+1 < M else 0.5 for i in range(M)]

dp = np.full((N + 1, M + 1), 1e9)
parent = np.zeros((N + 1, M + 1), dtype=int)
dp[0, 0] = 0.0

for i in range(1, N + 1):
    t_dur = target_durs[i - 1]
    for j in range(i, M - (N - i) + 1):
        cur_dur = 0.0
        for k in range(j - 1, i - 2, -1):
            cur_dur += v_durs[k]
            if cur_dur > t_dur * 2.8 and k < j - 1:
                break
            dur_err = ((cur_dur - t_dur) / max(0.5, t_dur)) ** 2
            gap_after = v_gaps[j - 1]
            boundary_bonus = -1.2 * min(0.30, gap_after)
            internal_gap_pen = sum(6.0 * max(0.0, v_gaps[m] - 0.16) for m in range(k, j - 1))
            cost = dp[i - 1, k] + dur_err + boundary_bonus + internal_gap_pen
            if cost < dp[i, j]:
                dp[i, j] = cost
                parent[i, j] = k

groups = []
curr_j = M
for i in range(N, 0, -1):
    prev_k = parent[i, curr_j]
    groups.append((prev_k, curr_j - 1))
    curr_j = prev_k
groups.reverse()

aligned_clauses = []
for idx, (g_s, g_e) in enumerate(groups):
    s_time = round(voiced[g_s][0], 3)
    e_time = round(voiced[g_e][1], 3)
    # Clean display text for subtitles (restore % symbols)
    disp = clauses[idx].replace("百分之30", "30%").replace("百分之240", "240%")
    aligned_clauses.append({
        "index": idx,
        "start": s_time,
        "end": e_time,
        "duration": round(e_time - s_time, 3),
        "text": disp
    })

def fmt_srt_time(sec):
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms >= 1000:
        s += 1
        ms -= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

with open(SRT_PATH, "w", encoding="utf-8") as sf:
    for item in aligned_clauses:
        sf.write(f"{item['index'] + 1}\n")
        sf.write(f"{fmt_srt_time(item['start'])} --> {fmt_srt_time(item['end'])}\n")
        sf.write(f"{item['text']}\n\n")

print(f"[OK] Generated SRT with {len(aligned_clauses)} clauses -> {SRT_PATH}")

# ---------------------------------------------------------
# STEP 2: Map all 35 raw video clips in chronological order
# ---------------------------------------------------------
raw_files = sorted([f for f in os.listdir(RAW_VID_DIR) if f.endswith(".mp4")])
assert len(raw_files) == 35, f"Expected 35 mp4 files, found {len(raw_files)}"

def rf(idx_1based):
    return os.path.join(RAW_VID_DIR, raw_files[idx_1based - 1])

# Define the 35 chronological raw clips with human-readable names
CHRONO_RAW_CLIPS = [
    (13, "01_第一幕_分镜01_1992巴塞罗那乔丹国旗遮挡锐步Logo.mp4"),
    (9,  "02_第一幕_分镜02_2015詹姆斯徒手撕烂短袖比赛服.mp4"),
    (31, "03_第一幕_分镜03_2017揭幕战10亿美金耐克球衣撕裂.mp4"),
    (28, "04_第一幕_分镜04A_200克背心天平与巨头红眼.mp4"),
    (30, "05_第一幕_分镜05_35年赞助费狂飙至10亿美金阶梯.mp4"),
    (15, "06_第一幕_分镜04B_商业修罗场天平与巨头暗战.mp4"),
    (32, "07_第一幕_分镜06_NBA合作品牌绝密档案盒开启.mp4"),
    (29, "08_第一幕_分镜07_四大球衣帝国环绕核心王座.mp4"),
    (3,  "09_第二幕_分镜08A_1990以前封锁的铁皮更衣柜.mp4"),
    (23, "10_第二幕_分镜08B_SandKnit流汗工作服更衣室.mp4"),
    (16, "11_第二幕_分镜09_SandKnit工作服与商场空橱窗对比.mp4"),
    (4,  "12_第二幕_分镜10_1990年Champion破局成为独家赞助.mp4"),
    (24, "13_第二幕_分镜11_球迷胶印版球衣街头穿搭与公牛盛世.mp4"),
    (8,  "14_第二幕_分镜13_猛龙红色霸王龙与魔术暗星细条纹.mp4"),
    (10, "15_第二幕_分镜14_太阳队火球流星球衣与Champion印记.mp4"),
    (12, "16_第二幕_分镜15_球衣印钞机吐美钞引来恶狼环伺.mp4"),
    (21, "17_第二幕_分镜16_1997年30支球队一分为三混战期.mp4"),
    (6,  "18_第二幕_分镜18_Starter半途破产由彪马Puma紧急接盘.mp4"),
    (27, "19_第三幕_分镜20_搅局者锐步与1992梦一队领奖服.mp4"),
    (17, "20_第三幕_分镜21_乔丹国旗遮挡锐步标沦为体育圈笑柄.mp4"),
    (11, "21_第三幕_分镜22_2001年锐步拍出10年2.5亿买断合同.mp4"),
    (35, "22_第三幕_分镜23_锐步一脚把耐克和Champion踢出局.mp4"),
    (14, "23_第三幕_分镜24_艾弗森身穿3号球衣单核闯进总决赛.mp4"),
    (19, "24_第三幕_分镜25_锐步宽大剪裁定义千禧年街头嘻哈风.mp4"),
    (33, "25_第三幕_分镜26_2005年阿迪达斯豪掷38亿吞并锐步.mp4"),
    (26, "26_第三幕_分镜27_阿迪达斯统治11年一半天才一半疯子.mp4"),
    (18, "27_第三幕_分镜28_减重30%的Revolution30黑科技网眼.mp4"),
    (20, "28_第三幕_分镜29_2015奶油字体圣诞球衣二级市场天价.mp4"),
    (5,  "29_第三幕_分镜30_阿迪强推短袖球衣撕裂碎片翻车出局.mp4"),
    (7,  "30_第四幕_分镜34_2017耐克与Jordan飞人标印上右胸口.mp4"),
    (34, "31_第四幕_分镜35_耐克恐怖商业收割齿轮装置.mp4"),
    (25, "32_第四幕_分镜36_城市版与精英版球衣让球迷每年掏腰包.mp4"),
    (1,  "33_第五幕_分镜38_NBA装备战争冰山一角与水下斯伯丁篮球.mp4"),
    (22, "34_第五幕_分镜40_JR史密斯Supreme护臂罚单与联名专柜.mp4"),
    (2,  "35_第五幕_分镜41_下期预告初代霸主Champion第一弹.mp4"),
]

for r_idx, sorted_name in CHRONO_RAW_CLIPS:
    src = rf(r_idx)
    dst = os.path.join(SORTED_VID_DIR, sorted_name)
    shutil.copy2(src, dst)

print(f"[OK] Copied & renamed all 35 raw clips into {SORTED_VID_DIR}")

# ---------------------------------------------------------
# STEP 3: Build Exact Timeline Shots (0.000s -> 253.151s)
# ---------------------------------------------------------
# Helper to get midpoint boundary between clause i and clause i+1
def boundary_after(c_idx):
    if c_idx >= len(aligned_clauses) - 1:
        return round(total_audio_dur, 3)
    end_curr = aligned_clauses[c_idx]["end"]
    start_next = aligned_clauses[c_idx + 1]["start"]
    return round((end_curr + start_next) / 2.0, 3)

# For multi-sentence shots where a single 6s clip covers >10s of narration,
# we split into a Wide Establishing Shot + Focal Close-up Shot so every clip plays at natural speed.
TIMELINE_PLAN = [
    # (shot_id, raw_1based_idx, start_clause, end_clause, crop_mode, title)
    ("S01", 13, 0,   2,   "full",      "1992巴塞罗那乔丹国旗遮挡Logo"),
    ("S02", 9,  3,   5,   "full",      "2015詹姆斯徒手撕烂短袖比赛服"),
    ("S03", 31, 6,   8,   "full",      "2017揭幕战耐克23号球衣撕裂"),
    ("S04", 28, 9,   10,  "full",      "不到200克背心让体育巨头红了眼"),
    ("S05", 30, 11,  13,  "full",      "赞助费从几百万一路狂飙到10亿美金"),
    ("S06", 15, 14,  15,  "full",      "体育史上最残酷的商业修罗场"),
    ("S07", 32, 16,  18,  "full",      "开启全新系列扒透NBA合作装备品牌"),
    ("S08", 29, 19,  21,  "full",      "统治NBA赛场的四大球衣帝国王座"),
    ("S09", 3,  22,  24,  "full",      "1990年以前球衣不是面向大众的生意"),
    ("S10", 23, 25,  26,  "full",      "供应商Sand-Knit流汗工作服"),
    ("S11", 16, 27,  28,  "full",      "商场空橱窗球迷买正版球衣比登天还难"),
    ("S12", 4,  29,  31,  "full",      "1990年Champion成为首个全联盟独家赞助"),
    ("S13", 24, 32,  34,  "full",      "研发适合日常穿搭的球迷胶印版球衣"),
    ("S14", 24, 35,  36,  "zoom_mid",  "伴随乔丹公牛王朝开启球衣审美黄金盛世"),
    ("S15", 8,  37,  38,  "full",      "猛龙红色霸王龙与魔术暗星细条纹"),
    ("S16", 10, 39,  40,  "full",      "太阳队斜跨胸口火球流星出自Champion"),
    ("S17", 12, 41,  42,  "full",      "球衣市场变成印钞机引来饿狼"),
    ("S18", 21, 43,  45,  "full",      "1997年耐克与Starter杀入一分为三"),
    ("S19", 21, 46,  48,  "zoom_mid",  "一国三制混战期：科比首冠与艾弗森MVP"),
    ("S20", 6,  49,  52,  "full",      "Starter破产彪马接盘与复仇者杀出"),
    ("S21", 27, 53,  55,  "full",      "搅局者锐步与1992奥运会梦一队领奖服"),
    ("S22", 17, 56,  57,  "full",      "乔丹国旗遮挡锐步Logo沦为体育圈笑柄"),
    ("S23", 11, 58,  59,  "full",      "2001年锐步拍出10年2.5亿买断合同"),
    ("S24", 35, 60,  60,  "full",      "一脚把耐克和Champion全部踢出局"),
    ("S25", 14, 61,  61,  "full",      "伴随艾弗森单核闯进总决赛"),
    ("S26", 19, 62,  63,  "full",      "锐步宽大松垮剪裁定义千禧年街头嘻哈风"),
    ("S27", 33, 64,  66,  "full",      "2005年阿迪达斯豪掷38亿美金吞并锐步"),
    ("S28", 26, 67,  70,  "full",      "阿迪达斯统治11年一半是天才一半是疯子"),
    ("S29", 18, 71,  72,  "full",      "减重30%的Revolution 30黑科技"),
    ("S30", 20, 73,  75,  "full",      "2015奶油字体圣诞大战球衣炒出天价"),
    ("S31", 5,  76,  79,  "full",      "阿迪违背运动规律强推短袖球衣"),
    ("S32", 5,  80,  82,  "zoom_low",  "球星吐槽卡肩膀与撕袖子翻车埋下出局伏笔"),
    ("S33", 7,  83,  87,  "full",      "2017年耐克甩出8年10亿美金垄断赛场"),
    ("S34", 7,  88,  91,  "zoom_chest","NBA允许耐克钩子与Jordan飞人标印上右胸口"),
    ("S35", 34, 92,  93,  "full",      "开局球衣撕裂门与恐怖商业收割能力"),
    ("S36", 25, 94,  97,  "full",      "废除主客场死规矩推城市版让球迷每年掏腰包"),
    ("S37", 1,  98,  103, "full",      "四大球衣帝国只是NBA装备战争的冰山一角"),
    ("S38", 1,  104, 107, "zoom_low",  "水下暗战：统治38年的斯伯丁换皮罢赛与威尔胜夺权"),
    ("S39", 22, 108, 110, "full",      "JR史密斯Supreme护臂罚单与国内商场安踏杰克琼斯联名"),
    ("S40", 2,  111, 115, "full",      "下期预告第一弹：初代霸主Champion"),
    ("S41", 2,  116, 118, "zoom_mid",  "互动收尾：在评论区晒出你的青春球衣"),
]

# Build exact start/end timestamps for each shot
timeline_shots = []
cur_t = 0.0
for idx, (shot_id, r_idx, c_start, c_end, crop_mode, title) in enumerate(TIMELINE_PLAN):
    end_t = boundary_after(c_end)
    if idx == len(TIMELINE_PLAN) - 1:
        end_t = round(total_audio_dur, 3)
    dur = round(end_t - cur_t, 3)
    clauses_text = "，".join(aligned_clauses[c]["text"] for c in range(c_start, c_end + 1))
    timeline_shots.append({
        "shot_index": idx + 1,
        "shot_id": shot_id,
        "raw_video_index": r_idx,
        "raw_video_file": raw_files[r_idx - 1],
        "raw_video_path": rf(r_idx),
        "crop_mode": crop_mode,
        "title": title,
        "start": round(cur_t, 3),
        "end": round(end_t, 3),
        "duration": dur,
        "clause_range": [c_start, c_end],
        "narration": clauses_text
    })
    cur_t = end_t

with open(JSON_PATH, "w", encoding="utf-8") as jf:
    json.dump({
        "audio_path": WAV_PATH,
        "total_duration": round(total_audio_dur, 3),
        "shots": timeline_shots,
        "clauses": aligned_clauses
    }, jf, ensure_ascii=False, indent=2)

print(f"[OK] Built {len(timeline_shots)} exact timeline shots covering 0.000s -> {total_audio_dur:.3f}s")
