#!/usr/bin/env bash
# 生成"打码版"。为什么单独一个 sh：这条链路全是 ImageMagick 命令行，塞进 node 里更难读。
#
# 关键设计：马赛克是**真的把像素压掉了**，不是 CSS filter:blur()。
# 原因很直白 —— CSS 模糊只要 F12 改一行样式就还原了，那叫自欺欺人，不叫保护。
# 原始图留在 ui/photos/（已 gitignore），仓库里只出现打码图。
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=ui/photos
OUT=ui/images/gated
MANIFEST=ui/images/gated.json
mkdir -p "$SRC" "$OUT"

if [ ! -d "$SRC" ] || [ -z "$(ls -A "$SRC" 2>/dev/null)" ]; then
  echo "[blur] $SRC 为空，跳过（gated 图位会退化成占位块）"
  exit 0
fi

: > "$MANIFEST.tmp"
shopt -s nullglob
for f in "$SRC"/*.{jpg,jpeg,png,webp}; do
  name=$(basename "$f"); stem="${name%.*}"; ext="${name##*.}"
  # 先脱掉 EXIF/GPS/设备信息，再降采样做马赛克，最后补一层高斯糊掉马赛克块边界
  convert "$f" -auto-orient -strip -resize 1600x1200^ -gravity center -extent 1600x1200 \
    -filter point -resize 2%! -resize 1600x1200! -blur 0x7 -modulate 100,72 \
    "$OUT/$stem.png"
  # 小尺寸封面：列表页用同一套马赛克，不给未解锁状态留"缩略图反而是清晰的"这种漏洞
  convert "$OUT/$stem.png" -resize 480x360 "$OUT/$stem.thumb.png"
  sha=$(sha256sum "$f" | cut -c1-16)
  size=$(identify -format "%wx%h" "$OUT/$stem.png")
  printf '%s\t%s\t%s\t%s\n' "$stem" "$ext" "$size" "$sha" >> "$MANIFEST.tmp"
  echo "[blur] $stem  ($size)  sha256:${sha:0:12}…"
done
shopt -u nullglob

node -e '
const fs=require("fs");
const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").filter(Boolean).map(l=>{
  const [stem,ext,size,sha]=l.split("\t");
  return [stem,{raw:`ui/photos/${stem}.${ext}`,blur:`assets/images/gated/${stem}.png`,thumb:`assets/images/gated/${stem}.thumb.png`,size,sha256:sha}];
});
fs.writeFileSync(process.argv[2],JSON.stringify(Object.fromEntries(rows),null,2)+"\n");
console.log("[blur] manifest:",rows.length,"张");
' "$MANIFEST.tmp" "$MANIFEST"
rm -f "$MANIFEST.tmp"
echo "[blur] 注意：源图只在本地。真要公开，请确认图本身不会被搜索引擎抓到（见 privacy 页 §3）。"
