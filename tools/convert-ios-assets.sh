#!/usr/bin/env bash
# Copies and converts the iPhone app's pictures, clips and data into the web
# repo, web-friendly, at the paths the web code uses. Re-runnable: an output
# newer than its source is left alone (FORCE=1 redoes everything).
#
#   tools/convert-ios-assets.sh            # everything
#   tools/convert-ios-assets.sh images     # games, glyphs, emblems, chars, data, manifest
#   tools/convert-ios-assets.sh clips      # pose clips (.webm VP9 alpha + original .mov), manifest
#
# Reads the iOS repo READ ONLY (IOS=... to point elsewhere). Writes:
#   app/img/games/<name>.webp        every Assets.xcassets/Games/* (alpha kept)
#   app/img/glyphs/<name>.png        Glyphs/glyph-* template PNGs (use as CSS mask-image)
#   app/img/emblems/rank-N.webp      Emblems/rank-0..6
#   app/img/chars/char-NN.webp       portraits
#   app/img/chars/char-NN-<pose>.webp  pose stills, the iOS `-mask` baked into the alpha
#                                    (iOS: Image(name).mask { Image(name + "-mask") } = mask's alpha)
#   app/img/clips/char-NN-<clip>.webm  VP9 + alpha (Chrome/Firefox/Edge)
#   app/img/clips/char-NN-<clip>.mov   the original HEVC + alpha (Safari)
#   data/girl-names.txt, data/pool.json  verbatim copies
#   app/img/manifest.json            what exists
# Not copied: AppIcon, LaunchWordmark, AccentColor (the web has its own).
set -euo pipefail

IOS="${IOS:-/Users/arnkeenan/Developer/songspot-ios/songspot}"
WEB="$(cd "$(dirname "$0")/.." && pwd)"
FFMPEG="${FFMPEG:-/opt/homebrew/bin/ffmpeg}"
CWEBP="${CWEBP:-$(command -v cwebp || echo /opt/homebrew/bin/cwebp)}"
PY="${PY:-python3}"
JOBS="${JOBS:-4}"
FORCE="${FORCE:-0}"
XC="$IOS/Assets.xcassets"
IMG="$WEB/app/img"
WHAT="${1:-all}"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/ss-assets.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

[ -d "$XC" ] || { echo "no iOS asset catalogue at $XC" >&2; exit 1; }
mkdir -p "$IMG/games" "$IMG/glyphs" "$IMG/emblems" "$IMG/chars" "$IMG/clips" "$WEB/data"

# out is up to date with src?
fresh() { [ "$FORCE" != 1 ] && [ -f "$1" ] && [ "$1" -nt "$2" ]; }

