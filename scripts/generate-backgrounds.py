"""Generate original periodic background loops locally using shaped noise."""
from pathlib import Path
import json
import wave
import numpy as np

root = Path(__file__).resolve().parents[1]
rate, seconds = 32000, 32
count = rate * seconds
frequency = np.fft.rfftfreq(count, 1 / rate)
time = np.arange(count) / rate
rng = np.random.default_rng(20260912)
reports = []
for name, exponent in [('brown', 2), ('pink', 1), ('ocean', 1)]:
    channels = []
    for channel in range(2):
        spectrum = rng.normal(size=len(frequency)) + 1j * rng.normal(size=len(frequency))
        shape = np.maximum(frequency, 20) ** (-exponent / 2)
        shape *= frequency / np.sqrt(frequency ** 2 + 20 ** 2)
        shape /= np.sqrt(1 + (frequency / (3000 if name == 'ocean' else 6500)) ** 4)
        samples = np.fft.irfft(spectrum * shape, n=count)
        samples -= samples.mean()
        samples /= np.sqrt(np.mean(samples ** 2))
        if name == 'ocean':
            # Periods divide the loop length so the surf swells continue on repeat.
            swell = (0.5 + 0.5 * np.sin(2 * np.pi * time / 8 + channel * 0.13)) ** 1.6
            samples *= 0.3 + 0.7 * swell
        channels.append(samples)
    audio = np.stack(channels, axis=1)
    audio *= min(0.14 / np.sqrt(np.mean(audio ** 2)), 0.75 / np.max(np.abs(audio)))
    pcm = np.rint(audio * 32767).astype('<i2')
    target = root / 'src/ui/assets/music' / f'{name}.wav'
    with wave.open(str(target), 'wb') as writer:
        writer.setnchannels(2); writer.setsampwidth(2); writer.setframerate(rate)
        writer.writeframes(pcm.tobytes())
    # Check the generated audio, including seam continuity and noise spectrum.
    differences = np.diff(audio, axis=0)
    seam = float(np.max(np.abs(audio[0] - audio[-1])))
    assert seam < 8 * np.sqrt(np.mean(differences ** 2))
    power = np.abs(np.fft.rfft(audio[:, 0])) ** 2
    bins = np.geomspace(100, 3000, 30)
    means = [power[(frequency >= a) & (frequency < b)].mean() for a, b in zip(bins[:-1], bins[1:])]
    slope = float(np.polyfit(np.log(np.sqrt(bins[:-1] * bins[1:])), np.log(means), 1)[0])
    if name != 'ocean':
        assert abs(slope + exponent) < 0.2
    reports.append({'name': name, 'seconds': seconds, 'rms': float(np.sqrt(np.mean(audio ** 2))), 'peak': float(np.max(np.abs(audio))), 'spectralSlope': slope, 'seamStep': seam})
(root / 'artifacts/background-audio-results.json').write_text(json.dumps(reports, indent=2))
print(json.dumps(reports))
