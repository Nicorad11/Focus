// Leeward browser helper. While a watch is under way in the Leeward desktop app, pages on the
// "Batten down" list are redirected to a calm "below deck" page. The list comes from the app on
// 127.0.0.1; if the app isn't running, nothing is blocked.

const api = globalThis.browser ?? globalThis.chrome;
const PORTS = [47613, 47614, 47615, 47616];
const BLOCKED_PAGE = api.runtime.getURL('blocked.html');
const IDLE = { active: false, sites: [], allowed: [], firmness: 'steady', destination: '', endsAt: null };

const ua = navigator.userAgent;
const BROWSER = ua.includes('Firefox/') ? 'firefox' : ua.includes('Edg/') ? 'edge' : ua.includes('OPR/') ? 'opera' : navigator.brave ? 'brave' : 'chrome';

let port = null;
let current = IDLE;

async function ask(path, init = {}) {
  const order = port ? [port, ...PORTS.filter((p) => p !== port)] : PORTS;
  for (const p of order) {
    try {
      const res = await fetch(`http://127.0.0.1:${p}${path}${path.includes('?') ? '&' : '?'}browser=${BROWSER}`, {
        ...init,
        headers: { 'X-Leeward': '1', 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (res.status === 403 || res.status === 404) continue;
      const json = await res.json();
      port = p;
      return json;
    } catch {
      // not this port
    }
  }
  port = null;
  return null;
}

function matches(host, site) {
  return host === site || host.endsWith('.' + site);
}

function blockedSiteFor(url, state = current) {
  if (!state.active) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.replace(/^www\./, '');
    return state.sites.find((s) => matches(host, s) && !state.allowed.includes(s)) ?? null;
  } catch {
    return null;
  }
}

async function applyRules(state) {
  const existing = await api.declarativeNetRequest.getDynamicRules();
  const sites = state.active ? state.sites.filter((s) => !state.allowed.includes(s)) : [];
  const addRules = sites.map((site, i) => ({
    id: i + 1,
    priority: 1,
    action: { type: 'redirect', redirect: { regexSubstitution: `${BLOCKED_PAGE}#\\1` } },
    condition: { regexFilter: '^(https?://.*)$', requestDomains: [site], resourceTypes: ['main_frame'] },
  }));
  await api.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id), addRules });
}

async function sweepTabs(state) {
  if (!state.active) return;
  const tabs = await api.tabs.query({});
  for (const t of tabs) {
    if (t.id != null && t.url && blockedSiteFor(t.url, state)) {
      api.tabs.update(t.id, { url: `${BLOCKED_PAGE}#${t.url}` });
    }
  }
}

async function refresh() {
  const state = (await ask('/v1/state')) ?? IDLE;
  const wasActive = current.active;
  const changed = JSON.stringify(state) !== JSON.stringify(current);
  current = state;
  if (changed) await applyRules(state);
  if (state.active && !wasActive) await sweepTabs(state);
  await api.storage.session?.set?.({ state, connected: port != null });
  return state;
}

api.runtime.onInstalled.addListener(() => refresh());
api.runtime.onStartup.addListener(() => refresh());
api.alarms.create('leeward-poll', { periodInMinutes: 0.5 });
api.alarms.onAlarm.addListener((a) => a.name === 'leeward-poll' && refresh());
api.tabs.onActivated.addListener(() => refresh());

api.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    if (msg?.type === 'state') reply({ state: await refresh(), connected: port != null });
    else if (msg?.type === 'event') {
      await ask('/v1/event', { method: 'POST', body: JSON.stringify({ type: msg.kind, site: msg.site }) });
      reply({ state: await refresh() });
    } else reply(null);
  })();
  return true;
});

refresh();
