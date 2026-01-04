import type { DictionaryEntry, CharacterInfo, LookupResult, WordSegment } from './types';
import { parseCedictPinyin } from './pinyin';

interface CedictData {
  [key: string]: Array<{
    t: string;
    s: string;
    p: string;
    d: string[];
  }>;
}

interface UnihanData {
  [key: string]: {
    r: string;
    sc: number;
    c?: string[];
  };
}

interface RadicalData {
  [key: string]: string;
}

interface HskData {
  [key: string]: number;
}

let cedictData: CedictData | null = null;
let unihanData: UnihanData | null = null;
let radicalData: RadicalData | null = null;
let hskData: HskData | null = null;

async function loadCedict(): Promise<CedictData> {
  if (cedictData) return cedictData;

  try {
    const response = await fetch(chrome.runtime.getURL('data/cedict.json'));
    cedictData = await response.json();
    return cedictData!;
  } catch (e) {
    console.error('Failed to load CC-CEDICT:', e);
    return {};
  }
}

async function loadUnihan(): Promise<UnihanData> {
  if (unihanData) return unihanData;

  try {
    const response = await fetch(chrome.runtime.getURL('data/unihan.json'));
    unihanData = await response.json();
    return unihanData!;
  } catch (e) {
    console.error('Failed to load Unihan:', e);
    return {};
  }
}

async function loadRadicals(): Promise<RadicalData> {
  if (radicalData) return radicalData;

  try {
    const response = await fetch(chrome.runtime.getURL('data/radicals.json'));
    radicalData = await response.json();
    return radicalData!;
  } catch (e) {
    console.error('Failed to load radicals:', e);
    return {};
  }
}

async function loadHsk(): Promise<HskData> {
  if (hskData) return hskData;

  try {
    const response = await fetch(chrome.runtime.getURL('data/hsk.json'));
    hskData = await response.json();
    return hskData!;
  } catch (e) {
    console.error('Failed to load HSK:', e);
    return {};
  }
}

export function getHskLevel(word: string): number | undefined {
  if (!hskData) return undefined;
  return hskData[word];
}

function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/^[^\u4e00-\u9fff]+/, '')
    .replace(/[^\u4e00-\u9fff]+$/, '')
    .normalize('NFC');
}

function isChinese(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fff;
}

function isVariantDefinition(def: string): boolean {
  return /^(variant of|see |old variant|archaic variant|same as)/.test(def.toLowerCase());
}

function scoreDefinition(def: string): number {
  const lower = def.toLowerCase();
  let score = 100;

  // Heavily penalize variant/reference definitions
  if (isVariantDefinition(def)) score -= 80;

  // Penalize archaic/literary/dialect markers
  if (/\b(archaic|literary|dialect|old-fashioned)\b/.test(lower)) score -= 40;
  if (/\b(Taiwan pr\.|also pr\.|Taiwan variant)\b/i.test(def)) score -= 30;

  // Penalize abbreviations and technical markers
  if (/^(abbr\. |abbr\.|abbreviation)/.test(lower)) score -= 25;
  if (/\beuphemism\b/.test(lower)) score -= 20;

  // Slightly penalize literal/figurative markers (still useful but secondary)
  if (/^lit\. /.test(lower)) score -= 15;
  if (/^fig\. /.test(lower)) score -= 10;

  // Penalize classifier-only definitions
  if (/^CL:/.test(def)) score -= 35;

  // Penalize very short definitions (often incomplete)
  if (def.length < 5) score -= 20;

  // Boost definitions that look like primary meanings (start with "to " for verbs, etc.)
  if (/^to [a-z]/.test(lower)) score += 10;
  if (/^a [a-z]/.test(lower)) score += 5;
  if (/^the [a-z]/.test(lower)) score += 5;

  return score;
}

