import type { LookupResult, LookupResponse, CharacterInfo, WordSegment } from '../shared/types';
import { convertNumbersInText, pinyinToHtml } from '../shared/pinyin';

const DEBUG = true;
function log(...args: unknown[]): void {
  if (DEBUG) console.log('[MandarinReader]', ...args);
}

let popup: HTMLElement | null = null;
let loadingIndicator: HTMLElement | null = null;
let currentResult: LookupResult | null = null;
let expandedSegments: Set<number> = new Set();
let googleTranslations: Map<string, string> = new Map();
let resultHistory: LookupResult[] = [];

let isDragging = false;
let isResizing = false;
let isLookingUp = false;
let dragOffset = { x: 0, y: 0 };

type ViewMode = 'modal' | 'sidebar';
let viewMode: ViewMode = 'modal';
let sidebarWidth = 320;

log('Content script loaded');

// Load saved view mode preference
chrome.storage.local.get(['viewMode', 'sidebarWidth'], (result) => {
  if (result.viewMode) viewMode = result.viewMode;
  if (result.sidebarWidth) sidebarWidth = result.sidebarWidth;
  log('Loaded view mode:', viewMode, 'sidebar width:', sidebarWidth);
});

function createLoadingIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.id = 'mandarin-reader-loading';
  indicator.className = 'mr-loading';
  indicator.innerHTML = `
    <div class="mr-loading-spinner"></div>
    <span class="mr-loading-text">Looking up...</span>
  `;
  document.body.appendChild(indicator);
  return indicator;
}

function showLoading(x: number, y: number): void {
  if (!loadingIndicator) {
    loadingIndicator = createLoadingIndicator();
  }
  loadingIndicator.style.left = `${x + 10}px`;
  loadingIndicator.style.top = `${y + 10}px`;
  loadingIndicator.classList.add('visible');
}

function hideLoading(): void {
  if (loadingIndicator) {
    loadingIndicator.classList.remove('visible');
  }
}

function createPopup(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'mandarin-reader-popup';
  container.className = viewMode === 'sidebar' ? 'mr-popup mr-sidebar' : 'mr-popup';
  container.innerHTML = `
    <div class="mr-popup-header">
      <div class="mr-header-title">Translation</div>
      <div class="mr-header-actions">
        <button class="mr-mode-toggle" title="Toggle sidebar/modal view">${viewMode === 'sidebar' ? '◧' : '▤'}</button>
      </div>
      <div class="mr-resize-handle"></div>
    </div>
    <div class="mr-popup-content"></div>
  `;

  const header = container.querySelector('.mr-popup-header') as HTMLElement;
  header.addEventListener('mousedown', startDrag);

  const resizeHandle = container.querySelector('.mr-resize-handle') as HTMLElement;
  resizeHandle.addEventListener('mousedown', viewMode === 'sidebar' ? startSidebarResize : startResize);

  const modeToggle = container.querySelector('.mr-mode-toggle') as HTMLElement;
  modeToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleViewMode();
  });

  document.body.appendChild(container);
  return container;
}

function toggleViewMode(): void {
  viewMode = viewMode === 'modal' ? 'sidebar' : 'modal';
  chrome.storage.local.set({ viewMode });
  log('Toggled view mode to:', viewMode);

  // Recreate popup with new mode
  if (popup) {
    const wasVisible = popup.classList.contains('visible');
    const savedResult = currentResult;
    popup.remove();
    popup = null;

    if (wasVisible && savedResult) {
      popup = createPopup();
      currentResult = savedResult;
      updatePopupContent();
      applyViewModeStyles();
      popup.classList.add('visible');
    }
  }
}

function applyViewModeStyles(): void {
  if (!popup) return;

  if (viewMode === 'sidebar') {
    popup.classList.add('mr-sidebar');
    popup.style.position = 'fixed';
    popup.style.top = '0';
    popup.style.right = '0';
    popup.style.left = 'auto';
    popup.style.width = `${sidebarWidth}px`;
    popup.style.height = '100vh';
    popup.style.borderRadius = '0';
  } else {
    popup.classList.remove('mr-sidebar');
    popup.style.position = 'fixed';
    popup.style.height = 'auto';
    popup.style.borderRadius = '';
  }

  // Update toggle button icon
  const toggleBtn = popup.querySelector('.mr-mode-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = viewMode === 'sidebar' ? '◧' : '▤';
    toggleBtn.setAttribute('title', viewMode === 'sidebar' ? 'Switch to modal view' : 'Switch to sidebar view');
  }
}

