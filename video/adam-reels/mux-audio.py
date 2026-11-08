"""Attach the unchanged narration/SFX mixes to the revised full Remotion picture."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / '.run-local' / 'reels-python'))
import imageio_ffmpeg

out = ROOT / 'out'
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
for audio_source, target in [('adam-reels-final.mp4', 'adam-reels-v4.mp4'),
                              ('adam-reels-no-music-final.mp4', 'adam-reels-no-music-v4.mp4')]:
    subprocess.run([ffmpeg, '-y', '-loglevel', 'error',
                    '-i', str(out / 'adam-reels-v4-picture.mp4'),
                    '-i', str(out / audio_source),
                    '-map', '0:v:0', '-map', '1:a:0',
                    '-c', 'copy', '-movflags', '+faststart', str(out / target)], check=True)
    print('Saved', target, flush=True)
