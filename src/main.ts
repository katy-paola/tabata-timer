import { registerSW } from 'virtual:pwa-register';
import { initConfigScreen } from './configScreen';
import { initHistoryScreen, renderProgreso } from './historyScreen';
import { checkInterruptedSession, initTrainingScreen, isTrainingActive, startWorkout } from './trainingScreen';
import { show } from './screens';

const hadController = !!navigator.serviceWorker?.controller;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  // Una versión nueva tomó el control: se recarga para mostrarla, salvo durante un entrenamiento.
  if (hadController && !isTrainingActive()) window.location.reload();
});

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update();
    });
  },
});

initTrainingScreen();
initHistoryScreen();
initConfigScreen((config) => startWorkout(config));

document.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab as 'entrenar' | 'progreso' | 'ajustes' | undefined;
    if (!tab) return;
    if (tab === 'progreso') renderProgreso();
    show(tab);
  });
});

renderProgreso();
show('entrenar');
checkInterruptedSession();