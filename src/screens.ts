export type Screen =
  | 'entrenar'
  | 'progreso'
  | 'ajustes'
  | 'training'
  | 'summary'
  | 'recovery'
  | 'detail';

const SECTION_IDS: Record<Screen, string> = {
  entrenar: 'tab-entrenar',
  progreso: 'tab-progreso',
  ajustes: 'tab-ajustes',
  training: 'training-screen',
  summary: 'summary-screen',
  recovery: 'recovery-screen',
  detail: 'session-detail-screen',
};

const TAB_SCREENS: Screen[] = ['entrenar', 'progreso', 'ajustes'];

export function show(screen: Screen): void {
  for (const [name, id] of Object.entries(SECTION_IDS)) {
    const el = document.getElementById(id);
    if (el) el.hidden = name !== screen;
  }
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.hidden = !TAB_SCREENS.includes(screen);
  for (const name of TAB_SCREENS) {
    const btn = document.querySelector<HTMLButtonElement>(`[data-tab="${name}"]`);
    if (btn) {
      btn.classList.toggle('active', name === screen);
      btn.setAttribute('aria-current', name === screen ? 'page' : 'false');
    }
  }
}

export function currentTab(): Screen {
  for (const name of TAB_SCREENS) {
    const el = document.getElementById(SECTION_IDS[name]);
    if (el && !el.hidden) return name;
  }
  return 'entrenar';
}
