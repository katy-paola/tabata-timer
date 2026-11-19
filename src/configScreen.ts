import { loadPrefs, setPrefs } from './alerts';
import { parseConfig, type RawConfig } from './configForm';
import { buildPlan } from './plan';
import { formatClock } from './format';
import { DEFAULT_CONFIG, type WorkoutConfig } from './types';

const STORAGE_KEY = 'tabata.config.v1';
const DEFAULT_REST_KEY = 'tabata.seriesRestDefault.v1';
const SERIES_REST_DEFAULT = 60;

export function loadConfig(): WorkoutConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) } satisfies WorkoutConfig;
  } catch {
    // Configuración corrupta: se usa la predeterminada.
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: WorkoutConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function loadSeriesRestDefault(): number {
  const stored = localStorage.getItem(DEFAULT_REST_KEY);
  const n = stored !== null && /^\d+$/.test(stored) ? Number(stored) : SERIES_REST_DEFAULT;
  return n;
}

export function initConfigScreen(onSave: (config: WorkoutConfig) => void): void {
  const form = document.getElementById('config-form') as HTMLFormElement;
  const errorsEl = document.getElementById('errors') as HTMLParagraphElement;
  const restsFieldset = document.getElementById('series-rests') as HTMLFieldSetElement;
  const soundToggle = document.getElementById('pref-sound') as HTMLInputElement;
  const vibrationToggle = document.getElementById('pref-vibration') as HTMLInputElement;
  const totalPreview = document.getElementById('total-preview') as HTMLParagraphElement | null;

  const inputs = {
    prep: document.getElementById('prep') as HTMLInputElement,
    work: document.getElementById('work') as HTMLInputElement,
    rest: document.getElementById('rest') as HTMLInputElement,
    exercises: document.getElementById('exercises') as HTMLInputElement,
    series: document.getElementById('series') as HTMLInputElement,
  };

  const clocks = {
    prep: document.getElementById('prep-clock') as HTMLSpanElement,
    work: document.getElementById('work-clock') as HTMLSpanElement,
    rest: document.getElementById('rest-clock') as HTMLSpanElement,
    restDefault: document.getElementById('series-rest-default-clock') as HTMLSpanElement,
  };

  const defaultRestInput = document.getElementById('series-rest-default') as HTMLInputElement;

  let restValues: number[] = loadConfig().seriesRests;

  const readDefaultRest = (): number => {
    const n = Number(defaultRestInput.value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : SERIES_REST_DEFAULT;
  };

  function syncRestValuesFromDOM(): void {
    const restInputs = restsFieldset.querySelectorAll<HTMLInputElement>('input[type="number"]');
    restValues = Array.from(restInputs, (el) => Math.max(0, Math.floor(Number(el.value) || 0)));
  }

  function renderRestInputs(preserveExisting = true): void {
    if (preserveExisting) syncRestValuesFromDOM();
    const count = Math.max(0, (Number(inputs.series.value) || 1) - 1);
    const fallback = readDefaultRest();
    restValues = Array.from({ length: count }, (_, i) => restValues[i] ?? fallback);

    Array.from(restsFieldset.children).forEach((el) => {
      if (el.tagName !== 'LEGEND') el.remove();
    });
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'stepper-field rest-row';
      const label = document.createElement('label');
      label.textContent = `Serie ${i + 1} → ${i + 2}`;
      label.htmlFor = `series-rest-${i}`;
      const stepper = document.createElement('div');
      stepper.className = 'stepper';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'step-btn minus';
      minus.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>';
      minus.setAttribute('aria-label', `Menos descanso serie ${i + 1}`);
      const wrap = document.createElement('span');
      wrap.className = 'stepper-value has-clock';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.inputMode = 'numeric';
      input.id = `series-rest-${i}`;
      input.value = String(restValues[i]);
      const clock = document.createElement('span');
      clock.className = 'clock';
      clock.textContent = formatClock(restValues[i]);
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'step-btn plus';
      plus.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
      plus.setAttribute('aria-label', `Más descanso serie ${i + 1}`);
      const setVal = (val: number) => {
        const v = Math.max(0, Math.floor(val));
        restValues[i] = v;
        input.value = String(v);
        clock.textContent = formatClock(v);
        autoSave();
      };
      input.addEventListener('input', () => setVal(Number(input.value) || 0));
      minus.addEventListener('click', () => setVal((Number(input.value) || 0) - 5));
      plus.addEventListener('click', () => setVal((Number(input.value) || 0) + 5));
      wrap.append(input, clock);
      stepper.append(minus, wrap, plus);
      row.append(label, stepper);
      restsFieldset.append(row);
    }
    if (count === 0) {
      const note = document.createElement('p');
      note.className = 'hint left';
      note.textContent = 'Con una sola serie no hay descansos entre series.';
      restsFieldset.append(note);
    }
  }

  function updateClocks(): void {
    clocks.prep.textContent = formatClock(Number(inputs.prep.value) || 0);
    clocks.work.textContent = formatClock(Number(inputs.work.value) || 0);
    clocks.rest.textContent = formatClock(Number(inputs.rest.value) || 0);
  }

  function readRaw(): RawConfig {
    const restInputs = restsFieldset.querySelectorAll<HTMLInputElement>('input[type="number"]');
    return {
      prep: inputs.prep.value,
      work: inputs.work.value,
      rest: inputs.rest.value,
      exercises: inputs.exercises.value,
      series: inputs.series.value,
      seriesRests: Array.from(restInputs, (el) => el.value),
    };
  }

  function fill(config: WorkoutConfig): void {
    inputs.prep.value = String(config.prep);
    inputs.work.value = String(config.work);
    inputs.rest.value = String(config.rest);
    inputs.exercises.value = String(config.exercises);
    inputs.series.value = String(config.series);
    restValues = [...config.seriesRests];
    const allEqual = restValues.length > 0 && restValues.every((v) => v === restValues[0]);
    const storedDefault = loadSeriesRestDefault();
    defaultRestInput.value = String(allEqual ? restValues[0] : storedDefault);
    clocks.restDefault.textContent = formatClock(Number(defaultRestInput.value) || 0);
    renderRestInputs(false);
    updateClocks();
    updatePreview();
  }

  /** Opción 1: aplicar el valor a todas las transiciones. */
  function applyDefaultRest(): void {
    const value = readDefaultRest();
    clocks.restDefault.textContent = formatClock(value);
    localStorage.setItem(DEFAULT_REST_KEY, String(value));
    restValues = restValues.map(() => value);
    for (const input of restsFieldset.querySelectorAll<HTMLInputElement>('input[type="number"]')) {
      const idx = Number(input.id.replace('series-rest-', ''));
      if (!Number.isNaN(idx)) restValues[idx] = value;
      input.value = String(value);
      const clock = input.parentElement?.querySelector('.clock');
      if (clock) clock.textContent = formatClock(value);
    }
    autoSave();
  }

  function stepInput(input: HTMLInputElement, delta: number, min: number): void {
    const current = Number(input.value) || 0;
    const next = Math.max(min, current + delta);
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function wireSteppers(): void {
    document.querySelectorAll<HTMLElement>('.stepper').forEach((stepper) => {
      const targetId = stepper.dataset.for;
      // Los steppers de transiciones individuales se crean dinámicamente y se gestionan aparte.
      if (!targetId || targetId.startsWith('series-rest-')) return;
      if (stepper.closest('#series-rests')) return;
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (!input) return;
      const step = Number(stepper.dataset.step) || 1;
      const min = Number(stepper.dataset.min) || 0;
      stepper.querySelector('.minus')?.addEventListener('click', () => stepInput(input, -step, min));
      stepper.querySelector('.plus')?.addEventListener('click', () => stepInput(input, step, min));
    });
  }

  function updatePreview(): void {
    if (!totalPreview) return;
    const result = parseConfig(readRaw());
    if (result.ok) {
      const plan = buildPlan(result.config);
      totalPreview.textContent = `Duración total: ${formatClock(plan.totalMs / 1000)}`;
    } else {
      totalPreview.textContent = '';
    }
  }

  /** Guarda si la configuración es válida, sin mostrar errores (solo actualiza la vista previa). */
  function autoSave(): void {
    updateClocks();
    updatePreview();
    const result = parseConfig(readRaw());
    if (result.ok) {
      saveConfig(result.config);
      errorsEl.hidden = true;
    }
  }

  fill(loadConfig());
  wireSteppers();

  const prefs = loadPrefs();
  soundToggle.checked = prefs.sound;
  vibrationToggle.checked = prefs.vibration;
  const savePrefsFromUI = () =>
    setPrefs({ sound: soundToggle.checked, vibration: vibrationToggle.checked });
  soundToggle.addEventListener('change', savePrefsFromUI);
  vibrationToggle.addEventListener('change', savePrefsFromUI);

  defaultRestInput.addEventListener('input', () => {
    clocks.restDefault.textContent = formatClock(readDefaultRest());
    applyDefaultRest();
  });
  const applyRestBtn = document.getElementById('apply-rest-default') as HTMLButtonElement | null;
  if (applyRestBtn) {
    applyRestBtn.addEventListener('click', () => {
      applyDefaultRest();
    });
  }

  // Restablecer configuración. Confirmación de dos toques.
  const resetBtn = document.getElementById('reset-config') as HTMLButtonElement | null;
  if (resetBtn) {
    let resetArmed = false;
    let resetTimer: number | null = null;
    const disarm = () => {
      resetArmed = false;
      resetTimer = null;
      resetBtn.classList.remove('armed');
      resetBtn.textContent = 'Volver a los valores por defecto';
    };
    resetBtn.addEventListener('click', () => {
      if (!resetArmed) {
        resetArmed = true;
        resetBtn.classList.add('armed');
        resetBtn.textContent = '¿Seguro? Toca otra vez para restablecer';
        resetTimer = window.setTimeout(disarm, 3500);
        return;
      }
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      disarm();
      localStorage.setItem(DEFAULT_REST_KEY, String(SERIES_REST_DEFAULT));
      fill(DEFAULT_CONFIG);
      autoSave();
    });
  }
  inputs.series.addEventListener('input', () => {
    renderRestInputs(true);
    autoSave();
  });
  for (const key of ['prep', 'work', 'rest', 'exercises'] as const) {
    inputs[key].addEventListener('input', autoSave);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const config = validateAndSave();
    if (config) onSave(config);
  });

  /** Valida, guarda y muestra errores si los hay. Devuelve null si hay errores. */
  function validateAndSave(): WorkoutConfig | null {
    const result = parseConfig(readRaw());
    if (!result.ok) {
      errorsEl.hidden = false;
      errorsEl.innerHTML = '';
      const list = document.createElement('ul');
      for (const message of result.errors) {
        const item = document.createElement('li');
        item.textContent = message;
        list.append(item);
      }
      errorsEl.append(list);
      return null;
    }

    errorsEl.hidden = true;
    saveConfig(result.config);
    updatePreview();
    return result.config;
  }
}