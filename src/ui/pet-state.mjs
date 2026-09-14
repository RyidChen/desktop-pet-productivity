// Start each blink on a rendered frame so low-frequency rendering cannot skip it.
export class BlinkClock {
  constructor(now, random = Math.random) {
    this.random = random;
    this.until = 0;
    this.next = now + 4000 + random() * 5000;
  }
  update(now) {
    if (now >= this.next) {
      this.until = now + 160;
      this.next = this.until + 4000 + this.random() * 5000;
    }
    return this.until;
  }
}

export class IdleClock {
  constructor(now, random = Math.random) {
    this.random = random; this.pose = ''; this.previous = ''; this.until = 0;
    this.next = now + 9000 + random() * 7000;
  }
  update(now, eligible) {
    if (!eligible) { this.pose = ''; this.until = 0; this.next = now + 7000 + this.random() * 8000; return ''; }
    if (now < this.until) return this.pose;
    this.pose = '';
    if (now < this.next) return '';
    const choices = ['lookLeft', 'lookRight', 'curious', 'stretch'].filter(pose => pose !== this.previous);
    this.pose = choices[Math.floor(this.random() * choices.length)]; this.previous = this.pose;
    this.until = now + 2200;
    this.next = this.until + 7000 + this.random() * 10000;
    return this.pose;
  }
}

export function resolvePose({ held = false, reaction = '', reactionUntil = 0, timer = {}, lastActive = 0, phaseSince = 0, blinkUntil = 0, idlePose = '', calm = false }, now) {
  const reading = timer.mode === 'focus' && (timer.running || timer.remaining < timer.duration);
  if (held) return 'held';
  if (reaction && now < reactionUntil) return reading && ['happy', 'wave', 'snack', 'curious'].includes(reaction) ? 'readHappy' : reaction;
  if (!timer.running && now - lastActive >= 60000) return 'sleep';
  if (reading) return now < blinkUntil ? 'readBlink' : 'read';
  if (!calm && !timer.running && now - lastActive >= 58000) return 'yawn';
  if (!calm && idlePose) return idlePose;
  if (timer.mode === 'break' && (now - phaseSince) % 20000 < 3000) return 'stretch';
  return now < blinkUntil ? 'blink' : 'idle';
}
