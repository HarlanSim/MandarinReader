export interface DictionaryEntry {
  traditional: string;
  simplified: string;
  pinyin: string;
  pinyinTones: string;
  definitions: string[];
}

export interface CharacterInfo {
  character: string;
  radical: string;
  radicalMeaning?: string;
  strokeCount: number;
  components?: string[];
}

export interface VocabularyEntry {
  id: string;
  word: string;
  pinyin: string;
  definitions: string[];
  lookupCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  contexts: ContextEntry[];
  characters: CharacterInfo[];
  hskLevel?: number;
}

export interface ContextEntry {
  sentence: string;
  sourceUrl: string;
  timestamp: number;
}

export interface WordSegment {
  word: string;
  pinyin: string;
  pinyinTones: string;
  definitions: string[];
  characters: CharacterInfo[];
  isKnown: boolean;
  hskLevel?: number;
}

export interface LookupResult {
  originalText: string;
  fullPinyin: string;
  naturalTranslation?: string;
  segments: WordSegment[];
  seenWith: Record<string, string[]>;
}

export interface LookupRequest {
  type: 'LOOKUP';
  text: string;
  context?: string;
  sourceUrl?: string;
  skipSave?: boolean;
}

export interface LookupResponse {
  type: 'LOOKUP_RESULT';
  success: boolean;
  result?: LookupResult;
  error?: string;
}

export interface SyncedVocabEntry {
  w: string;
  p: string;
  d: string[];
  c: number;
  f: number;
  l: number;
}

export type MessageRequest = LookupRequest | { type: 'GET_VOCABULARY' } | { type: 'GET_WORD'; word: string };
export type MessageResponse = LookupResponse | { type: 'VOCABULARY_RESULT'; entries: VocabularyEntry[] } | { type: 'WORD_RESULT'; entry: VocabularyEntry | null };
