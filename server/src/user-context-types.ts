/**
 * User Context Discovery — Shared Types
 *
 * Types for the consent-gated system that learns about users from their
 * desktop environment (browser, email, files, system) to provide
 * deeply personalized assistance.
 */

// ── Consent ──────────────────────────────────────────────────────────────────

export interface ContextConsent {
  browserHistory: boolean;
  bookmarks: boolean;
  email: boolean;
  files: boolean;
  system: boolean;
  kindleLibrary: boolean;
  youtube: boolean;
  updatedAt: number;
  /** Extensible: new data sources can register custom consent keys */
  [key: string]: boolean | number;
}

export const DEFAULT_CONSENT: ContextConsent = {
  browserHistory: false,
  bookmarks: false,
  email: false,
  files: false,
  system: false,
  kindleLibrary: false,
  youtube: false,
  updatedAt: 0,
};

// ── Scan Results ─────────────────────────────────────────────────────────────

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  visitCount: number;
  lastVisit: number; // epoch ms
  browser: "chrome" | "edge" | "firefox";
}

export interface BookmarkEntry {
  title: string;
  url: string;
  folder: string;
  browser: "chrome" | "edge" | "firefox";
}

export interface EmailSummary {
  from: string;
  subject: string;
  date: number; // epoch ms
  folder: string;
  hasBody?: boolean;
}

export interface FileEntry {
  path: string;
  name: string;
  ext: string;
  size: number;
  modified: number; // epoch ms
  isDirectory: boolean;
}

export interface DetectedProject {
  name: string;
  path: string;
  type: string; // "node", "python", "rust", "dotnet", "java", "go", etc.
  technologies: string[];
  lastModified: number;
}

export interface SystemInfo {
  installedApps: string[];
  runningProcesses: string[];
  platform: string;
  hostname: string;
}

export interface KindleBook {
  title: string;
  author: string;
  asin?: string;
  coverUrl?: string;
  readerUrl?: string;
  percentageRead?: number;
  originType?: string;      // PURCHASE, SAMPLE, PRIME_BORROW, etc.
  // Rich metadata (from Amazon product page, populated by background enrichment)
  description?: string;
  publisher?: string;
  publicationDate?: string;
  pageCount?: number;
  rating?: number;          // e.g. 4.6
  reviewCount?: number;     // e.g. 2130
  categories?: string[];    // e.g. ["Anatomy Science", "Evolution"]
  language?: string;
  isbn?: string;
  enrichedAt?: number;      // epoch ms — when metadata was fetched
}

// ── Aggregated Profile ───────────────────────────────────────────────────────

export interface UserContextProfile {
  version: 1;
  lastUpdated: number;

  /** Topics the user is interested in, derived from browsing + bookmarks + files */
  interests: Array<{
    topic: string;
    confidence: number; // 0-1
    sources: string[]; // e.g. ["browser-history", "bookmarks"]
    lastSeen: number;
  }>;

  /** Detected software/code projects on the filesystem */
  workProjects: Array<{
    name: string;
    path: string;
    technologies: string[];
    lastActivity: number;
  }>;

  /** Email communication patterns */
  communicationPatterns: {
    topContacts: Array<{ name: string; email: string; frequency: number }>;
    peakHours: number[];
    primaryFolders: string[];
  };

  /** Tools and services the user uses */
  tools: {
    installedApps: string[];
    frequentSites: Array<{ domain: string; visits: number }>;
    recentSearches: Array<{ query: string; timestamp: number }>;
  };

  /** Behavioral patterns */
  habits: {
    activeHours: { start: number; end: number };
    mostUsedFileTypes: string[];
    topDirectories: string[];
  };

  /** Reading — Kindle library */
  reading?: {
    books: KindleBook[];
    totalBooks: number;
  };
}

export const EMPTY_PROFILE: UserContextProfile = {
  version: 1,
  lastUpdated: 0,
  interests: [],
  workProjects: [],
  communicationPatterns: { topContacts: [], peakHours: [], primaryFolders: [] },
  tools: { installedApps: [], frequentSites: [], recentSearches: [] },
  habits: { activeHours: { start: 9, end: 22 }, mostUsedFileTypes: [], topDirectories: [] },
};

// ── Scan Log ─────────────────────────────────────────────────────────────────

export interface ScanLog {
  browserHistory?: number;
  bookmarks?: number;
  email?: number;
  files?: number;
  system?: number;
  kindleLibrary?: number;
}

// ── Context Status (sent to frontend) ────────────────────────────────────────

export interface ContextStatus {
  consent: ContextConsent;
  scanLog: ScanLog;
  profileExists: boolean;
  profileAge: number; // seconds since last update
}