function startSidebarResize(e: MouseEvent): void {
  isResizing = true;
  document.addEventListener('mousemove', onSidebarResize);
  document.addEventListener('mouseup', stopSidebarResize);
  e.preventDefault();
  e.stopPropagation();
}

function onSidebarResize(e: MouseEvent): void {
  if (!isResizing || !popup) return;

  const newWidth = Math.max(280, window.innerWidth - e.clientX);
  sidebarWidth = Math.min(newWidth, window.innerWidth * 0.5);
  popup.style.width = `${sidebarWidth}px`;
}

function stopSidebarResize(): void {
  isResizing = false;
  document.removeEventListener('mousemove', onSidebarResize);
  document.removeEventListener('mouseup', stopSidebarResize);
  chrome.storage.local.set({ sidebarWidth });
}

function startDrag(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains('mr-resize-handle')) return;

  isDragging = true;
  const rect = popup!.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
  e.preventDefault();
}

function onDrag(e: MouseEvent): void {
  if (!isDragging || !popup) return;

  const x = e.clientX - dragOffset.x;
  const y = e.clientY - dragOffset.y;

  popup.style.left = `${Math.max(0, x)}px`;
  popup.style.top = `${Math.max(0, y)}px`;
}

function stopDrag(): void {
  isDragging = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}

function startResize(e: MouseEvent): void {
  isResizing = true;
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
  e.preventDefault();
  e.stopPropagation();
}

function onResize(e: MouseEvent): void {
  if (!isResizing || !popup) return;

  const rect = popup.getBoundingClientRect();
  const newWidth = Math.max(300, e.clientX - rect.left);
  const newHeight = Math.max(200, e.clientY - rect.top);

  popup.style.width = `${newWidth}px`;
  popup.style.height = `${newHeight}px`;
}

function stopResize(): void {
  isResizing = false;
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
}

function renderSentenceSection(result: LookupResult): string {
  const pinyinWithNumbers = convertNumbersInText(result.fullPinyin);
  const coloredPinyin = pinyinToHtml(pinyinWithNumbers);

  return `
    <div class="mr-sentence-section">
      <div class="mr-original-text">${result.originalText}</div>
      <div class="mr-full-pinyin">${coloredPinyin}</div>
      <button class="mr-audio-btn" data-text="${result.originalText}" title="Play pronunciation">🔊</button>
      ${result.naturalTranslation ? `<div class="mr-natural-translation">${result.naturalTranslation}</div>` : ''}
    </div>
    <div class="mr-divider"></div>
  `;
}

