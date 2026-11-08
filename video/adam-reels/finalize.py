"""Assemble the corrected Remotion scene with the unchanged shots and original audio."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / '.run-local' / 'reels-python'))
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
OUT = ROOT / 'out'
FILTER = ('[0:v]trim=start_frame=0:end_frame=150,setpts=PTS-STARTPTS[a];'
          '[1:v]setpts=PTS-STARTPTS[b];'
          '[0:v]trim=start_frame=270:end_frame=930,setpts=PTS-STARTPTS[c];'
          '[a][b][c]concat=n=3:v=1:a=0[v]')
for source, target in [('adam-reels-v3.mp4', 'adam-reels-final.mp4'),
                       ('adam-reels-no-music-v3.mp4', 'adam-reels-no-music-final.mp4')]:
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error',
                    '-i', str(OUT / source), '-i', str(OUT / 'audio-corrected.mp4'),
                    '-filter_complex', FILTER, '-map', '[v]', '-map', '0:a:0',
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                    '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart',
                    str(OUT / target)], check=True)
    print('Saved', target, flush=True)
