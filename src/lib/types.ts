import type { LonLat } from './geo';

export type Units = 'nm' | 'km' | 'mi';
export type Firmness = 'steady' | 'storm';
export type ThemePref = 'system' | 'day' | 'night';
export type SoundId = 'swell' | 'rain' | 'wind' | 'off';

export type FlagPattern =
  | 'nested'
  | 'square'
  | 'cross'
  | 'stripes'
  | 'halves'
  | 'diagonal'
  | 'saltire'
  | 'checker'
  | 'quarters'
  | 'border'
  | 'disc'
  | 'bands';

export interface FlagSpec {
  pattern: FlagPattern;
  /** two or three colours, in the order the pattern uses them */
  colors: string[];
}

/** A purpose flag: what the watch is for (study, work, …). */
export interface Purpose {
  id: string;
  name: string;
  flag: FlagSpec;
  archived?: boolean;
}

/** A harbour from the bundled dataset. */
export interface Harbour {
  id: string;
  name: string;
  region: string;
  cc: string;
  lat: number;
  lon: number;
  /** 1 (small) … 6 (major port) */
  size: number;
}

/** A voyage from one place to a harbour. It may take several watches. */
export interface Passage {
  id: string;
  /** null when the passage began at sea (after an earlier passage was given up mid-way) */
  fromPortId: string | null;
  fromPos: LonLat;
  toPortId: string;
  route: LonLat[];
  nm: number;
  /** distance covered so far along `route` */
  sailedNm: number;
  createdAt: number;
  status: 'open' | 'arrived' | 'abandoned';
}

/**
 * under_way      the watch is running
 * made_port      the passage reached its harbour
 * anchored       the watch ran its full length on a passage that needs more watches
 * dropped_anchor the watch was ended early by holding "drop anchor"
 */
export type WatchStatus = 'under_way' | 'made_port' | 'anchored' | 'dropped_anchor';

/** One focus session. */
export interface Watch {
  id: string;
  passageId: string;
  purposeId: string;
  /** position along the passage route when the watch began */
  startNm: number;
  /** distance this watch is planned to sail; one nautical mile per minute */
  plannedNm: number;
  /** wall-clock start, epoch ms */
  startedAt: number;
  endedAt?: number;
  sailedNm?: number;
  status: WatchStatus;
  battened: boolean;
  /** times a blocked app or site was turned away */
  heldOff: number;
  /** times the user held to open a blocked app anyway */
  openedAnyway: number;
  note?: string;
  /** made port somewhere never visited before */
  newPort?: boolean;
  fromLabel: string;
  toLabel: string;
  toPortId: string;
  /** began mid-passage, at sea */
  resumed: boolean;
}

export interface BlockApp {
  id: string;
  name: string;
  /** executable file name, matched case-insensitively (e.g. "discord.exe") */
  exe: string;
  category: string;
  enabled: boolean;
}

export interface Settings {
  units: Units;
  /** chosen watch length in minutes */
  watchMin: number;
  homePortId: string | null;
  sound: SoundId;
  volume: number;
  bell: boolean;
  theme: ThemePref;
  firmness: Firmness;
  battenByDefault: boolean;
  apps: BlockApp[];
  sites: string[];
  remindDnd: boolean;
  notifyLanding: boolean;
  /** desktop: start with Windows */
  launchAtLogin: boolean;
  /** desktop: show the always-on-top mini window while under way */
  miniOnTop: boolean;
  /** desktop: closing the window keeps Leeward in the tray */
  closeToTray: boolean;
  /** desktop: minutes without input before asking "Still on board?"; 0 = off */
  idleCheckMin: number;
  projection: 'mercator' | 'globe';
}

export type BoatPosition = { portId: string } | { passageId: string };

export interface AppState {
  v: 1;
  onboarded: boolean;
  settings: Settings;
  purposes: Purpose[];
  passages: Passage[];
  watches: Watch[];
  /** where the boat is between watches: moored in a harbour, or anchored at sea on an open passage */
  boat: BoatPosition | null;
  lastPurposeId: string;
  /** the watch whose "made port" card is still open */
  reviewWatchId: string | null;
}
