const $ = (id) => document.getElementById(id);

const SHORT = { prep: 5, work: 5, rest: 5, exercises: 3, series: 2, seriesRest: 10 };
const REAL = { prep: 10, work: 30, rest: 10, exercises: 8, series: 4, seriesRest: 60 };

let phases = [];
let idx = 0;
let phaseEnd = 0;
let pausedRemaining = null;
let running = false;
let timerId = null;
let totalMs = 0;
let startWall = 0;
let audioCtx = null;
let wakeLock = null;
const lines = [];

const pad = (n, w = 2) => String(n).padStart(w, '0');
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
const fmt = (s) => `${Math.floor(s / 60)}:${pad(s % 60)}`;

function logEv(text, extra = '') {
  lines.push(`${clock(new Date())}  ${text}${extra ? '  ' + extra : ''}`);
  $('log').value = lines.join('\n');
  $('log').scrollTop = $('log').scrollHeight;
}

function buildPhases(c) {
  const list = [];
  const add = (label, sec, type) => { if (sec > 0) list.push({ label, ms: sec * 1000, type }); };
  add('Preparación', c.prep, 'prep');
  for (let s = 1; s <= c.series; s++) {
    for (let e = 1; e <= c.exercises; e++) {
      add(`Trabajo · Serie ${s} · Ejercicio ${e}/${c.exercises}`, c.work, 'work');
      if (e < c.exercises) add(`Descanso · Serie ${s} · Ejercicio ${e}/${c.exercises}`, c.rest, 'rest');
    }
    if (s < c.series) add(`Descanso entre series ${s} → ${s + 1}`, c.seriesRest, 'seriesRest');
  }
  return list;
}

function beep() {
  if (!audioCtx) { logEv('BEEP omitido: AudioContext no creado'); return; }
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.value = 880;
  g.gain.value = 0.3;
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.4);
  logEv('BEEP', `(audio: ${audioCtx.state})`);
}

function vibrate() {
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
}

async function unlockAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume();
  logEv('AUDIO desbloqueado', `(estado: ${audioCtx.state})`);
}

async function requestWake() {
  if (!('wakeLock' in navigator)) { logEv('WAKE LOCK no soportado'); return; }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; logEv('WAKE LOCK liberado'); });
    logEv('WAKE LOCK activo');
  } catch (e) {
    logEv('WAKE LOCK error', `${e.name}: ${e.message}`);
  }
}

function releaseWake() {
  if (wakeLock) wakeLock.release();
  wakeLock = null;
}

async function start(cfg) {
  if (running) return;
  phases = buildPhases(cfg);
  totalMs = phases.reduce((a, p) => a + p.ms, 0);
  idx = 0;
  pausedRemaining = null;
  running = true;
  await unlockAudio();
  await requestWake();
  startWall = Date.now();
  phaseEnd = startWall + phases[0].ms;
  logEv(`INICIO`, `(total ideal ${fmt(Math.round(totalMs / 1000))}, ${phases.length} fases)`);
  logEv(`→ ${phases[0].label}`, `(ideal ${fmt(0)})`);
  beep();
  vibrate();
  timerId = setInterval(tick, 200);
  tick();
}

function tick() {
  const now = Date.now();
  if (running && pausedRemaining === null) {
    while (now >= phaseEnd && idx < phases.length) {
      const endedAt = phaseEnd;
      idx++;
      if (idx >= phases.length) { finish(endedAt, now); break; }
      phaseEnd = endedAt + phases[idx].ms;
      logEv(`→ ${phases[idx].label}`, `(retraso de detección: ${now - endedAt} ms)`);
      beep();
      vibrate();
    }
  }
  render(now);
}

function finish(endedAt, now) {
  running = false;
  clearInterval(timerId);
  timerId = null;
  logEv('FIN', `(retraso de detección: ${now - endedAt} ms, tiempo real ${fmt(Math.round((now - startWall) / 1000))})`);
  beep();
  vibrate();
  releaseWake();
}

function togglePause() {
  if (!running) return;
  if (pausedRemaining === null) {
    pausedRemaining = phaseEnd - Date.now();
    logEv('PAUSA');
    $('pause').textContent = 'Reanudar';
  } else {
    phaseEnd = Date.now() + pausedRemaining;
    pausedRemaining = null;
    logEv('REANUDAR');
    $('pause').textContent = 'Pausar';
  }
  tick();
}

function stop() {
  if (!running) return;
  logEv('FINALIZADO MANUALMENTE');
  running = false;
  clearInterval(timerId);
  timerId = null;
  releaseWake();
  render(Date.now());
}

function render(now) {
  if (!phases.length) return;
  const p = phases[Math.min(idx, phases.length - 1)];
  const remainingMs = pausedRemaining ?? Math.max(0, phaseEnd - now);
  $('phase').textContent = running ? p.label : 'Terminado';
  $('time').textContent = fmt(Math.ceil(remainingMs / 1000));
  $('next').textContent = running && phases[idx + 1] ? `Siguiente: ${phases[idx + 1].label}` : '';
  const elapsed = running ? now - startWall : 0;
  $('total').textContent = `Tiempo real: ${fmt(Math.round(elapsed / 1000))} / ideal: ${fmt(Math.round(totalMs / 1000))}`;
}

function status() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  $('status').textContent =
    `Instalada: ${standalone ? 'sí' : 'no'} · Wake Lock: ${'wakeLock' in navigator ? 'sí' : 'no'} · ` +
    `Vibración: ${'vibrate' in navigator ? 'sí' : 'no'} · Sin conexión: ${navigator.onLine ? 'no' : 'sí'}`;
  logEv('ESTADO', $('status').textContent);
}

document.addEventListener('visibilitychange', () => {
  logEv(document.visibilityState === 'hidden' ? 'APP OCULTA' : 'APP VISIBLE');
  if (document.visibilityState === 'visible') {
    tick();
    if (running && !wakeLock) requestWake();
  }
});

window.addEventListener('online', () => logEv('ONLINE'));
window.addEventListener('offline', () => logEv('OFFLINE'));

$('sound').onclick = async () => { await unlockAudio(); beep(); };
$('startShort').onclick = () => start(SHORT);
$('startReal').onclick = () => start(REAL);
$('pause').onclick = togglePause;
$('finish').onclick = stop;
$('copy').onclick = () => navigator.clipboard.writeText(lines.join('\n'));

status();
