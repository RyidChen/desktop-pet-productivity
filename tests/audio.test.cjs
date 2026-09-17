const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const MoriAudio = vm.runInNewContext(fs.readFileSync(require.resolve('../src/ui/audio.js'), 'utf8') + '\nMoriAudio;');

test('music modes persist and next track wraps or avoids immediate shuffle repeats', () => {
  const { FocusModel } = require('../src/model.cjs');
  assert.equal(new FocusModel().settings.musicMode, 'repeat');
  for (const value of ['repeat', 'shuffle', 'sequence']) {
    const model = new FocusModel(); model.dispatch('audioSettings', { key: 'musicMode', value });
    assert.equal(new FocusModel(model.snapshot()).settings.musicMode, value);
  }
  assert.throws(() => new FocusModel().dispatch('audioSettings', { key: 'musicMode', value: 'bad' }));
  const tracks = ['builtin', 'cafe', 'reading'];
  assert.equal(MoriAudio.nextTrack('reading', 'sequence', tracks), 'builtin');
  assert.equal(MoriAudio.nextTrack('cafe', 'repeat', tracks), 'cafe');
  assert.equal(MoriAudio.nextTrack('cafe', 'shuffle', tracks, () => 0), 'builtin');
  assert.equal(MoriAudio.nextTrack('cafe', 'shuffle', tracks, () => 0.99), 'reading');
  assert.equal(MoriAudio.nextTrack('cafe', 'shuffle', ['cafe']), 'cafe');
});

test('mode changes keep the current node and manual stop never advances', async () => {
  const audio = new MoriAudio(); audio.prime = async () => {}; audio.compose = async () => ({});
  let ended = 0; audio.onMusicEnded = () => { ended++; };
  audio.context = { createBufferSource: () => ({ connect() {}, disconnect() {}, start() {}, stop() { this.onended?.(); } }) };
  await audio.playMusic('builtin'); const node = audio.musicNode;
  audio.setMusicMode('sequence'); assert.equal(audio.musicNode, node); assert.equal(node.loop, false);
  audio.setMusicMode('repeat'); assert.equal(node.loop, true);
  audio.stopMusic(); assert.equal(ended, 0);
  await audio.playMusic('builtin'); audio.setMusicMode('sequence');
  audio.musicNode.onended(); assert.equal(ended, 1); assert.equal(audio.musicNode, null);
});

test('finishing before audio resumes cancels pending rain playback', async () => {
  const audio = new MoriAudio();
  let resume;
  audio.prime = () => new Promise(resolve => { resume = resolve; });
  const playing = audio.toggleRain();
  audio.stopRain();
  resume();
  await playing;
  assert.equal(audio.rainNode, null);
});

test('background selection validates and restores, old data keeps rain', () => {
  const { FocusModel } = require('../src/model.cjs');
  assert.equal(new FocusModel().settings.backgroundSource, 'rain');
  for (const value of ['rain', 'brown', 'pink', 'ocean']) {
    const model = new FocusModel(); model.dispatch('audioSettings', { key: 'backgroundSource', value });
    assert.equal(new FocusModel(model.snapshot()).settings.backgroundSource, value);
  }
  assert.throws(() => new FocusModel().dispatch('audioSettings', { key: 'backgroundSource', value: '../file' }));
});

test('stopping during background download prevents delayed sound', async () => {
  let finish, markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const Audio = vm.runInNewContext(fs.readFileSync(require.resolve('../src/ui/audio.js'), 'utf8') + '\nMoriAudio;', {
    fetch: () => new Promise(resolve => { finish = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); markStarted(); }),
  });
  const audio = new Audio(); audio.prime = async () => {};
  audio.context = { decodeAudioData: async () => ({}), createBufferSource: () => { throw new Error('background must stay stopped'); } };
  const loading = audio.toggleRain('ocean'); await started; audio.stopRain(); finish(); await loading;
  assert.equal(audio.rainNode, null);
});

test('cafe selection persists independently of an imported music path', () => {
  const { FocusModel } = require('../src/model.cjs');
  const model = new FocusModel();
  model.dispatch('audioSettings', { key: 'musicSource', value: 'cafe' });
  const restored = new FocusModel(model.snapshot());
  assert.equal(restored.settings.musicSource, 'cafe');
  assert.equal(restored.settings.musicPath, '');
});

test('all new tracks persist and reject unknown music sources', () => {
  const { FocusModel } = require('../src/model.cjs');
  for (const musicSource of ['reading', 'night', 'forest', 'station', 'seaside', 'garden', 'greenhouse', 'clouds', 'maple', 'space', 'bamboo']) {
    const model = new FocusModel();
    model.dispatch('audioSettings', { key: 'musicSource', value: musicSource });
    assert.equal(new FocusModel(model.snapshot()).settings.musicSource, musicSource);
    assert.throws(() => model.dispatch('audioSettings', { key: 'musicSource', value: '../unknown' }));
  }
});

test('track preparation bounds volume and fades both ends without changing duration', () => {
  const samples = [new Float32Array(1000).fill(0.9), new Float32Array(1000).fill(-0.9)];
  const buffer = { numberOfChannels: 2, length: 1000, sampleRate: 100, getChannelData: c => samples[c] };
  new MoriAudio().prepareTrack(buffer);
  for (const channel of samples) {
    assert.equal(Math.abs(channel[0]), 0);
    assert.equal(Math.abs(channel.at(-1)), 0);
    assert.ok(Math.abs(channel[500]) <= 0.101);
    assert.equal(channel.length, 1000);
  }
});

test('stopping while cafe audio loads prevents late playback', async () => {
  let finishDownload;
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const Audio = vm.runInNewContext(fs.readFileSync(require.resolve('../src/ui/audio.js'), 'utf8') + '\nMoriAudio;', {
    fetch: () => new Promise(resolve => { finishDownload = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); markStarted(); }),
  });
  const audio = new Audio();
  audio.prime = async () => {};
  audio.context = { decodeAudioData: async () => ({}), createBufferSource: () => { throw new Error('must not start after stop'); } };
  const loading = audio.playMusic('cafe', '');
  await started;
  assert.equal(typeof finishDownload, 'function');
  audio.stopMusic(); finishDownload(); await loading;
  assert.equal(audio.musicNode, null);
});