function renderSegmentBlock(segment: WordSegment, index: number, seenWith: Record<string, string[]>): string {
  const pinyinWithNumbers = convertNumbersInText(segment.pinyinTones);
  const coloredPinyin = pinyinToHtml(pinyinWithNumbers);
  const hskBadge = segment.hskLevel ? `<span class="mr-hsk-badge mr-hsk-${segment.hskLevel}">HSK${segment.hskLevel}</span>` : '';

  if (segment.isKnown && !expandedSegments.has(index)) {
    return `
      <div class="mr-segment mr-segment-collapsed" data-index="${index}">
        <div class="mr-segment-header" data-index="${index}">
          <span class="mr-segment-word">${segment.word}</span>
          ${hskBadge}
          <span class="mr-segment-pinyin-inline">${coloredPinyin}</span>
          <span class="mr-segment-def-inline">${segment.definitions[0] || ''}</span>
          <span class="mr-expand-icon">▶</span>
        </div>
      </div>
    `;
  }

  const characterDetails = segment.characters.map((char: CharacterInfo) => {
    const seenList = seenWith[char.radical] || [];
    const seenFiltered = seenList.filter(c => c !== char.character).slice(0, 5);

    return `
      <div class="mr-char-detail">
        <div class="mr-char-header">
          <span class="mr-char-char">${char.character}</span>
        </div>
        <div class="mr-char-info-row">
          ${char.radical ? `<span class="mr-info-item"><span class="mr-label">Radical:</span> ${char.radical}${char.radicalMeaning ? ` (${char.radicalMeaning})` : ''}</span>` : ''}
          ${char.strokeCount ? `<span class="mr-info-item"><span class="mr-label">Strokes:</span> ${char.strokeCount}</span>` : ''}
        </div>
        ${char.components && char.components.length > 0 ? `
          <div class="mr-char-info-row">
            <span class="mr-info-item"><span class="mr-label">Components:</span> ${char.components.join(' ')}</span>
          </div>
        ` : ''}
        ${seenFiltered.length > 0 ? `
          <div class="mr-char-info-row">
            <span class="mr-info-item"><span class="mr-label">Seen in:</span> ${seenFiltered.join(' ')}</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  const googleTranslation = googleTranslations.get(segment.word);
  const googleSection = googleTranslation
    ? `<div class="mr-google-translation"><span class="mr-google-label">Google:</span> ${googleTranslation}</div>`
    : '';
  const translateBtn = googleTranslation
    ? ''
    : `<button class="mr-translate-btn" data-word="${segment.word}" title="Get Google translation">🌐</button>`;

  return `
    <div class="mr-segment mr-segment-expanded" data-index="${index}">
      <div class="mr-segment-header" data-index="${index}">
        <span class="mr-segment-word">${segment.word}</span>
        ${hskBadge}
        <span class="mr-segment-pinyin-inline">${coloredPinyin}</span>
        ${segment.isKnown ? '<span class="mr-expand-icon">▼</span>' : ''}
      </div>
      <div class="mr-segment-content">
        <div class="mr-segment-pinyin">${coloredPinyin}</div>
        <div class="mr-segment-actions">
          <button class="mr-audio-btn mr-audio-btn-small" data-text="${segment.word}" title="Play pronunciation">🔊</button>
          ${translateBtn}
        </div>
        ${googleSection}
        <div class="mr-segment-definitions">
          ${segment.definitions.map(d => `<div class="mr-definition">• ${d}</div>`).join('')}
        </div>
        ${segment.characters.length > 1 ? `
          <div class="mr-char-breakdown">
            <div class="mr-char-breakdown-title">Character Breakdown</div>
            ${characterDetails}
          </div>
        ` : characterDetails}
      </div>
    </div>
  `;
}

function renderContent(result: LookupResult): string {
  const segmentBlocks = result.segments.map((seg, i) =>
    renderSegmentBlock(seg, i, result.seenWith)
  ).join('');

  const backButton = resultHistory.length > 0
    ? `<button class="mr-back-btn" title="Go back">← Back</button>`
    : '';

  return `
    ${backButton}
    ${renderSentenceSection(result)}
    <div class="mr-segments-section">
      <div class="mr-segments-title">Word Breakdown</div>
      ${segmentBlocks}
    </div>
  `;
}

function updatePopupContent(): void {
  if (!popup || !currentResult) return;

  const content = popup.querySelector('.mr-popup-content');
  if (content) {
    content.innerHTML = renderContent(currentResult);
    attachEventListeners();
  }
}

async function fetchGoogleTranslation(word: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=${encodeURIComponent(word)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data && data[0] && data[0][0] && data[0][0][0]) {
      return data[0][0][0];
    }
    return null;
  } catch (e) {
    log('Google Translate error:', e);
    return null;
  }
}

function goBack(): void {
  if (resultHistory.length > 0) {
    currentResult = resultHistory.pop()!;
    expandedSegments.clear();
    updatePopupContent();
  }
}

function attachEventListeners(): void {
  if (!popup) return;

  const backBtn = popup.querySelector('.mr-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      goBack();
    });
  }

  popup.querySelectorAll('.mr-audio-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = (btn as HTMLElement).dataset.text || '';
      playAudio(text);
    });
  });

  popup.querySelectorAll('.mr-translate-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const word = (btn as HTMLElement).dataset.word || '';
      if (!word) return;

      // Show loading state
      (btn as HTMLElement).textContent = '⏳';
      (btn as HTMLElement).style.pointerEvents = 'none';

      const translation = await fetchGoogleTranslation(word);
      if (translation) {
        googleTranslations.set(word, translation);
        updatePopupContent();
      } else {
        (btn as HTMLElement).textContent = '❌';
        setTimeout(() => {
          (btn as HTMLElement).textContent = '🌐';
          (btn as HTMLElement).style.pointerEvents = '';
        }, 1500);
      }
    });
  });

  popup.querySelectorAll('.mr-segment-header').forEach(header => {
    header.addEventListener('click', () => {
      const index = parseInt((header as HTMLElement).dataset.index || '0', 10);
      const segment = currentResult?.segments[index];

      if (segment?.isKnown) {
        if (expandedSegments.has(index)) {
          expandedSegments.delete(index);
        } else {
          expandedSegments.add(index);
        }
        updatePopupContent();
      }
    });
  });
}

