# -*- coding: utf-8 -*-
"""桌宠素材后处理脚本：raw 白底 JPG → 透明 PNG 统一规格。

用法：
    python resources\_gen_custom\process_assets.py [--tol 14] [--raw resources\_gen\raw] [--out src\renderer\public\assets]

流程：
  1. 四角采样背景色，floodfill 抠掉白底（不吞线稿包围的角色内部白色）
  2. 背景掩码膨胀 1px 去掉角色边缘白边
  3. 裁剪到内容包围盒
  4. 等比缩放放入 832x1040（4:5，与主精灵图格子同比例）透明画布：水平居中、脚底贴底
  5. act_*.png 直接输出；walk_0..3 合成 walk.png（1 行 × 4 列，每格 416x520）
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

CANVAS_W, CANVAS_H = 832, 1040          # 单图统一画布（4:5）
WALK_CELL_W, WALK_CELL_H = 416, 520     # 走路合图单格
ACTIONS = ["stretch", "yawn", "think", "jump", "shake", "stomp", "pout", "spin"]


def remove_bg(img: Image.Image, tol: int) -> Image.Image:
    """floodfill 从四角抠白底，返回 RGBA 透明图。"""
    rgb = img.convert("RGB")
    # 四角采样背景色，先铺一层接近色便于 floodfill 连通
    marker = (255, 0, 255)
    for corner in [(0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)]:
        ImageDraw.floodfill(rgb, corner, marker, thresh=tol)
    arr = np.array(rgb.convert("RGBA"))
    bg_mask = (arr[:, :, 0] == 255) & (arr[:, :, 1] == 0) & (arr[:, :, 2] == 255)
    # 膨胀背景 1px：吃掉角色轮廓外的抗alias白边
    dil = bg_mask.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        dil |= np.roll(np.roll(bg_mask, dy, axis=0), dx, axis=1)
    arr[dil, 3] = 0
    return Image.fromarray(arr, "RGBA")


def fit_canvas(img: Image.Image, cw: int, ch: int) -> Image.Image:
    """裁剪包围盒 → 等比缩放 → 水平居中、脚底贴底放入透明画布。"""
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    scale = min(cw / img.width, ch / img.height)
    nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.paste(img, ((cw - nw) // 2, ch - nh), img)
    return canvas


# ---------- --build 模式：散图源库 → 主题合图 ----------

FRAME_NAMES = ["frame_calm", "frame_smile", "frame_surprised", "frame_coax",
               "frame_angry", "frame_happy", "frame_crying", "frame_calmalt",
               "frame_leansleep", "frame_leansmile"]
PEEK_SIDES = ["left", "right", "top"]


def load_any(source: Path, stem: str, tol: int):
    """按 stem 找 .png/.jpg；非 RGBA 的自动抠白底。找不到返回 None。"""
    for ext in (".png", ".jpg"):
        p = source / (stem + ext)
        if p.exists():
            im = Image.open(p).convert("RGBA") if p.suffix == ".png" else Image.open(p)
            if im.mode != "RGBA":
                im = remove_bg(im, tol)
            return im
    return None


def grid_sheet(frames, cols: int, rows: int) -> Image.Image:
    """把帧列表按 cols×rows 行优先拼合图；None 格子留空；格尺寸取最大包围盒。"""
    sized = [f for f in frames if f is not None]
    bboxes = [f.getbbox() or (0, 0, f.width, f.height) for f in sized]
    cw = max(b[2] - b[0] for b in bboxes)
    ch = max(b[3] - b[1] for b in bboxes)
    sheet = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        if f is None:
            continue
        cell = fit_canvas(f, cw, ch)
        sheet.paste(cell, ((i % cols) * cw, (i // cols) * ch), cell)
    return sheet


def shifted(img: Image.Image, dx: int, dy: int) -> Image.Image:
    """前景帧派生：整图平移，越界裁掉（形成探出/缩回动效）。"""
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (dx, dy), img)
    return out


def build_theme(source: Path, theme: Path, tol: int) -> int:
    theme.mkdir(parents=True, exist_ok=True)

    # sprite.png 4x3（10 帧 + 2 空格）
    frames = [load_any(source, n, tol) for n in FRAME_NAMES]
    if any(frames):
        sheet = grid_sheet(frames + [None, None], 4, 3)
        sheet.save(theme / "sprite.png")
        print(f"[ok] sprite.png  {sheet.size}")

    # lean.png 1x2（优先 lean0/1，回退 frame_leansleep/leansmile）
    lean = [load_any(source, f"lean{i}", tol) or frames[8 + i] for i in range(2)]
    if any(lean):
        sheet = grid_sheet(lean, 2, 1)
        sheet.save(theme / "lean.png")
        print(f"[ok] lean.png  {sheet.size}")

    # peek.png 3x2：行0 基础帧，行1 前景帧（基础帧平移派生）
    bases = [load_any(source, f"peek_{s}", tol) for s in PEEK_SIDES]
    if any(bases):
        sized = [b for b in bases if b is not None]
        cw = max(b.width for b in sized)
        shift = max(16, round(cw * 0.05))
        fgs = [None, None, None]
        if bases[0]:
            fgs[0] = shifted(bases[0], shift, 0)    # 左缘：向右移
        if bases[1]:
            fgs[1] = shifted(bases[1], -shift, 0)   # 右缘：向左移
        if bases[2]:
            fgs[2] = shifted(bases[2], 0, shift)    # 顶部：向下移
        sheet = grid_sheet(bases + fgs, 3, 2)
        sheet.save(theme / "peek.png")
        print(f"[ok] peek.png  {sheet.size}")

    # actions.png 4x2
    acts = [load_any(source, f"act_{n}", tol) for n in ACTIONS]
    if any(acts):
        sheet = grid_sheet(acts, 4, 2)
        sheet.save(theme / "actions.png")
        print(f"[ok] actions.png  {sheet.size}")

    # walk.png 1x4（可选）
    walks = [load_any(source, f"walk_{i}", tol) for i in range(4)]
    if all(walks):
        sheet = grid_sheet(walks, 4, 1)
        sheet.save(theme / "walk.png")
        print(f"[ok] walk.png  {sheet.size}")

    print(f"[done] 主题合图 → {theme}")
    return 0


def sync_theme(out: Path, theme: Path) -> int:
    """把内置散图 act_*.png 拼成 actions.png（4x2）、walk.png 同步进主题目录，保持两套素材一致。"""
    theme.mkdir(parents=True, exist_ok=True)
    acts = [Image.open(out / f"act_{n}.png") for n in ACTIONS]
    cw = max(i.width for i in acts)
    ch = max(i.height for i in acts)
    sheet = Image.new("RGBA", (cw * 4, ch * 2), (0, 0, 0, 0))
    for i, im in enumerate(acts):
        sheet.paste(im, ((i % 4) * cw, (i // 4) * ch), im)
    sheet.save(theme / "actions.png")
    print(f"[ok] {theme / 'actions.png'}  {sheet.size}")

    walk_src = out / "walk.png"
    if walk_src.exists():
        walk = Image.open(walk_src)
        walk.save(theme / "walk.png")
        print(f"[ok] {theme / 'walk.png'}  {walk.size}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tol", type=int, default=14, help="floodfill 容差")
    ap.add_argument("--raw", default="resources/_gen/raw")
    ap.add_argument("--out", default="src/renderer/public/assets")
    ap.add_argument("--sync-theme", action="store_true", help="仅把内置散图同步拼进主题目录")
    ap.add_argument("--build", action="store_true", help="从散图源库拼出主题合图（sprite/lean/peek/actions/walk）")
    ap.add_argument("--theme", default="resources/_themes/银月默认")
    ap.add_argument("--source", default="resources/_gen/source", help="统一源库输出目录（散图单帧归档）")
    args = ap.parse_args()

    if args.sync_theme:
        return sync_theme(Path(args.out), Path(args.theme))

    if args.build:
        return build_theme(Path(args.source), Path(args.theme), args.tol)

    raw, out = Path(args.raw), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    processed = []
    # B 类动作 8 张
    for name in ACTIONS:
        src = raw / f"act_{name}.jpg"
        if not src.exists():
            print(f"[skip] 缺少 {src}")
            continue
        img = fit_canvas(remove_bg(Image.open(src), args.tol), CANVAS_W, CANVAS_H)
        dst = out / f"act_{name}.png"
        img.save(dst)
        processed.append(dst.name)
        print(f"[ok] {dst.name}  {img.size}")

    # 走路 4 帧 → walk.png 合图（1x4）
    walk_frames = []
    for i in range(4):
        src = raw / f"walk_{i}.jpg"
        if not src.exists():
            print(f"[skip] 缺少 {src}")
            continue
        walk_frames.append(fit_canvas(remove_bg(Image.open(src), args.tol), WALK_CELL_W, WALK_CELL_H))
    if len(walk_frames) == 4:
        sheet = Image.new("RGBA", (WALK_CELL_W * 4, WALK_CELL_H), (0, 0, 0, 0))
        for i, f in enumerate(walk_frames):
            sheet.paste(f, (i * WALK_CELL_W, 0), f)
        dst = out / "walk.png"
        sheet.save(dst)
        processed.append(dst.name)
        print(f"[ok] {dst.name}  {sheet.size}")
    else:
        print("[warn] walk 帧不足 4 张，未生成 walk.png")

    # 统一源库：散图单帧（832x1040 透明）归档到 source/，作为统一采集库
    source = Path(args.source)
    source.mkdir(parents=True, exist_ok=True)
    for name in ACTIONS:
        src = out / f"act_{name}.png"
        if src.exists():
            Image.open(src).save(source / f"act_{name}.png")
    for i, f in enumerate(walk_frames):
        f.save(source / f"walk_{i}.png")
    print(f"[ok] 统一源库 → {source}（{len(ACTIONS) + len(walk_frames)} 张散图）")

    print(f"完成 {len(processed)} 个文件 → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
