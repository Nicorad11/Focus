const api = globalThis.browser ?? globalThis.chrome;
const original = location.hash.slice(1);
let site = '';
try {
  site = new URL(original).hostname.replace(/^www\./, '');
} catch {
  /* no original address */
}
document.getElementById('site').textContent = site || 'This site';

function minutesLeft(endsAt) {
  return endsAt ? Math.max(1, Math.ceil((endsAt - Date.now()) / 60000)) : null;
}

let reported = false;
async function update() {
  let res;
  try {
    res = await api.runtime.sendMessage({ type: 'state' });
  } catch {
    res = null;
  }
  const state = res?.state;
  const rule = state?.active ? state.sites.find((s) => site === s || site.endsWith('.' + s)) : null;
  // the watch is over, the app is closed, or this site was let through: carry on to the page
  if (!state || !state.active || !rule || state.allowed.includes(rule)) {
    if (original) location.replace(original);
    return;
  }
  const mins = minutesLeft(state.endsAt);
  const when = document.getElementById('when');
  when.textContent = '';
  if (mins) {
    when.append(`${mins} min until you make port in `);
    const em = document.createElement('em');
    em.textContent = state.destination || 'port';
    when.append(em, '.');
  } else when.textContent = 'You’re on watch.';
  document.getElementById('open').hidden = state.firmness !== 'steady';
  document.getElementById('storm').hidden = state.firmness === 'steady';
  if (!reported) {
    reported = true;
    api.runtime.sendMessage({ type: 'event', kind: 'held-off', site: rule }).catch(() => {});
  }
  document.getElementById('open').dataset.rule = rule;
}

document.getElementById('back').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else window.close();
});

const open = document.getElementById('open');
const fill = document.createElement('span');
fill.className = 'fill';
open.prepend(fill);
let timer = null;
const start = () => {
  if (timer) return;
  open.classList.add('holding');
  timer = setTimeout(async () => {
    timer = null;
    open.classList.remove('holding');
    await api.runtime.sendMessage({ type: 'event', kind: 'opened-anyway', site: open.dataset.rule });
    if (original) location.replace(original);
  }, 3000);
};
const cancel = () => {
  clearTimeout(timer);
  timer = null;
  open.classList.remove('holding');
};
open.addEventListener('pointerdown', start);
open.addEventListener('pointerup', cancel);
open.addEventListener('pointerleave', cancel);
open.addEventListener('keydown', (e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && (e.preventDefault(), start()));
open.addEventListener('keyup', (e) => (e.key === ' ' || e.key === 'Enter') && cancel());

update();
setInterval(update, 4000);
