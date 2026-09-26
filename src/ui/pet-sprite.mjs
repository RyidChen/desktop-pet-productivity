const POSES = ['idle', 'blink', 'happy', 'held', 'read', 'sleep', 'stretch', 'wave'];
const WARDROBE_POSES = [...POSES, 'readBlink', 'readHappy', 'crouch', 'yawn', 'lookLeft', 'lookRight', 'curious', 'snack'];
const FOCUS_IDLE_POSES = ['idle', 'blink', 'happy', 'curious', 'lookLeft', 'lookRight'];

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
  async loadSheet(url, poses, columns, rows, cells) {
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
      const [left, top, right, bottom] = cells?.[i] || [Math.round(i % columns * sheet.width / columns), Math.round(Math.floor(i / columns) * sheet.height / rows), Math.round((i % columns + 1) * sheet.width / columns), Math.round((Math.floor(i / columns) + 1) * sheet.height / rows)];
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
      let neckX = 0, neckWeight = 0;
      for (let y = y1; y < y1 + Math.max(1, (y2 - y1) * 0.04); y++) for (let x = x1; x <= x2; x++) {
        const alpha = data[(y * sheet.width + x) * 4 + 3];
        if (alpha >= 128) { neckX += (x - x1) * alpha; neckWeight += alpha; }
      }
      frames[poses[i]] = { image, x: x1, y: y1, width: x2 - x1 + 1, height: y2 - y1 + 1, anchor: weight ? headX / weight : (x2 - x1) / 2, neckAnchor: neckWeight ? neckX / neckWeight : (x2 - x1) / 2 };
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
  async loadRig(url) {
    this.rig = await this.loadSheet(url, ['body', 'head', 'closed', 'earLeft', 'earRight', 'tail'], 3, 2,
      [[0, 0, 490, 576], [490, 0, 1014, 576], [1014, 0, 1536, 576], [0, 576, 512, 1024], [512, 576, 1024, 1024], [1024, 576, 1536, 1024]]);
  }
  async loadReadingRig(url, headsUrl = 'assets/mori-reading-heads.png') {
    const bodies = await this.loadSheet(url, ['classic', 'cozy', 'outing'], 3, 1);
    const heads = await this.loadSheet(headsUrl, ['head', 'closed'], 2, 1);
    this.readingHeads = heads;
    this.readingRig = bodies;
  }
  async loadActivityRig() {
    this.activityHeads = await this.loadSheet('assets/mori-activity-heads.png', ['yawn', 'held'], 2, 1);
    this.activityRigs = {};
    await Promise.all(['classic', 'cozy', 'outing'].map(async outfit => {
      try { this.activityRigs[outfit] = await this.loadSheet(`assets/mori-${outfit}-activities.png`, ['sleep', 'stretch', 'held', 'wave', 'snack', 'yawn'], 3, 2); }
      catch { /* Missing outfit layers keep the original complete poses. */ }
    }));
    if (!Object.keys(this.activityRigs).length) throw new Error('動作圖層暫時無法載入');
  }
  async loadFocusRig() {
    this.focusRigs = {};
    // The first sleeve slightly crosses the nominal equal-cell boundary.
    const columns = [0, 416, 800, 1152, 1536];
    const cells = Array.from({ length: 8 }, (_, i) => [columns[i % 4], Math.floor(i / 4) * 512, columns[i % 4 + 1], (Math.floor(i / 4) + 1) * 512]);
    await Promise.all(['classic', 'cozy', 'outing'].map(async outfit => {
      try {
        const frames = Object.values(await this.loadSheet(`assets/mori-${outfit}-focus-sequence.png`, Array.from({ length: 8 }, (_, i) => i), 4, 2, cells));
        const scale = 94 / frames[0].height;
        for (const frame of frames) { frame.scale = scale; frame.anchor = frame.neckAnchor; }
        this.focusRigs[outfit] = frames;
      } catch { /* An unavailable sequence keeps the existing complete poses. */ }
    }));
    if (!Object.keys(this.focusRigs).length) throw new Error('站坐動作暫時無法載入');
  }
  drawFocusRig(pose, now, still, frames) {
    const c = this.context, target = pose.startsWith('read') ? 7 : 0;
    if (this.focusPosition == null || still) this.focusPosition = target;
    else {
      // Play actual drawings at a fixed rate; reversing continues from this frame.
      const delta = Math.max(0, now - this.focusAt) / 95;
      this.focusPosition += Math.sign(this.focusTarget - this.focusPosition) * Math.min(delta, Math.abs(this.focusTarget - this.focusPosition));
    }
    this.focusAt = now; this.focusTarget = target;
    if (still) this.focusPosition = target;
    const step = this.focusStep = Math.max(0, Math.min(7, Math.round(this.focusPosition)));
    const body = frames[step], sitting = Math.max(0, Math.min(1, (step - 1) / 3));
    const moving = this.focusPosition !== target;
    // Every body uses the atlas's single scale. The head follows the actual neck,
    // never moves down through a stationary torso, and keeps its own fixed size.
    const height = body.height * body.scale, headY = -height + 5;
    const breath = still || moving ? 0 : Math.sin(now / (target ? 1200 : 700));
    const look = still || moving || target ? 0 : pose === 'lookLeft' ? -1 : pose === 'lookRight' ? 1 : this.gaze;
    const part = (f, x, y, h, angle = 0, originX = 0.5, originY = 1) => {
      if (!f) return;
      const w = h * f.width / f.height;
      c.save(); c.translate(x, y); c.rotate(angle);
      c.drawImage(f.image, f.x, f.y, f.width, f.height, -w * originX, -h * originY, w, h); c.restore();
    };
    const tailAngle = still ? 0 : Math.sin(now / (820 + sitting * 780)) * (0.24 - sitting * 0.11);
    part(this.rig.tail, 20, -24 + sitting * 9, 65 - sitting * 9, tailAngle, 0.12, 0.88);
    c.drawImage(body.image, body.x, body.y, body.width, body.height, -body.anchor * body.scale, -height, body.width * body.scale, height);
    c.save(); c.translate(look * 2, headY - breath); c.rotate(still || moving ? 0 : look * 0.07 + Math.sin(now / 2400) * (target ? 0.012 : 0.025));
    const twitch = still || moving ? 0 : Math.pow(Math.max(0, Math.sin(now / 2700)), 12) * Math.sin(now / 105) * (target ? 0.05 : 0.10);
    part(this.rig.earLeft, -28, -61, 30, -twitch, 0.5, 0.9);
    part(this.rig.earRight, 28, -61, 30, twitch * 0.7, 0.5, 0.9);
    const closed = (moving && step >= 2 && step <= 4) || ['blink', 'happy', 'readBlink', 'readHappy'].includes(pose);
    const head = step >= 4 ? this.readingHeads?.[closed ? 'closed' : 'head'] : this.rig[closed ? 'closed' : 'head'];
    part(head || this.rig[closed ? 'closed' : 'head'], 0, 4, 92);
    c.restore();
  }
  drawRig(pose, now, still, body = this.rig.body) {
    const c = this.context;
    const reading = pose.startsWith('read');
    const sleeping = pose === 'sleep', seated = reading || sleeping;
    const target = seated ? 1 : 0;
    const smooth = p => p * p * (3 - 2 * p);
    const sample = () => {
      const p = Math.max(0, Math.min(1, (now - this.rigChangedAt) / 420));
      return this.rigFrom + (this.rigTarget - this.rigFrom) * smooth(p);
    };
    let amount = this.rigLayout ? sample() : target;
    if (!this.rigLayout || this.rigTarget !== target) {
      this.rigFrom = amount; this.rigTarget = target; this.rigChangedAt = now;
    }
    if (still) { amount = target; this.rigFrom = target; }
    const moving = Math.abs(amount - target) > 0.001;
    this.rigPose = pose;
    if (seated) this.rigSeatedBody = body; else this.rigStandingBody = body;
    const headY = -89 + 35 * amount;
    this.rigLayout = [seated ? 65 : 94, headY, 65 - 9 * amount, -24 + 9 * amount, 22 + 7 * amount];
    // Wait until the head reaches the seated collar before changing the body.
    const seatedFrame = amount >= 0.78;
    const breath = still ? 0 : Math.sin(now / 700) * (1 - amount) + Math.sin(now / (sleeping ? 1100 : 1200)) * amount;
    const look = still ? 0 : (pose === 'lookLeft' ? -1 : pose === 'lookRight' ? 1 : this.gaze) * (1 - amount);
    const tilt = (sleeping ? 0.10 * amount : 0) + (still ? 0 : look * 0.07 + Math.sin(now / 2400) * (0.025 - 0.013 * amount));
    const part = (name, x, y, height, angle = 0, originX = 0.5, originY = 1, source = this.rig[name]) => {
      if (!source) return;
      const f = source, width = height * f.width / f.height;
      c.save(); c.translate(x, y); c.rotate(angle);
      c.drawImage(f.image, f.x, f.y, f.width, f.height, -width * originX, -height * originY, width, height); c.restore();
    };
    const tailAngle = still ? 0 : Math.sin(now / 820) * 0.24 * (1 - amount) + Math.sin(now / 1600) * (sleeping ? 0.035 : 0.13) * amount;
    part('tail', seatedFrame ? 29 : 22, seatedFrame ? -15 : -24, this.rigLayout[2], tailAngle, 0.12, 0.88);
    // Switch solid key poses during the blink. Keep feet on the floor and never
    // dissolve two faces/bodies together or stretch a sitting body into a standing one.
    const bodyY = seatedFrame ? Math.min(0, headY + 61) : 0;
    part('body', 0, bodyY - breath * 0.7, seatedFrame ? 65 : 94, 0, 0.5, 1, seatedFrame ? this.rigSeatedBody : this.rigStandingBody);
    c.save(); c.translate(look * 2, headY - breath); c.rotate(tilt);
    const twitch = still ? 0 : Math.pow(Math.max(0, Math.sin(now / 2700)), 12) * Math.sin(now / 105) * (sleeping ? 0.015 : 0.10 - 0.05 * amount);
    part('earLeft', -28, -61, 30 - 2 * amount, -twitch, 0.5, 0.9);
    part('earRight', 28, -61, 30 - 2 * amount, twitch * 0.7, 0.5, 0.9);
    // A brief blink masks the face change; both heads share the same attachment point.
    const closed = (moving && amount > 0.08 && amount < 0.92) || ['blink', 'happy', 'readBlink', 'readHappy', 'sleep', 'stretch'].includes(pose);
    const expression = ['yawn', 'held'].includes(pose) && this.activityHeads?.[pose] && !moving ? pose : closed ? 'closed' : 'head';
    const head = seatedFrame ? this.readingHeads?.[closed ? 'closed' : 'head'] || this.rig[closed ? 'closed' : 'head'] : this.activityHeads?.[expression] || this.rig[expression];
    part(expression, 0, 4, 92, 0, 0.5, 1, head);
    c.restore();
  }
  async setOutfit(outfit) {
    if (!['classic', 'cozy', 'outing'].includes(outfit)) throw new Error('服裝選項無效');
    if (!this.outfits.has('classic')) this.outfits.set('classic', { frames: this.frames, scale: this.scale });
    const request = ++this.outfitRequest;
    let result = this.outfits.get(outfit);
    if (!result) {
      const frames = await this.loadSheet(`assets/mori-${outfit}-atlas.png`, WARDROBE_POSES, 4, 4);
      const scale = Math.min(174 / Math.max(...Object.values(frames).map(f => f.height)), 175 / Math.max(...Object.values(frames).map(f => f.width)));
      let rigBody = null;
      try { rigBody = (await this.loadSheet(`assets/mori-${outfit}-body.png`, ['body'], 1, 1)).body; }
      catch { /* Optional layers: retain this outfit's original complete sprites. */ }
      result = { frames, scale, rigBody }; this.outfits.set(outfit, result);
    }
    if (request !== this.outfitRequest) return false;
    const keepFocusProgress = this.focusRigs?.[this.outfit] && this.focusRigs?.[outfit];
    this.frames = result.frames; this.scale = result.scale; this.outfit = outfit; this.family = '';
    this.rigPose = ''; this.rigLayout = null; this.rigStandingBody = null; this.rigSeatedBody = null;
    if (!keepFocusProgress) this.focusPosition = null;
    return true;
  }
  drawActivity(frame, scale, pose, now) {
    const c = this.context, height = frame.height * scale;
    const sleepy = pose === 'sleep', reading = pose.startsWith('read');
    const stretch = pose === 'stretch' || pose === 'yawn';
    const cycle = Math.sin(now / (sleepy ? 1100 : reading ? 1250 : stretch ? 650 : 240));
    const lift = sleepy ? 2.6 : reading ? 1.3 : stretch ? 3.5 : 1.5;
    const offset = t => {
      // Keep the head (including ears/hair) rigid; flex the torso to a fixed floor.
      const body = Math.max(0, (t - 0.48) / 0.52);
      const support = 1 - body * body * (3 - 2 * body);
      return {
        x: (pose === 'wave' ? 2 : sleepy ? 0.35 : 0.7) * cycle * support,
        y: -lift * cycle * support - (sleepy ? 1.3 * cycle * Math.sin(body * Math.PI) : 0),
      };
    };
    // Continuous bands preserve the original outfit and pose without cutting off body parts.
    const bands = 48;
    for (let i = 0; i < bands; i++) {
      const top = i / bands, bottom = Math.min(1, (i + 1) / bands + 0.75 / height);
      const a = offset(top), b = offset(bottom);
      const y = -height + top * height + a.y;
      const h = (bottom - top) * height + b.y - a.y;
      const shear = (b.x - a.x) / h;
      c.save(); c.transform(1, 0, shear, 1, a.x - shear * y, 0);
      c.drawImage(frame.image, frame.x, frame.y + top * frame.height, frame.width, (bottom - top) * frame.height,
        -frame.anchor * scale, y, frame.width * scale, h);
      c.restore();
    }
  }
  draw(pose, now, { reducedMotion = false, calm = false, landedAt = 0, grabPoint = null, gaze = 0, interaction = '', interactionSince = 0 } = {}) {
    if (!this.ready) return;
    const previousPose = this.drawnPose; this.drawnPose = pose;
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
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.setTransform(this.canvas.width / 220, 0, 0, this.canvas.height / 190, 0, 0);
    context.translate(110, 181);
    this.gaze += ((calm || reducedMotion ? 0 : Math.max(-1, Math.min(1, gaze))) - this.gaze) * 0.1;
    if (!reducedMotion && !calm) {
      const playTime = (now - interactionSince) / 1000;
      if (interaction === 'play' && playTime >= 0 && playTime < 2.4 && pose !== 'held') context.translate(0, -Math.abs(Math.sin(playTime * Math.PI * 2)) * 4 * (1 - playTime / 2.4));
      const landing = (now - landedAt) / 380;
      if (landedAt && landing >= 0 && landing < 1) {
        const squash = Math.sin(landing * Math.PI);
        context.scale(1 + squash * 0.05, 1 - squash * 0.08);
      }
    }
    const reading = ['read', 'readBlink', 'readHappy'].includes(pose);
    const focusFrames = this.focusRigs?.[this.outfit];
    const standingAction = ['stretch', 'yawn', 'wave', 'snack'].includes(pose);
    const finishingRead = standingAction && this.focusPosition > 0;
    if (this.rig && focusFrames && (reading || FOCUS_IDLE_POSES.includes(pose) || finishingRead)) {
      if (reading && this.focusPosition == null && (FOCUS_IDLE_POSES.includes(previousPose) || ['stretch', 'yawn', 'wave', 'snack'].includes(previousPose))) {
        this.focusPosition = 0; this.focusTarget = 0; this.focusAt = now;
      }
      context.scale(0.94, 0.94);
      this.rigLayout = null;
      this.drawFocusRig(pose, now, calm || reducedMotion, focusFrames);
      return;
    }
    this.focusPosition = null;
    const activityBody = this.activityRigs?.[this.outfit]?.[pose];
    const rigBody = reading ? this.readingRig?.[this.outfit] : activityBody || (this.outfit === 'classic' ? this.rig?.body : this.outfits.get(this.outfit)?.rigBody);
    if (this.rig && rigBody && (reading || activityBody || ['idle', 'blink', 'happy', 'curious', 'lookLeft', 'lookRight'].includes(pose))) {
      if (pose === 'held' && !reducedMotion && !calm) {
        const pivot = grabPoint || { x: 0, y: -120 };
        context.translate(pivot.x, pivot.y); context.rotate(Math.sin(now / 220) * 0.022); context.translate(-pivot.x, -pivot.y);
      }
      context.scale(0.94, 0.94);
      this.drawRig(pose, now, calm || reducedMotion, rigBody);
      return;
    }
    if (!reducedMotion && !calm && !transitioning && ['sleep', 'read', 'readBlink', 'readHappy', 'stretch', 'yawn', 'snack', 'wave'].includes(pose)) {
      this.drawActivity(frame, scale, pose, now);
      return;
    }
    if (!reducedMotion && !calm) {
      const breath = Math.sin(now / (pose === 'sleep' ? 950 : 700));
      context.scale(1 + 0.003 * breath, 1 - 0.006 * breath);
      if (!['held', 'sleep'].includes(pose)) { context.translate(this.gaze * 1.5, 0); context.rotate(this.gaze * 0.012); }
      if (pose === 'curious') context.rotate(Math.sin(Math.min(1, (now - this.changedAt) / 500) * Math.PI / 2) * 0.045);
      if (['happy', 'readHappy', 'snack'].includes(pose)) context.translate(0, -Math.abs(Math.sin(now / 260)) * 1.3);
      if (pose === 'held') {
        const pivot = grabPoint || { x: 0, y: -120 };
        context.translate(pivot.x, pivot.y); context.rotate(Math.sin(now / 220) * 0.022); context.translate(-pivot.x, -pivot.y);
      }
      if (pose === 'wave') context.rotate(Math.sin(now / 250) * 0.008);
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
