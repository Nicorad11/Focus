import type { AppState, BlockApp, Purpose, Settings } from './types';

export const FLAG_COLORS = {
  blue: '#1F4E9A',
  red: '#D6402A',
  yellow: '#F2C12E',
  white: '#FFFFFF',
  black: '#13233A',
} as const;

const { blue, red, yellow, white } = FLAG_COLORS;

export const DEFAULT_PURPOSES: Purpose[] = [
  { id: 'work', name: 'Work', flag: { pattern: 'nested', colors: [blue, white, red] } },
  { id: 'study', name: 'Study', flag: { pattern: 'square', colors: [white, blue] } },
  { id: 'reading', name: 'Reading', flag: { pattern: 'cross', colors: [red, yellow] } },
  { id: 'creating', name: 'Creating', flag: { pattern: 'stripes', colors: [blue, white, red] } },
];

/** Suggestions for the Batten down app list; executable names are what Windows reports for the window. */
export const SUGGESTED_APPS: Omit<BlockApp, 'id' | 'enabled'>[] = [
  { name: 'Discord', exe: 'discord.exe', category: 'Chat' },
  { name: 'Steam', exe: 'steam.exe', category: 'Games' },
  { name: 'WhatsApp', exe: 'whatsapp.exe', category: 'Chat' },
  { name: 'Telegram', exe: 'telegram.exe', category: 'Chat' },
  { name: 'Epic Games Launcher', exe: 'epicgameslauncher.exe', category: 'Games' },
  { name: 'Netflix', exe: 'netflix.exe', category: 'Video' },
  { name: 'Spotify', exe: 'spotify.exe', category: 'Music' },
];

export const DEFAULT_SITES = ['youtube.com', 'reddit.com', 'x.com', 'instagram.com'];

export const DEFAULT_SETTINGS: Settings = {
  units: 'nm',
  watchMin: 60,
  pace: 'half',
  homePortId: null,
  sound: 'swell',
  volume: 0.6,
  bell: true,
  theme: 'system',
  firmness: 'steady',
  battenByDefault: true,
  apps: SUGGESTED_APPS.map((a) => ({ ...a, id: a.exe, enabled: a.exe !== 'spotify.exe' })),
  sites: DEFAULT_SITES,
  remindDnd: true,
  notifyLanding: true,
  launchAtLogin: false,
  miniOnTop: true,
  closeToTray: true,
  idleCheckMin: 0,
  projection: 'mercator',
};

export function initialState(): AppState {
  return {
    v: 1,
    onboarded: false,
    settings: structuredClone(DEFAULT_SETTINGS),
    purposes: structuredClone(DEFAULT_PURPOSES),
    passages: [],
    watches: [],
    boat: null,
    lastPurposeId: 'study',
    reviewWatchId: null,
  };
}

export const WATCH_PRESETS = [25, 45, 60, 90];

/** Rank on the Ports page, by lifetime distance sailed. */
export const RANKS: { name: string; nm: number }[] = [
  { name: 'Deckhand', nm: 0 },
  { name: 'Ordinary seaman', nm: 50 },
  { name: 'Able seaman', nm: 200 },
  { name: 'Bosun', nm: 600 },
  { name: 'Mate', nm: 1500 },
  { name: 'Skipper', nm: 4000 },
  { name: 'Captain', nm: 10000 },
  { name: 'Commodore', nm: 25000 },
];
