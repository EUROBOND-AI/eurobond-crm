/* A job that carries on while you use the rest of the panel.

   An export of a week of GPS points takes a while, and people naturally go and
   do something else meanwhile. The work itself never stopped — it is plain
   asynchronous code — but its progress lived inside one screen, so leaving that
   screen made it look as though it had died. Progress is kept here instead and
   shown by a small badge that follows you around the panel. */

let state = { running: false, label: "", title: "" };
const listeners = new Set();

function emit() {
  const snapshot = { ...state };
  listeners.forEach((fn) => { try { fn(snapshot); } catch {} });
}

export function subscribeTask(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function getTask() {
  return { ...state };
}

export function taskStart(title) {
  state = { running: true, title, label: "starting…" };
  emit();
}

export function taskProgress(label) {
  if (!state.running) return;
  state = { ...state, label };
  emit();
}

export function taskDone() {
  state = { running: false, label: "", title: "" };
  emit();
}

/* A short confirmation in the same badge.

   Saving a record gave no sign that anything had happened: the click did not
   change, and on a slow connection people pressed Save again or went away
   unsure whether the row had been added. This says plainly that it was, then
   clears itself. `done: true` tells the badge to show a tick rather than a
   spinner, so a finished job does not look like one still running. */
let flashTimer = null;

export function taskFlash(title, ms = 2600) {
  if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
  state = { running: true, done: true, title, label: "" };
  emit();
  flashTimer = setTimeout(() => {
    flashTimer = null;
    state = { running: false, done: false, label: "", title: "" };
    emit();
  }, ms);
}
