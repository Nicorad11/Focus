// In-window UI events that don't belong in persisted state.

type Events = {
  /** preselect a harbour in the plan panel (e.g. "Next leg") */
  'plan-pick': string;
};

const target = new EventTarget();

export function emit<K extends keyof Events>(type: K, detail: Events[K]) {
  target.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on<K extends keyof Events>(type: K, cb: (detail: Events[K]) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<Events[K]>).detail);
  target.addEventListener(type, h);
  return () => target.removeEventListener(type, h);
}