function selectBestEntry(entries: Array<{ t: string; s: string; p: string; d: string[] }>): {
  entry: { t: string; s: string; p: string; d: string[] };
  allDefinitions: string[];
} {
  const allDefinitions: string[] = [];
  let bestEntry = entries[0];
  let bestScore = 0;

  for (const entry of entries) {
    const realDefs = entry.d.filter(d => !isVariantDefinition(d));
    const score = realDefs.length;

    allDefinitions.push(...entry.d);

    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  // Sort definitions by relevance score (variants will be at the end due to low scores)
  const sortedDefs = [...new Set(allDefinitions)].sort((a, b) => scoreDefinition(b) - scoreDefinition(a));

  return {
    entry: bestEntry,
    allDefinitions: sortedDefs.length > 0 ? sortedDefs : allDefinitions,
  };
}

export async function lookupWord(text: string): Promise<DictionaryEntry | null> {
  const cedict = await loadCedict();
  const normalized = normalizeText(text);

  if (!normalized) return null;

  const entries = cedict[normalized];
  if (entries && entries.length > 0) {
    const { entry, allDefinitions } = selectBestEntry(entries);
    return {
      traditional: entry.t,
      simplified: entry.s,
      pinyin: entry.p,
      pinyinTones: parseCedictPinyin(entry.p),
      definitions: allDefinitions,
    };
  }

  return null;
}

export async function lookupWithSegmentation(text: string): Promise<DictionaryEntry[]> {
  const cedict = await loadCedict();
  const normalized = normalizeText(text);

  if (!normalized) return [];

  const exactMatch = await lookupWord(normalized);
  if (exactMatch) return [exactMatch];

  const results: DictionaryEntry[] = [];
  let pos = 0;

  while (pos < normalized.length) {
    let matched = false;

    for (let len = Math.min(6, normalized.length - pos); len >= 1; len--) {
      const substr = normalized.slice(pos, pos + len);
      const entries = cedict[substr];

      if (entries && entries.length > 0) {
        const { entry, allDefinitions } = selectBestEntry(entries);
        results.push({
          traditional: entry.t,
          simplified: entry.s,
          pinyin: entry.p,
          pinyinTones: parseCedictPinyin(entry.p),
          definitions: allDefinitions,
        });
        pos += len;
        matched = true;
        break;
      }
    }

    if (!matched) {
      const char = normalized[pos];
      if (isChinese(char)) {
        results.push({
          traditional: char,
          simplified: char,
          pinyin: '',
          pinyinTones: '',
          definitions: ['(no definition found)'],
        });
      }
      pos++;
    }
  }

  return results;
}

export async function getCharacterInfo(char: string): Promise<CharacterInfo> {
  const unihan = await loadUnihan();
  const radicals = await loadRadicals();

  const data = unihan[char];

  if (data) {
    return {
      character: char,
      radical: data.r,
      radicalMeaning: radicals[data.r],
      strokeCount: data.sc,
      components: data.c,
    };
  }

  return {
    character: char,
    radical: char,
    strokeCount: 0,
  };
}

export async function performLookup(
  text: string,
  seenComponents: Record<string, string[]> = {},
  checkKnown: (word: string) => Promise<boolean> = async () => false
): Promise<LookupResult> {
  const entries = await lookupWithSegmentation(text);
  const normalizedText = normalizeText(text);
  const hsk = await loadHsk();

  const segments: WordSegment[] = [];

  for (const entry of entries) {
    const characters: CharacterInfo[] = [];
    for (const char of entry.simplified) {
      if (isChinese(char)) {
        const info = await getCharacterInfo(char);
        characters.push(info);
      }
    }

    const isKnown = await checkKnown(entry.simplified);
    const hskLevel = hsk[entry.simplified];

    segments.push({
      word: entry.simplified,
      pinyin: entry.pinyin,
      pinyinTones: entry.pinyinTones,
      definitions: entry.definitions,
      characters,
      isKnown,
      hskLevel,
    });
  }

  const fullPinyin = segments.map(s => s.pinyinTones).join(' ');

  return {
    originalText: normalizedText,
    fullPinyin,
    segments,
    seenWith: seenComponents,
  };
}

export async function preloadDictionaries(): Promise<void> {
  await Promise.all([loadCedict(), loadUnihan(), loadRadicals(), loadHsk()]);
}
