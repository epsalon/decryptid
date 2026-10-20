// A "wrong answer" buzzer, synthesized with Web Audio so there is no sound
// file to ship. Call it from a click handler: browsers only allow sound
// after the user has touched the page.
//
// Modeled on a game-show "incorrect" buzzer: a raspy buzz at about 59 Hz whose
// harmonics gather in three bands (around 120 Hz, 800-1100 Hz and 1250-1370
// Hz), held steady for about a third of a second and then faded out. The
// harmonics are listed explicitly, as a periodic wave, rather than filtered
// out of a sawtooth.

const F0 = 59.3;
// Relative level of each harmonic of F0 (harmonic number -> amplitude).
const HARMONICS = {
  1: 0.008, 2: 0.06, 4: 0.024, 5: 0.013, 6: 0.025, 7: 0.022, 11: 0.016,
  13: 0.018, 14: 0.022, 15: 0.061, 16: 0.031, 17: 0.031, 18: 0.014, 19: 0.018,
  21: 0.042, 22: 0.032, 23: 0.049,
};

let ctx;
let wave;

export function buzz() {
  try {
    ctx ??= new (window.AudioContext ?? window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (!wave) {
      const size = Math.max(...Object.keys(HARMONICS)) + 1;
      const real = new Float32Array(size);
      const imag = new Float32Array(size);
      for (const [n, a] of Object.entries(HARMONICS)) imag[n] = a;
      wave = ctx.createPeriodicWave(real, imag);
    }
    const now = ctx.currentTime;
    const HOLD = 0.35; // seconds at full volume
    const FADE = 0.28;
    const LEVEL = 0.35;

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = F0;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(LEVEL, now + 0.025); // fast attack, no click
    env.gain.setValueAtTime(LEVEL, now + HOLD);
    env.gain.exponentialRampToValueAtTime(LEVEL * 0.04, now + HOLD + FADE);
    env.gain.linearRampToValueAtTime(0, now + HOLD + FADE + 0.03);
    osc.connect(env).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + HOLD + FADE + 0.05);
  } catch {
    // No audio on this device: the message on screen still says what happened.
  }
}
