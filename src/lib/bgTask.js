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