function showPopup(x: number, y: number, result: LookupResult, pushToHistory = false): void {
  if (!popup) {
    popup = createPopup();
  }

  const isAlreadyVisible = popup.classList.contains('visible');

  // If popup is already visible and we have a current result, push to history
  if (pushToHistory && currentResult && isAlreadyVisible) {
    resultHistory.push(currentResult);
  }

  currentResult = result;
  expandedSegments.clear();

  updatePopupContent();

  // Apply sidebar or modal styles
  if (viewMode === 'sidebar') {
    applyViewModeStyles();
  } else if (!pushToHistory || !isAlreadyVisible) {
    // Only reposition modal if this is a new popup (not navigating within)
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popupWidth = 360;
    const popupHeight = 400;

    let left = x + 10;
    let top = y + 10;

    if (left + popupWidth > viewportWidth) {
      left = x - popupWidth - 10;
    }

    if (top + popupHeight > viewportHeight) {
      top = viewportHeight - popupHeight - 10;
    }

    left = Math.max(10, left);
    top = Math.max(10, top);

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.width = `${popupWidth}px`;
    popup.style.height = 'auto';
  }

  popup.classList.add('visible');
}

function hidePopup(): void {
  if (popup) {
    popup.classList.remove('visible');
    currentResult = null;
    expandedSegments.clear();
    resultHistory = [];
  }
}

let currentAudio: HTMLAudioElement | null = null;
const audioCache: Map<string, string> = new Map();

async function playAudio(text: string): Promise<void> {
  // Stop any currently playing audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  // Check cache first
  let audioUrl = audioCache.get(text);

  if (!audioUrl) {
    // Request audio from service worker (bypasses page CSP)
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_AUDIO', text });
      if (response?.audioUrl) {
        audioUrl = response.audioUrl;
        audioCache.set(text, audioUrl);
      }
    } catch (e) {
      log('Audio fetch error:', e);
      return;
    }
  }

  if (audioUrl) {
    currentAudio = new Audio(audioUrl);
    currentAudio.play().catch(e => {
      log('Audio playback error:', e);
    });
  }
}

function getSelectedContext(): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return '';

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const parent = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

  if (parent instanceof HTMLElement) {
    const text = parent.textContent || '';
    return text.slice(0, 200);
  }

  return '';
}

function isChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

async function handleSelection(fromContextMenu = false): Promise<void> {
  log('handleSelection called, fromContextMenu:', fromContextMenu);

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    log('No selection or collapsed');
    return;
  }

  const text = selection.toString().trim();
  log('Selected text:', text);

  if (!text || !isChinese(text)) {
    log('Text empty or not Chinese');
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  log('Selection rect:', rect);

  // Check if selection is within the popup
  const isWithinPopup = popup && popup.contains(range.commonAncestorContainer as Node);

  const context = getSelectedContext();
  const sourceUrl = window.location.href;

  const posX = rect.left + window.scrollX;
  const posY = rect.bottom + window.scrollY;

  isLookingUp = true;
  showLoading(rect.left, rect.bottom);
  log('Showing loading indicator, sending LOOKUP request...');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LOOKUP',
      text,
      context,
      sourceUrl,
      skipSave: isWithinPopup,
    }) as LookupResponse;

    log('Got response:', response);
    hideLoading();
    isLookingUp = false;

    if (response.success && response.result) {
      log('Showing popup at', posX, posY, 'pushToHistory:', isWithinPopup);
      showPopup(posX, posY, response.result, isWithinPopup);
    } else {
      log('Response not successful or no result:', response);
    }
  } catch (error) {
    console.error('[MandarinReader] Lookup failed:', error);
    log('Lookup error:', error);
    hideLoading();
    isLookingUp = false;
  }
}

let selectionTimeout: ReturnType<typeof setTimeout> | null = null;
let isSelectingText = false;

document.addEventListener('mousedown', (e) => {
  isSelectingText = true;
  log('mousedown, isLookingUp:', isLookingUp);

  if (isLookingUp) return;

  // In sidebar mode, don't hide on click outside
  if (viewMode === 'sidebar') return;

  if (popup && popup.classList.contains('visible')) {
    const target = e.target as HTMLElement;
    if (!popup.contains(target)) {
      log('Hiding popup (clicked outside)');
      hidePopup();
    }
  }
});

document.addEventListener('mouseup', () => {
  log('mouseup');

  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
  }

  selectionTimeout = setTimeout(() => {
    isSelectingText = false;
    const selection = window.getSelection();
    const text = selection?.toString() || '';
    log('Selection check - text:', text, 'isCollapsed:', selection?.isCollapsed, 'isChinese:', isChinese(text));

    if (selection && !selection.isCollapsed && isChinese(text)) {
      handleSelection();
    }
  }, 150);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && popup?.classList.contains('visible')) {
    log('Escape pressed, hiding popup');
    hidePopup();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  log('Received message:', message);

  if (message.type === 'CONTEXT_MENU_LOOKUP') {
    log('Context menu lookup triggered');
    handleSelection(true);
    sendResponse({ success: true });
  }

  return true;
});

log('Event listeners registered');

export {};
