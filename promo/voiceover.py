"""Adds a voiceover to a rendered promo film.

    python3 promo/voiceover.py hotels   -> promo/out/cabadra-hotels-voiceover.mp4
    python3 promo/voiceover.py partners
    python3 promo/voiceover.py hotels --hindi  -> promo/out/cabadra-hotels-voiceover-hindi.mp4

Lines and their timings are in promo/voiceover.json ("at" = start, "until" = the
latest it may end, in seconds). A line that runs long is re-spoken a little faster
(up to 1.3x); if it still doesn't fit, shorten the text.

Speech is Kokoro (open-source, runs locally): pip install kokoro-onnx soundfile,
and point KOKORO_DIR at a folder holding kokoro-v1.0.onnx (as kokoro.onnx) and
voices-v1.0.bin (as voices.bin) from github.com/thewh1teagle/kokoro-onnx releases.
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

here = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1]
hindi_film = '--hindi' in sys.argv[2:]
cfg = json.load(open(os.path.join(here, 'voiceover.json')))
if hindi_film:
    cfg = {'voice': cfg['hindi']['voice'], 'hindi_voice': cfg['hindi']['voice'], 'films': cfg['hindi']['films']}
lines = cfg['films'][name]
suffix = '-hindi' if hindi_film else ''
model_dir = os.environ.get('KOKORO_DIR', here)
tts = Kokoro(os.path.join(model_dir, 'kokoro.onnx'), os.path.join(model_dir, 'voices.bin'))

video = os.path.join(here, 'out', f'cabadra-{name}.mp4')
duration = float(subprocess.check_output(
    ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]))
SR = 24000
track = np.zeros(int((duration + 0.5) * SR), dtype=np.float32)


def trim(a, threshold=0.01):
    idx = np.where(np.abs(a) > threshold)[0]
    return a[max(idx[0] - 240, 0): idx[-1] + 2400] if len(idx) else a


for line in lines:
    hindi = hindi_film or line.get('lang') == 'hi'
    voice = cfg['hindi_voice'] if hindi else cfg['voice']
    lang = 'hi' if hindi else 'en-us'
    window = line['until'] - line['at']
    speed = 1.0
    while True:
        audio, sr = tts.create(line['text'], voice=voice, speed=speed, lang=lang)
        audio = trim(audio)
        length = len(audio) / sr
        if length <= window or speed >= 1.3:
            break
        speed = round(speed + 0.05, 2)
    flag = '' if length <= window else '  <-- TOO LONG, shorten this line'
    print(f"{line['at']:5.1f}s  {length:4.1f}s/{window:4.1f}s  x{speed:.2f}  {line['text']}{flag}")
    start = int(line['at'] * SR)
    end = min(start + len(audio), len(track))
    track[start:end] += audio[: end - start]

peak = np.max(np.abs(track)) or 1.0
track = track / peak * 0.89  # about -1 dBFS
wav = os.path.join(here, 'out', f'{name}-voiceover{suffix}.wav')
sf.write(wav, track, SR)

out = os.path.join(here, 'out', f'cabadra-{name}-voiceover{suffix}.mp4')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-i', wav,
                '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                '-af', 'highpass=f=70,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,loudnorm=I=-16:TP=-1.5',
                '-shortest', '-movflags', '+faststart', out], check=True)
print(out)
