import { performLookup, preloadDictionaries } from '../shared/dictionary';
import { translateToEnglish } from '../shared/translate';
import {
  saveVocabularyEntry,
  getAllVocabulary,
  getVocabularyEntry,
  updateComponentMap,
  getCharactersWithComponent,
  syncFromChrome,
  isWordKnown,
} from '../shared/storage';
import type { MessageRequest, MessageResponse, LookupResult } from '../shared/types';

const DEBUG = true;
function log(...args: unknown[]): void {
  if (DEBUG) console.log('[MandarinReader BG]', ...args);
}

chrome.runtime.onInstalled.addListener(async () => {
  log('Extension installed');
  await preloadDictionaries();
  await syncFromChrome();

  chrome.contextMenus.create({
    id: 'mandarin-reader-lookup',
    title: 'Translate Chinese',
    contexts: ['selection'],
  });
  log('Context menu created');
});

chrome.runtime.onStartup.addListener(async () => {
  log('Extension startup');
  await preloadDictionaries();
  await syncFromChrome();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  log('Context menu clicked', info, tab);

  if (info.menuItemId === 'mandarin-reader-lookup' && tab?.id) {
    log('Sending CONTEXT_MENU_LOOKUP to tab', tab.id);
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_LOOKUP' });
      log('Message sent successfully');
    } catch (error) {
      log('Failed to send message:', error);
    }
  }
});

async function handleLookup(
  text: string,
  context?: string,
  sourceUrl?: string,
  skipSave?: boolean
): Promise<LookupResult> {
  log('handleLookup called with text:', text, 'skipSave:', skipSave);

  const seenWith: Record<string, string[]> = {};

  // Run dictionary lookup and translation in parallel
  const [result, naturalTranslation] = await Promise.all([
    performLookup(text, seenWith, isWordKnown),
    translateToEnglish(text),
  ]);

  log('performLookup returned segments:', result.segments.length);
  log('naturalTranslation:', naturalTranslation);

  result.naturalTranslation = naturalTranslation;

  for (const segment of result.segments) {
    for (const charInfo of segment.characters) {
      if (charInfo.radical) {
        await updateComponentMap(charInfo.radical, charInfo.character);
        seenWith[charInfo.radical] = await getCharactersWithComponent(charInfo.radical);
      }

      if (charInfo.components) {
        for (const comp of charInfo.components) {
          await updateComponentMap(comp, charInfo.character);
          seenWith[comp] = await getCharactersWithComponent(comp);
        }
      }
    }

    // Only save vocabulary on initial lookups, not when browsing within popup
    if (!skipSave) {
      await saveVocabularyEntry(
        segment.word,
        segment.pinyinTones,
        segment.definitions,
        segment.characters,
        context ? { sentence: context, sourceUrl: sourceUrl || '' } : undefined
      );
    }
  }

  result.seenWith = seenWith;

  return result;
}

async function fetchAudioAsDataUrl(text: string): Promise<string | null> {
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    log('Audio fetch error:', e);
    return null;
  }
}

chrome.runtime.onMessage.addListener(
  (request: MessageRequest | { type: 'GET_AUDIO'; text: string }, _sender, sendResponse: (response: MessageResponse | { audioUrl: string | null }) => void) => {
    log('Received message:', request.type);

    (async () => {
      try {
        if (request.type === 'GET_AUDIO') {
          const audioUrl = await fetchAudioAsDataUrl(request.text);
          sendResponse({ audioUrl });
          return;
        }

        switch (request.type) {
          case 'LOOKUP': {
            log('Processing LOOKUP for:', request.text);
            const result = await handleLookup(
              request.text,
              request.context,
              request.sourceUrl,
              request.skipSave
            );
            log('LOOKUP complete, sending response');
            sendResponse({
              type: 'LOOKUP_RESULT',
              success: true,
              result,
            });
            break;
          }

          case 'GET_VOCABULARY': {
            const entries = await getAllVocabulary();
            sendResponse({
              type: 'VOCABULARY_RESULT',
              entries,
            });
            break;
          }

          case 'GET_WORD': {
            const entry = await getVocabularyEntry(request.word);
            sendResponse({
              type: 'WORD_RESULT',
              entry,
            });
            break;
          }

          default:
            sendResponse({
              type: 'LOOKUP_RESULT',
              success: false,
              error: 'Unknown request type',
            });
        }
      } catch (error) {
        console.error('Background error:', error);
        sendResponse({
          type: 'LOOKUP_RESULT',
          success: false,
          error: String(error),
        });
      }
    })();

    return true;
  }
);

export {};
