```text
You are Claude Code. Build the product described below exactly as specified. Prioritize shipping a working MVP over adding extra features. Do not add features not explicitly in scope. If anything is ambiguous, make reasonable implementation choices that keep the scope small and maintainable.

========================
PROJECT: Contextual Mandarin Reader (MVP)
========================

GOAL
- A private Chrome extension (not published) that helps a beginner Mandarin learner read real-world Chinese webpages by allowing intentional, on-demand lookup of selected Chinese text.
- The extension shows a popup with: characters, pinyin with tones, audio pronunciation, and English definition(s).
- It auto-saves every lookup into a persistent, local-first vocabulary database that syncs a compact subset across machines via chrome.storage.sync.
- Provide a central Vocabulary UI and Word Detail pages as extension pages built with React.

CORE PHILOSOPHY (DO NOT VIOLATE)
- Attempt first, assist second.
- No always-on translation, no auto glossing the whole page.
- Lookup must be intentional (Alt + highlight).
- MVP is a reading aid and personal lexicon, not a course or flashcard system.

MVP IN SCOPE
1) In-page Lookup Popup (content script)
- Trigger: user holds ALT and highlights text.
- Popup appears while ALT is held; disappears when ALT is released unless pinned.
- Popup tab 1 (Meaning): characters, pinyin w/ tone marks, audio button, English definitions.
- Popup tab 2 (Parts): dictionary radical (部首) + visual components when available, and a small “Seen in” reference list (other characters encountered with same component).
- Popup tab 3 (Draw): OPTIONAL (may be stubbed for MVP). If implemented, show a view-only stroke order animation or SVG.
- Show lookup count (optional but recommended).

2) Automatic Saving on Lookup
- Every lookup updates/creates a vocabulary entry.
- No confirmation prompts for saving.

3) Vocabulary Database (local-first, sync subset)
- Store core lexicon fields in chrome.storage.sync (quota-aware).
- Store larger data locally (IndexedDB or chrome.storage.local).
- Merge lookupCount additively across devices (best effort).
- De-duplicate entries by normalized key.

4) Vocabulary UI (extension pages)
- A central “My Words” page: list + filters + sorting + click-through.
- Word Detail page: word + pinyin + audio + definitions + parts + examples + lookup history.
- MVP read-only (no manual editing, tagging, reordering).

5) Multi-device Sync
- Use chrome.storage.sync for compact lexicon.
- Must be compatible with the user installing the same packaged .crx on multiple computers.
- Do not implement auth or a cloud backend.

MVP OUT OF SCOPE (DO NOT BUILD)
- Flashcards, spaced repetition, quizzes, recall prompts
- Adaptive scaffolding / pinyin hiding logic
- Grammar lessons or pattern detection
- OCR, image parsing
- AI explanations (unless as a stubbed button; avoid using any paid APIs)
- Full-page translations or automatic pinyin overlays
- Any server-side backend
- Multi-user sharing

========================
TECH STACK REQUIREMENTS
========================

Chrome Extension
- Manifest V3
- Content script for in-page selection + popup rendering
- Background service worker for coordinating storage, audio generation, and messaging
- Extension pages (React) for Vocabulary list and Word Detail views

Frontend UI
- React + TypeScript
- Build with Vite (or an equivalent lightweight setup) to output extension pages (e.g., index.html + assets) that can be loaded as extension pages.
- Minimal, clean UI. Avoid UI frameworks unless needed.

Storage
- Use chrome.storage.sync for compact synced data.
- Use IndexedDB (preferred) or chrome.storage.local for large local-only data (examples corpus, caches).
- Implement a simple data migration/versioning mechanism.

Dictionary + Character Data Sources
- Must be free/open and runnable locally/offline.
- Use CC-CEDICT for word definitions (bundle in repo or download script + local index).
- Use Unihan-derived data for radical/stroke info (bundle minimal subset or download+build step).
- Optional: Wiktionary enrichment later; not required for MVP.
- For Draw (optional), use open stroke-order data (e.g., Hanzi Writer / Make Me a Hanzi / SVGs). If too heavy, stub the tab.

Audio
- Provide a pronunciation button in popup and word detail page.
- Use a low-cost, local method:
  - Prefer Web Speech API (speechSynthesis) for Mandarin if available.
  - Cache generated audio references locally where feasible.
- Keep it simple; do not integrate paid TTS APIs.

Language Handling
- Focus on Mandarin Chinese (Han characters).
- Word segmentation: implement a basic segmentation strategy:
  - Prefer dictionary-based maximum matching using CC-CEDICT entries for phrase lookup.
  - If selection contains multiple characters, attempt longest-match dictionary lookup first.
  - Fallback to per-character lookups if no phrase entry exists.

========================
FUNCTIONAL REQUIREMENTS (DETAILED)
========================

A) Content Script: Selection + Popup
- Detect ALT+selection events robustly.
- When user selects text with ALT held:
  - Get selected text.
  - Normalize (trim whitespace, remove punctuation at edges).
  - Send message to background: lookup request.
- Render popup near selection:
  - Must not break page layout or interfere with normal interactions.
  - Must be dismissible (release ALT) and pinnable.
- Popup contents:
  - Characters (original selection)
  - Pinyin with tone marks (best effort)
  - English definition(s)
  - Audio button (plays pronunciation)
  - Tabs: Meaning (default), Parts, Draw (optional)

B) Lookup Pipeline
- Background receives lookup request:
  - Normalize selection text
  - Find best dictionary match:
    - Try exact phrase lookup in CC-CEDICT index
    - If not found, attempt longest-match subphrases (if reasonable)
    - If still not found, fallback to character-by-character lookups
  - Get pinyin:
    - Prefer CC-CEDICT pinyin for words
    - For single characters, use Unihan readings if needed
  - Convert numeric tones (if present) to tone marks (required for UI)
  - Return structured lookup result to content script for display

C) Parts (Radical + Components)
- For each character in the selected text:
  - Determine dictionary radical + stroke count from Unihan (best effort)
  - Components: if component decomposition data is available, use it; otherwise show only radical.
- “Seen in” references:
  - Maintain a mapping of component/radical -> list of encountered characters (limited list).
  - Show a few examples in the Parts tab.

D) Automatic Save on Lookup
- Each lookup increments lookupCount for the word entry.
- Save:
  - word (string)
  - pinyin (string)
  - definitions (array)
  - lookupCount
  - firstSeenAt
  - lastSeenAt
  - contexts: at least one sentence snippet (best effort) + sourceUrl (cap contexts per word)
  - character parts metadata (radical/components; best effort)
- Save logic must be idempotent and de-dupe by normalized word key.

E) Vocabulary UI (Extension Pages)
- Page 1: My Words
  - Table/list of words
  - Filters:
    - single character vs compound
    - HSK level (if available)
    - lookupCount thresholds
    - sort by: most recent, most looked up, pinyin
  - Click a row -> Word Detail page route

- Page 2: Word Detail
  - word, pinyin, audio
  - definitions
  - character breakdown (radical/components)
  - examples (from saved contexts)
  - lookup history (counts, dates)

- Read-only MVP: no manual editing of entries.

F) Sync Strategy (Quota-aware)
- Synced subset (chrome.storage.sync):
  - compact per-word records:
    - word, pinyin, short definitions, lookupCount, timestamps, parts summary, small contexts cap
  - keep total synced size small (cap stored definitions/contexts lengths)
- Local-only (IndexedDB or local storage):
  - larger contexts, page captures (optional), audio cache, stroke assets
- Conflict resolution:
  - last-write-wins for timestamps
  - lookupCount merges additively where possible (when syncing changes)
  - de-dupe by word key

G) Packaging & Distribution Notes (Documentation only)
- Provide a README describing how to pack the extension into .crx and keep the .pem for stable extension ID and sync.
- Do not implement publishing or store integration.

========================
NON-FUNCTIONAL REQUIREMENTS
========================
- Performance: lookup popup should appear quickly (< ~300ms for cached/local lookups where feasible).
- Resilience: must not crash on non-Chinese selections.
- Privacy: no remote services required; no data sent to third-party servers.
- Maintainability: clear module separation (content script, background, shared utils, UI app, data layer).

========================
DELIVERABLES
========================
1) A working Manifest V3 Chrome extension with:
   - content script popup lookup
   - background lookup + storage
   - React extension pages for vocabulary list and word details
2) Local dictionary data ingestion:
   - Include CC-CEDICT ingestion/indexing step (simple build-time script) OR bundle a small prebuilt index.
   - Include minimal Unihan-derived data for radicals/strokes (script or bundled subset).
3) A README:
   - setup, build, load unpacked
   - packaging (.crx) instructions for stable ID across machines
   - data sync limitations (chrome.storage.sync quotas)
4) Basic tests or sanity checks (where lightweight), especially for:
   - tone mark conversion
   - dictionary lookup matching
   - storage merges

========================
IMPLEMENTATION PLAN (GUIDELINES)
========================
- Start with core: Alt-select -> lookup -> popup -> save.
- Then build vocab UI pages.
- Then add Parts tab.
- Draw tab can be stubbed with “Coming soon” or minimal SVG if easy.

Do not overengineer. Do not add reinforcement systems. Focus on reliable lookup, audio, and persistent synced vocab.
```
