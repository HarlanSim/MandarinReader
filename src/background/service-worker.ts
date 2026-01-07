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

chrome.runtime.onInstalled.addListener(async () => {
  await preloadDictionaries();
  await syncFromChrome();

  chrome.contextMenus.create({
    id: 'mandarin-reader-lookup',
    title: 'Translate Chinese',
    contexts: ['selection'],
  });
});

chrome.runtime.onStartup.addListener(async () => {
  await preloadDictionaries();
  await syncFromChrome();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'mandarin-reader-lookup' && tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_LOOKUP' });
    } catch {
      // Tab may not have content script loaded
    }
  }
});

async function handleLookup(
  text: string,
  context?: string,
  sourceUrl?: string,
  skipSave?: boolean
): Promise<LookupResult> {
  const seenWith: Record<string, string[]> = {};

  // Run dictionary lookup and translation in parallel
  const [result, naturalTranslation] = await Promise.all([
    performLookup(text, seenWith, isWordKnown),
    translateToEnglish(text),
  ]);

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
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener(
  (request: MessageRequest | { type: 'GET_AUDIO'; text: string }, _sender, sendResponse: (response: MessageResponse | { audioUrl: string | null }) => void) => {
    (async () => {
      try {
        if (request.type === 'GET_AUDIO') {
          const audioUrl = await fetchAudioAsDataUrl(request.text);
          sendResponse({ audioUrl });
          return;
        }

        switch (request.type) {
          case 'LOOKUP': {
            const result = await handleLookup(
              request.text,
              request.context,
              request.sourceUrl,
              request.skipSave
            );
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
