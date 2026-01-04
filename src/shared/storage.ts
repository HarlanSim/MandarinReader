import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { VocabularyEntry, ContextEntry, SyncedVocabEntry, CharacterInfo } from './types';

interface MandarinReaderDB extends DBSchema {
  vocabulary: {
    key: string;
    value: VocabularyEntry;
    indexes: {
      'by-lookup-count': number;
      'by-last-seen': number;
      'by-pinyin': string;
    };
  };
  componentMap: {
    key: string;
    value: string[];
  };
}

const DB_NAME = 'mandarin-reader';
const DB_VERSION = 1;
const SYNC_KEY = 'vocab_sync';
const MAX_CONTEXTS_PER_WORD = 5;
const MAX_SYNCED_DEFINITIONS = 3;
const MAX_SYNCED_DEF_LENGTH = 100;

let dbPromise: Promise<IDBPDatabase<MandarinReaderDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MandarinReaderDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MandarinReaderDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const vocabStore = db.createObjectStore('vocabulary', { keyPath: 'id' });
        vocabStore.createIndex('by-lookup-count', 'lookupCount');
        vocabStore.createIndex('by-last-seen', 'lastSeenAt');
        vocabStore.createIndex('by-pinyin', 'pinyin');
        db.createObjectStore('componentMap');
      },
    });
  }
  return dbPromise;
}

function generateWordId(word: string): string {
  return word.normalize('NFC');
}

function truncateDefinitions(definitions: string[]): string[] {
  return definitions
    .slice(0, MAX_SYNCED_DEFINITIONS)
    .map(d => d.length > MAX_SYNCED_DEF_LENGTH ? d.slice(0, MAX_SYNCED_DEF_LENGTH) + '…' : d);
}

function entryToSyncFormat(entry: VocabularyEntry): SyncedVocabEntry {
  return {
    w: entry.word,
    p: entry.pinyin,
    d: truncateDefinitions(entry.definitions),
    c: entry.lookupCount,
    f: entry.firstSeenAt,
    l: entry.lastSeenAt,
  };
}

function syncFormatToEntry(synced: SyncedVocabEntry): Partial<VocabularyEntry> {
  return {
    id: generateWordId(synced.w),
    word: synced.w,
    pinyin: synced.p,
    definitions: synced.d,
    lookupCount: synced.c,
    firstSeenAt: synced.f,
    lastSeenAt: synced.l,
  };
}

export async function saveVocabularyEntry(
  word: string,
  pinyin: string,
  definitions: string[],
  characters: CharacterInfo[],
  context?: { sentence: string; sourceUrl: string }
): Promise<VocabularyEntry> {
  const db = await getDB();
  const id = generateWordId(word);
  const now = Date.now();

  const existing = await db.get('vocabulary', id);

  let entry: VocabularyEntry;

  if (existing) {
    entry = {
      ...existing,
      lookupCount: existing.lookupCount + 1,
      lastSeenAt: now,
      definitions: definitions.length > 0 ? definitions : existing.definitions,
      characters: characters.length > 0 ? characters : existing.characters,
    };

    if (context && entry.contexts.length < MAX_CONTEXTS_PER_WORD) {
      const isDuplicate = entry.contexts.some(c => c.sentence === context.sentence);
      if (!isDuplicate) {
        entry.contexts.push({
          sentence: context.sentence,
          sourceUrl: context.sourceUrl,
          timestamp: now,
        });
      }
    }
  } else {
    const contexts: ContextEntry[] = context
      ? [{ sentence: context.sentence, sourceUrl: context.sourceUrl, timestamp: now }]
      : [];

    entry = {
      id,
      word,
      pinyin,
      definitions,
      lookupCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      contexts,
      characters,
    };
  }

  await db.put('vocabulary', entry);
  await syncToChrome(entry);

  return entry;
}

async function syncToChrome(entry: VocabularyEntry): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(SYNC_KEY);
    const syncedData: Record<string, SyncedVocabEntry> = result[SYNC_KEY] || {};

    const existing = syncedData[entry.id];
    if (existing) {
      syncedData[entry.id] = {
        ...entryToSyncFormat(entry),
        c: Math.max(existing.c, entry.lookupCount),
        f: Math.min(existing.f, entry.firstSeenAt),
      };
    } else {
      syncedData[entry.id] = entryToSyncFormat(entry);
    }

    const jsonSize = JSON.stringify({ [SYNC_KEY]: syncedData }).length;
    if (jsonSize < 100000) {
      await chrome.storage.sync.set({ [SYNC_KEY]: syncedData });
    }
  } catch (e) {
    console.warn('Failed to sync to chrome.storage.sync:', e);
  }
}

export async function getAllVocabulary(): Promise<VocabularyEntry[]> {
  const db = await getDB();
  return db.getAll('vocabulary');
}

export async function getVocabularyEntry(word: string): Promise<VocabularyEntry | null> {
  const db = await getDB();
  const id = generateWordId(word);
  return (await db.get('vocabulary', id)) || null;
}

export async function isWordKnown(word: string): Promise<boolean> {
  const entry = await getVocabularyEntry(word);
  return entry !== null && entry.lookupCount > 1;
}

export async function getVocabularySortedByLookupCount(): Promise<VocabularyEntry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('vocabulary', 'by-lookup-count');
  return entries.reverse();
}

export async function getVocabularySortedByLastSeen(): Promise<VocabularyEntry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('vocabulary', 'by-last-seen');
  return entries.reverse();
}

export async function getVocabularySortedByPinyin(): Promise<VocabularyEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('vocabulary', 'by-pinyin');
}

export async function updateComponentMap(component: string, character: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get('componentMap', component);
  const chars = existing || [];

  if (!chars.includes(character)) {
    chars.push(character);
    if (chars.length > 20) chars.shift();
    await db.put('componentMap', chars, component);
  }
}

export async function getCharactersWithComponent(component: string): Promise<string[]> {
  const db = await getDB();
  return (await db.get('componentMap', component)) || [];
}

export async function syncFromChrome(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(SYNC_KEY);
    const syncedData: Record<string, SyncedVocabEntry> = result[SYNC_KEY] || {};

    const db = await getDB();

    for (const [id, synced] of Object.entries(syncedData)) {
      const existing = await db.get('vocabulary', id);

      if (existing) {
        const merged: VocabularyEntry = {
          ...existing,
          lookupCount: existing.lookupCount + synced.c,
          firstSeenAt: Math.min(existing.firstSeenAt, synced.f),
          lastSeenAt: Math.max(existing.lastSeenAt, synced.l),
        };
        await db.put('vocabulary', merged);
      } else {
        const newEntry: VocabularyEntry = {
          id,
          word: synced.w,
          pinyin: synced.p,
          definitions: synced.d,
          lookupCount: synced.c,
          firstSeenAt: synced.f,
          lastSeenAt: synced.l,
          contexts: [],
          characters: [],
        };
        await db.put('vocabulary', newEntry);
      }
    }
  } catch (e) {
    console.warn('Failed to sync from chrome.storage.sync:', e);
  }
}
