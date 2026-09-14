"""Prepare the user-supplied cafe track; keep the original file untouched."""
import json
import sys
import wave
from pathlib import Path
import numpy as np

source, output = map(Path, sys.argv[1:3])
with wave.open(str(source), 'rb') as reader:
    params = reader.getparams()
    assert params.sampwidth == 2 and params.nchannels == 2, 'Expected stereo PCM16 WAV'
    samples = np.frombuffer(reader.readframes(params.nframes), dtype='<i2').reshape(-1, 2).astype(np.float64) / 32768
rms = float(np.sqrt(np.mean(samples ** 2)))
peak = float(np.max(np.abs(samples)))
gain = min(1, 0.10 / max(rms, 1e-9), 0.85 / max(peak, 1e-9))
samples *= gain
# Keep the musical ending; soften repetition without overlapping unrelated phrases.
for seconds, start in [(0.35, True), (2.0, False)]:
    count = min(round(seconds * params.framerate), len(samples) // 2)
    ramp = np.sin(np.linspace(0, np.pi / 2, count)) ** 2
    if start:
        samples[:count] *= ramp[:, None]
    else:
        samples[-count:] *= ramp[::-1, None]
pcm = np.rint(samples * 32767).astype('<i2')
assert not pcm[0].any() and not pcm[-1].any()
assert np.max(np.abs(samples)) < 0.86
output.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(output), 'wb') as writer:
    writer.setparams(params)
    writer.writeframes(pcm.tobytes())
print(json.dumps({'seconds': params.nframes / params.framerate, 'sampleRate': params.framerate, 'gainDb': round(20 * np.log10(gain), 2), 'peakDbfs': round(20 * np.log10(np.max(np.abs(samples))), 2), 'fadeInSeconds': 0.35, 'fadeOutSeconds': 2.0}))
