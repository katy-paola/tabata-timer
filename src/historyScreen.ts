import { formatClock } from './format';
import { loadSessions, type SessionRecord } from './history';
import { computeStats } from './stats';
import { show } from './screens';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusText(record: SessionRecord): string {
  return record.status === 'completed' ? 'Completada' : 'Finalizada antes de tiempo';
}

function renderStats(sessions: SessionRecord[]): void {
  const stats = computeStats(sessions, Date.now());
  el('stat-completed').textContent = String(stats.completedCount);
  el('stat-total').textContent = String(stats.totalSessions);
  el('stat-active').textContent = formatClock(Math.round(stats.totalActiveMs / 1000));
  el('stat-work').textContent = formatClock(Math.round(stats.totalWorkMs / 1000));
  el('stat-week').textContent = `${stats.weekSessions} ${stats.weekSessions === 1 ? 'sesión' : 'sesiones'}`;
  el('stat-avg').textContent = stats.weeks > 0 ? stats.avgSessionsPerWeek.toFixed(1) : '0';
}

export function renderProgreso(): void {
  const sessions = loadSessions();
  renderStats(sessions);
  const list = el('history-list');
  const empty = el('history-empty');
  list.innerHTML = '';
  empty.hidden = sessions.length > 0;

  for (const record of sessions) {
    const item = document.createElement('li');
    item.className = 'history-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-row';

    const left = document.createElement('span');
    left.className = 'history-date';
    left.textContent = formatDate(record.finishedAt);

    const right = document.createElement('span');
    right.className = 'history-meta';
    right.textContent = `${formatClock(Math.round(record.activeMs / 1000))} · ${statusText(record)}`;

    button.append(left, right);
    button.addEventListener('click', () => renderDetail(record.id));
    item.append(button);
    list.append(item);
  }
}

function renderDetail(id: string): void {
  const record = loadSessions().find((s) => s.id === id);
  if (!record) {
    renderProgreso();
    show('progreso');
    return;
  }

  el('detail-date').textContent = formatDate(record.finishedAt);
  el('detail-status').textContent = statusText(record);
  const box = el('detail-body');
  box.innerHTML = '';
  const lines = [
    `Duración: <strong>${formatClock(Math.round(record.activeMs / 1000))}</strong>`,
    `Tiempo de trabajo: <strong>${formatClock(Math.round(record.workMs / 1000))}</strong>`,
    `Ejercicios completados: <strong>${record.completedExercises}</strong>`,
    `Series completadas: <strong>${record.completedSeries}</strong>`,
  ];
  for (const line of lines) {
    const p = document.createElement('p');
    p.innerHTML = line;
    box.append(p);
  }
  show('detail');
}

export function initHistoryScreen(): void {
  const back = document.getElementById('detail-back');
  if (back) {
    back.addEventListener('click', () => {
      renderProgreso();
      show('progreso');
    });
  }
}