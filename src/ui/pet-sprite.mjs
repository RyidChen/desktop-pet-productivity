const POSES = ['idle', 'blink', 'happy', 'held', 'read', 'sleep', 'stretch', 'wave'];
const WARDROBE_POSES = [...POSES, 'readBlink', 'readHappy', 'crouch', 'yawn', 'lookLeft', 'lookRight', 'curious', 'snack'];

export class PetSprite {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { willReadFrequently: true });
    this.frames = {};
    this.ready = false;
    this.family = '';
    this.changedAt = 0;
    this.outfits = new Map();
    this.outfitRequest = 0;
    this.outfit = 'classic';
    this.gaze = 0;
  }
  async loadSheet(url, poses, columns, rows) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('角色素材讀取失敗');
    const image = await createImageBitmap(await response.blob());
    const sheet = document.createElement('canvas');
    sheet.width = image.width; sheet.height = image.height;
    const context = sheet.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, sheet.width, sheet.height);
    // Trim each cell at runtime without modifying the source image. All poses share one scale.
    const frames = {};
    for (let i = 0; i < poses.length; i++) {
      const left = Math.round(i % columns * sheet.width / columns), right = Math.round((i % columns + 1) * sheet.width / columns);
      const top = Math.round(Math.floor(i / columns) * sheet.height / rows), bottom = Math.round((Math.floor(i / columns) + 1) * sheet.height / rows);
      let x1 = right, y1 = bottom, x2 = left, y2 = top;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        if (data[(y * sheet.width + x) * 4 + 3] < 48) continue;
        x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y);
      }
      if (x2 < x1 || y2 < y1) throw new Error('角色姿勢素材不完整');
      let headX = 0, weight = 0;
      for (let y = y1; y < y1 + (y2 - y1) * 0.5; y++) for (let x = x1; x <= x2; x++) {
        const alpha = data[(y * sheet.width + x) * 4 + 3];
        if (alpha >= 48) { headX += (x - x1) * alpha; weight += alpha; }
      }
      frames[poses[i]] = { image, x: x1, y: y1, width: x2 - x1 + 1, height: y2 - y1 + 1, anchor: weight ? headX / weight : (x2 - x1) / 2 };
    }
    return frames;
  }
  async load(url) {
    this.frames = await this.loadSheet(url, POSES, 4, 2);
    this.scale = Math.min(174 / Math.max(...Object.values(this.frames).map(f => f.height)), 190 / Math.max(...Object.values(this.frames).map(f => f.width)));
    this.ready = true;
  }
  async loadReading(url) {
    const frames = await this.loadSheet(url, ['read', 'readBlink', 'readHappy', 'crouch'], 4, 1);
    const scale = this.frames.read.height * this.scale / frames.read.height;
    for (const [name, frame] of Object.entries(frames)) {
      frame.scale = scale;
      if (name !== 'crouch') frame.anchor = frames.read.anchor;
    }
    Object.assign(this.frames, frames);
  }
  async loadIdle(url) {
    const frames = await this.loadSheet(url, ['yawn', 'lookLeft', 'lookRight', 'snack'], 4, 1);
    const scale = this.frames.idle.height * this.scale / frames.lookLeft.height;
    for (const frame of Object.values(frames)) frame.scale = scale;
    Object.assign(this.frames, frames);
  }
  async setOutfit(outfit) {
    if (!['classic', 'cozy', 'outing'].includes(outfit)) throw new Error('服裝選項無效');
    if (!this.outfits.has('classic')) this.outfits.set('classic', { frames: this.frames, scale: this.scale });
    const request = ++this.outfitRequest;
    let result = this.outfits.get(outfit);
    if (!result) {
      const frames = await this.loadSheet(`assets/mori-${outfit}-atlas.png`, WARDROBE_POSES, 4, 4);
      const scale = Math.min(174 / Math.max(...Object.values(frames).map(f => f.height)), 175 / Math.max(...Object.values(frames).map(f => f.width)));
      result = { frames, scale }; this.outfits.set(outfit, result);
    }
    if (request !== this.outfitRequest) return false;
    this.frames = result.frames; this.scale = result.scale; this.outfit = outfit; this.family = '';
    return true;
  }
  draw(pose, now, { reducedMotion = false, calm = false, landedAt = 0, grabPoint = null, gaze = 0, interaction = '', interactionSince = 0 } = {}) {
    if (!this.ready) return;
    const family = pose.startsWith('read') ? 'read' : ['idle', 'blink', 'wave', 'happy', 'stretch', 'yawn', 'lookLeft', 'lookRight', 'curious', 'snack'].includes(pose) ? 'stand' : pose;
    if (family !== this.family) {
      this.transition = !reducedMotion && this.family && ((this.family === 'read' && family === 'stand') || (this.family === 'stand' && family === 'read'));
      this.changedAt = now; this.family = family;
    }
    const transitioning = !reducedMotion && this.transition && now - this.changedAt < 200;
    const frame = (transitioning && this.frames.crouch) || this.frames[pose] || (pose.startsWith('read') ? this.frames.read : this.frames.idle);
    const scale = frame.scale || this.scale;
    const context = this.context;
    context.resetTransform(); context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(this.canvas.width / 220, 0, 0, this.canvas.height / 190, 0, 0);
    context.translate(110, 181);
    this.gaze += ((calm || reducedMotion ? 0 : Math.max(-1, Math.min(1, gaze))) - this.gaze) * 0.1;
    if (!reducedMotion && !calm) {
      const breath = Math.sin(now / (pose === 'sleep' ? 950 : 700));
      context.scale(1 + 0.003 * breath, 1 - 0.006 * breath);
      if (!['held', 'sleep'].includes(pose)) { context.translate(this.gaze * 1.5, 0); context.rotate(this.gaze * 0.012); }
      if (pose === 'curious') context.rotate(Math.sin(Math.min(1, (now - this.changedAt) / 500) * Math.PI / 2) * 0.045);
      if (['happy', 'readHappy', 'snack'].includes(pose)) context.translate(0, -Math.abs(Math.sin(now / 260)) * 1.3);
      const playTime = (now - interactionSince) / 1000;
      if (interaction === 'play' && playTime >= 0 && playTime < 2.4 && pose !== 'held') context.translate(0, -Math.abs(Math.sin(playTime * Math.PI * 2)) * 4 * (1 - playTime / 2.4));
      if (pose === 'held') {
        const pivot = grabPoint || { x: 0, y: -120 };
        context.translate(pivot.x, pivot.y); context.rotate(Math.sin(now / 220) * 0.022); context.translate(-pivot.x, -pivot.y);
      }
      if (pose === 'wave') context.rotate(Math.sin(now / 250) * 0.008);
      const landing = (now - landedAt) / 380;
      if (landedAt && landing >= 0 && landing < 1) {
        const squash = Math.sin(landing * Math.PI);
        context.scale(1 + squash * 0.05, 1 - squash * 0.08);
      }
    }
    context.drawImage(frame.image, frame.x, frame.y, frame.width, frame.height, -frame.anchor * scale, -frame.height * scale, frame.width * scale, frame.height * scale);
  }
  hit(clientX, clientY) {
    if (!this.ready) return false;
    const bounds = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - bounds.left) / bounds.width * this.canvas.width);
    const y = Math.floor((clientY - bounds.top) / bounds.height * this.canvas.height);
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return false;
    return this.context.getImageData(x, y, 1, 1).data[3] > 48;
  }
}