# The biggest file of an imageset, by the scale in its Contents.json
# (falls back to the only/largest image file in the folder).
largest() {
  "$PY" - "$1" <<'EOF'
import json, os, sys
d = sys.argv[1]
best, bs = None, -1
try:
    for im in json.load(open(os.path.join(d, 'Contents.json'))).get('images', []):
        f = im.get('filename')
        if not f or not os.path.exists(os.path.join(d, f)): continue
        s = float(str(im.get('scale', '1x')).rstrip('x') or 1)
        if s > bs: best, bs = f, s
except Exception:
    pass
if not best:
    fs = [f for f in os.listdir(d) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    fs.sort(key=lambda f: os.path.getsize(os.path.join(d, f)))
    best = fs[-1] if fs else ''
print(os.path.join(d, best) if best else '')
EOF
}

# Width/height and whether it has an alpha channel: "w h alpha(0/1)".
probe() {
  "$PY" -c 'import sys
from PIL import Image
im = Image.open(sys.argv[1]); print(im.size[0], im.size[1], int("A" in im.getbands() or "transparency" in im.info))' "$1"
}

webp() { # src out quality
  "$CWEBP" -quiet -m 6 -q "$3" -alpha_q 100 -metadata none "$1" -o "$2"
}

images() {
  local d n src out q w h a
  echo "== games"
  for d in "$XC"/Games/*.imageset; do
    n="$(basename "$d" .imageset)"; src="$(largest "$d")"; out="$IMG/games/$n.webp"
    [ -n "$src" ] || continue
    fresh "$out" "$src" && continue
    read -r w h a < <(probe "$src")
    # 3D icons (alpha, up to 512 px): q85; heroes / banners / party crews: q80, own size.
    if [ "$a" = 1 ] && [ "$w" -le 512 ]; then q=85; else q=80; fi
    webp "$src" "$out" "$q"
  done

  echo "== glyphs"
  for d in "$XC"/Glyphs/*.imageset; do
    n="$(basename "$d" .imageset)"; src="$(largest "$d")"; out="$IMG/glyphs/$n.png"
    [ -n "$src" ] || continue
    fresh "$out" "$src" && continue
    cp "$src" "$out"
  done

  echo "== emblems"
  for d in "$XC"/Emblems/*.imageset; do
    n="$(basename "$d" .imageset)"; src="$(largest "$d")"; out="$IMG/emblems/$n.webp"
    [ -n "$src" ] || continue
    fresh "$out" "$src" && continue
    webp "$src" "$out" 85
  done

  echo "== characters"
  for d in "$XC"/Characters/*.imageset; do
    n="$(basename "$d" .imageset)"
    case "$n" in *-mask) continue ;; esac
    src="$(largest "$d")"; out="$IMG/chars/$n.webp"
    [ -n "$src" ] || continue
    local mdir="$XC/Characters/$n-mask.imageset"
    if [ -d "$mdir" ]; then
      # A pose: colour picture through its mask's alpha, baked into one RGBA picture.
      local mask; mask="$(largest "$mdir")"
      if fresh "$out" "$src" && [ "$out" -nt "$mask" ]; then continue; fi
      "$PY" - "$src" "$mask" "$TMP/$n.png" <<'EOF'
import sys
from PIL import Image
src, mask, out = sys.argv[1:4]
im = Image.open(src).convert('RGB')
m = Image.open(mask)
# SwiftUI .mask uses the mask view's alpha; the masks are white LA PNGs.
a = m.getchannel('A') if 'A' in m.getbands() else m.convert('L')
if a.size != im.size:
    a = a.resize(im.size, Image.LANCZOS)
im.putalpha(a)
im.save(out)
EOF
      webp "$TMP/$n.png" "$out" 82
      rm -f "$TMP/$n.png"
    else
      fresh "$out" "$src" && continue
      webp "$src" "$out" 82
    fi
  done

  echo "== data"
  for f in girl-names.txt pool.json; do
    if [ -f "$IOS/Resources/$f" ] && ! cmp -s "$IOS/Resources/$f" "$WEB/data/$f"; then
      cp "$IOS/Resources/$f" "$WEB/data/$f"
    fi
  done
}

clip_one() { # src.mov -> webm + mov
  local src="$1" n out
  n="$(basename "$src" .mov)"; out="$IMG/clips/$n.webm"
  if ! fresh "$out" "$src"; then
    "$FFMPEG" -nostdin -v error -y -i "$src" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 34 \
      -row-mt 1 -r 30 -an "$TMP/$n.webm" && mv "$TMP/$n.webm" "$out"
  fi
  fresh "$IMG/clips/$n.mov" "$src" || cp "$src" "$IMG/clips/$n.mov"
}

clips() {
  echo "== clips"
  [ -d "$IOS/Resources/PoseClips" ] || return 0
  export -f clip_one fresh
  export FFMPEG IMG TMP FORCE
  find "$IOS/Resources/PoseClips" -maxdepth 1 -name '*.mov' -print0 | sort -z \
    | xargs -0 -n 1 -P "$JOBS" bash -c 'clip_one "$0"'
}

manifest() {
  "$PY" - "$IMG" <<'EOF'
import json, os, re, sys
img = sys.argv[1]
def names(sub, ext):
    p = os.path.join(img, sub)
    return sorted(f[:-len(ext)] for f in os.listdir(p) if f.endswith(ext)) if os.path.isdir(p) else []
chars, poses = set(), {}
for n in names('chars', '.webp'):
    m = re.fullmatch(r'char-(\d+)(?:-([a-z]+))?', n)
    if not m: continue
    i = int(m.group(1))
    if m.group(2): poses.setdefault(str(i), []).append(m.group(2))
    else: chars.add(i)
order = ['fight', 'dance', 'win', 'lose']
for k in poses: poses[k].sort(key=lambda p: (order.index(p) if p in order else 99, p))
webm, mov = set(names('clips', '.webm')), set(names('clips', '.mov'))
out = {
    'games': names('games', '.webp'),
    'glyphs': names('glyphs', '.png'),
    'emblems': names('emblems', '.webp'),
    'chars': sorted(chars),
    'poses': dict(sorted(poses.items(), key=lambda kv: int(kv[0]))),
    'clips': sorted(webm & mov),
}
with open(os.path.join(img, 'manifest.json'), 'w') as f:
    json.dump(out, f, separators=(',', ':'))
    f.write('\n')
print('manifest:', {k: len(v) for k, v in out.items()})
EOF
}

case "$WHAT" in
  images) images; manifest ;;
  clips) clips; manifest ;;
  all) images; manifest; clips; manifest ;;
  manifest) manifest ;;
  *) echo "usage: $0 [all|images|clips|manifest]" >&2; exit 2 ;;
esac
echo "done: $(du -sh "$IMG" | cut -f1) in app/img"
