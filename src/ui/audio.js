class MoriAudio {
  constructor() {
    this.context = null;
    this.musicNode = null;
    this.rainNode = null;
    this.musicGain = null;
    this.rainGain = null;
    this.builtinBuffer = null;
    this.trackBuffer = null;
    this.trackSource = '';
    this.localBuffer = null;
    this.localPath = '';
    this.musicRequest = 0;
    this.musicMode = 'repeat';
    this.rainRequest = 0;
    this.backgroundBuffer = null;
    this.backgroundSource = '';
    this.volumes = { musicVolume: 0.45, rainVolume: 0.3 };
  }
  async prime() {
    if (!this.context) {
      this.context = new AudioContext();
      this.musicGain = this.context.createGain();
      this.rainGain = this.context.createGain();
      this.musicGain.connect(this.context.destination);
      this.rainGain.connect(this.context.destination);
      this.setVolumes(this.volumes);
    }
    if (this.context.state !== 'running') await this.context.resume();
  }
  setVolumes(settings) {
    this.volumes = { musicVolume: settings.musicVolume, rainVolume: settings.rainVolume };
    if (!this.context) return;
    this.musicGain.gain.setTargetAtTime(settings.musicVolume * 0.65, this.context.currentTime, 0.06);
    this.rainGain.gain.setTargetAtTime(settings.rainVolume * 0.4, this.context.currentTime, 0.06);
  }
  async compose() {
    if (this.builtinBuffer) return this.builtinBuffer;
    const rate = 32000, length = 32;
    const offline = new OfflineAudioContext(2, rate * length, rate);
    const master = offline.createGain();
    master.gain.value = 0.45;
    const compressor = offline.createDynamicsCompressor();
    master.connect(compressor).connect(offline.destination);
    const delay = offline.createDelay(2);
    const feedback = offline.createGain();
    delay.delayTime.value = 0.375; feedback.gain.value = 0.16;
    master.connect(delay); delay.connect(feedback); feedback.connect(delay); feedback.connect(offline.destination);
    const note = (midi, time, duration, gain, type = 'sine', pan = 0) => {
      const oscillator = offline.createOscillator();
      const envelope = offline.createGain();
      const stereo = offline.createStereoPanner();
      oscillator.type = type; oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      stereo.pan.value = pan;
      envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(gain, time + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      oscillator.connect(envelope).connect(stereo).connect(master);
      oscillator.start(time); oscillator.stop(time + duration + 0.02);
    };
    // Original 8-bar progression, with soft electric-piano overtones and sparse melody.
    const chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 57, 59]];
    const melody = [76, 79, 74, 72, 71, 74, 72, 67];
    for (let bar = 0; bar < 8; bar++) {
      const time = bar * 4;
      const chord = chords[bar % 4];
      note(chord[0] - 12, time, 2.8, 0.14);
      chord.forEach((pitch, i) => { note(pitch, time + i * 0.045, 3.2, 0.11, 'sine', (i - 1.5) * 0.25); note(pitch + 12, time + i * 0.045, 0.75, 0.022); });
      note(melody[bar], time + 1.5, 1.45, 0.11, 'sine', 0.22);
      note(melody[(bar + 3) % 8], time + 2.75, 1.1, 0.065, 'sine', -0.22);
    }
    this.builtinBuffer = await offline.startRendering();
    // Feather both ends so loop boundaries never click.
    for (let c = 0; c < this.builtinBuffer.numberOfChannels; c++) {
      const samples = this.builtinBuffer.getChannelData(c);
      for (let i = 0; i < rate / 20; i++) { samples[i] *= i / (rate / 20); samples[samples.length - 1 - i] *= i / (rate / 20); }
    }
    return this.builtinBuffer;
  }
  stopMusic() {
    this.musicRequest++;
    if (this.musicNode) { this.musicNode.onended = null; this.musicNode.stop(); this.musicNode.disconnect(); this.musicNode = null; }
  }
  setMusicMode(mode) {
    this.musicMode = mode;
    if (this.musicNode) this.musicNode.loop = mode === 'repeat';
  }
  static nextTrack(current, mode, tracks, random = Math.random) {
    if (!tracks.length) return null;
    if (mode === 'repeat') return tracks.includes(current) ? current : tracks[0];
    if (mode === 'shuffle') {
      const candidates = tracks.filter(track => track !== current);
      return candidates.length ? candidates[Math.floor(random() * candidates.length)] : tracks[0];
    }
    return tracks[(tracks.indexOf(current) + 1) % tracks.length];
  }
  async playMusic(source, filePath) {
    this.stopMusic();
    const request = this.musicRequest;
    await this.prime();
    let buffer;
    if (source === 'local') {
      if (!this.localBuffer || this.localPath !== filePath) {
        const result = await window.mori.readMusic();
        if (!result.ok) throw new Error(result.error);
        try { this.localBuffer = await this.context.decodeAudioData(new Uint8Array(result.data).buffer); }
        catch { throw new Error('這個音樂檔無法播放，請換一個 MP3 或 WAV。'); }
        this.localPath = filePath;
      }
      buffer = this.localBuffer;
    } else if (['cafe', 'reading', 'night', 'forest', 'station', 'seaside', 'garden'].includes(source)) {
      if (!this.trackBuffer || this.trackSource !== source) {
        const files = { cafe: 'cafe-afternoon-glow.wav', reading: 'between-pages.mp3', night: 'night-lamp.mp3', forest: 'forest-walk.mp3', station: 'glow-station.mp3', seaside: 'seaside-holiday.mp3', garden: 'moonlit-garden.mp3' };
        const response = await fetch(`assets/music/${files[source]}`);
        if (!response.ok) throw new Error('這首音樂暫時無法載入，請改選其他音樂。');
        const decoded = await this.context.decodeAudioData(await response.arrayBuffer());
        if (request !== this.musicRequest) return;
        if (source !== 'cafe') this.prepareTrack(decoded);
        this.trackBuffer = decoded;
        this.trackSource = source;
      }
      buffer = this.trackBuffer;
    } else buffer = await this.compose();
    if (request !== this.musicRequest) return;
    this.musicNode = this.context.createBufferSource();
    this.musicNode.buffer = buffer;
    this.musicNode.loop = this.musicMode === 'repeat';
    const node = this.musicNode;
    node.onended = () => {
      if (request !== this.musicRequest || this.musicNode !== node) return;
      node.onended = null; node.disconnect(); this.musicNode = null;
      this.onMusicEnded?.(source, request);
    };
    this.musicNode.connect(this.musicGain);
    this.musicNode.start();
  }
  prepareTrack(buffer) {
    let energy = 0, peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      for (const sample of buffer.getChannelData(c)) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
    }
    const rms = Math.sqrt(energy / (buffer.length * buffer.numberOfChannels));
    const gain = Math.min(1, 0.10 / Math.max(rms, 1e-9), 0.85 / Math.max(peak, 1e-9));
    const fadeIn = Math.min(Math.round(buffer.sampleRate * 0.35), Math.floor(buffer.length / 2));
    const fadeOut = Math.min(Math.round(buffer.sampleRate * 2), Math.floor(buffer.length / 2));
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const samples = buffer.getChannelData(c);
      for (let i = 0; i < samples.length; i++) samples[i] *= gain;
      for (let i = 0; i < fadeIn; i++) samples[i] *= Math.sin(i / Math.max(1, fadeIn - 1) * Math.PI / 2) ** 2;
      for (let i = 0; i < fadeOut; i++) samples[samples.length - 1 - i] *= Math.sin(i / Math.max(1, fadeOut - 1) * Math.PI / 2) ** 2;
    }
  }
  stopRain() {
    this.rainRequest++;
    if (this.rainNode) { this.rainNode.stop(); this.rainNode.disconnect(); this.rainNode = null; }
  }
  async toggleRain(source = 'rain') {
    if (this.rainNode) { this.stopRain(); return; }
    const request = ++this.rainRequest;
    await this.prime();
    if (request !== this.rainRequest) return;
    let buffer;
    if (['brown', 'pink', 'ocean'].includes(source)) {
      if (!this.backgroundBuffer || this.backgroundSource !== source) {
        const response = await fetch(`assets/music/${source}.wav`);
        if (!response.ok) throw new Error('背景音暫時無法載入');
        const decoded = await this.context.decodeAudioData(await response.arrayBuffer());
        if (request !== this.rainRequest) return;
        this.backgroundBuffer = decoded; this.backgroundSource = source;
      }
      buffer = this.backgroundBuffer;
    } else {
    const rate = this.context.sampleRate;
    buffer = this.context.createBuffer(2, rate * 6, rate);
    for (let c = 0; c < 2; c++) {
      const samples = buffer.getChannelData(c);
      let brown = 0;
      for (let i = 0; i < samples.length; i++) {
        const white = Math.random() * 2 - 1;
        brown = (brown + white * 0.03) / 1.03;
        samples[i] = (brown * 2.7 + white * 0.11) * (0.82 + 0.18 * Math.sin(i / rate * Math.PI / 3));
      }
      for (let i = 0; i < 256; i++) { samples[i] *= i / 256; samples[samples.length - 1 - i] *= i / 256; }
    }
    }
    if (request !== this.rainRequest) return;
    this.rainNode = this.context.createBufferSource();
    this.rainNode.buffer = buffer; this.rainNode.loop = true;
    this.rainNode.connect(this.rainGain); this.rainNode.start();
  }
  async chime() {
    await this.prime();
    for (const [index, frequency] of [659.25, 783.99].entries()) {
      const start = this.context.currentTime + index * 0.18;
      const oscillator = this.context.createOscillator(), gain = this.context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(start); oscillator.stop(start + 1.02);
    }
  }
}
