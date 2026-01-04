Product Requirements Document (PRD)
Product Name (Working)

MandarinReader

1. Problem Statement

Beginning Mandarin learners experience two core problems when attempting to read real-world Chinese content online:

Cognitive overload caused by dense, unfamiliar characters

Fragmented learning due to switching between pages, dictionary sites, and study tools

Existing solutions either:

Over-translate everything (removing learning effort), or

Push flashcards and drills too early (breaking reading flow)

The goal is to create a tool that:

Preserves reading in context

Provides intentional, on-demand assistance

Builds a persistent personal vocabulary knowledge base

Avoids flashcards and forced study modes in the MVP

2. Target User

Primary user (v1):

Beginner Mandarin learner

English speaker

Reads Chinese content online (news, blogs, X, etc.)

Wants to understand content while naturally building vocabulary

Assumptions:

User prefers intentional lookup over automatic translation

Vocabulary and characters are higher priority than grammar

Learning occurs through repeated exposure, not drills

3. Core Learning Philosophy

Attempt first, assist second

Vocabulary-first, grammar-adjacent

Context over drills

Persistence over memorization

Low friction > pedagogical cleverness

The tool should never force learning actions.
It should quietly support reading and accumulate knowledge.

4. MVP Scope (Explicit)
IN SCOPE (MVP)

On-demand word/phrase lookup

Pinyin with tones

Audio pronunciation

Radical + component breakdown

Automatic saving of looked-up words

Persistent vocabulary database

Central vocabulary reference UI

Word detail pages with examples

Multi-device sync via Chrome Sync

OUT OF SCOPE (MVP)

Flashcards

Spaced repetition

Adaptive scaffolding

Grammar lessons

Writing practice

OCR for images

AI-generated long explanations

5. Platform & Architecture Overview

The MVP will be implemented as a private Chrome extension, not published to the Chrome Web Store.

The extension is responsible for:

In-page reading assistance

Data collection

Local-first vocabulary storage

Multi-device sync using Chrome Sync

The vocabulary UI will be implemented as a React-based extension page, not a separate hosted website.

6. Primary User Flow

User visits a webpage containing Chinese text

User reads normally (no overlays by default)

User encounters an unfamiliar word

User holds Alt and highlights the word or phrase

A popup appears with contextual information

The lookup is automatically saved

User continues reading

7. Lookup Interaction Model
7.1 Trigger

Alt + highlight text

Popup appears while Alt is held

Popup disappears when Alt is released (unless pinned)

Rationale:

Lookup is intentional

Prevents overuse

Encourages tolerance of ambiguity

8. Popup Requirements (Core Feature)
8.1 Default View — Meaning

For the selected word or phrase, the popup must display:

Chinese characters

Pinyin with tone marks

Audio pronunciation button

English definition(s)

Optional:

Lookup count (e.g., “Looked up 3 times”)

Pin button

8.2 Progressive Reveal Tabs
Tab 1: Meaning (default)

Characters

Pinyin

Audio

Definitions

Tab 2: Parts (required)

Dictionary radical (部首)

Visual components (if available)

Meaning of radical/components

“Seen in” references:

Other characters the user has encountered with the same component

Design constraints:

Avoid overload

Prefer clarity over completeness

Tab 3: Draw (optional / MVP+)

Stroke order animation

View-only

Powered by open-source stroke order data

9. Vocabulary Persistence (Critical)
9.1 Automatic Saving

Every lookup automatically creates or updates a vocabulary entry

No save confirmation prompt

9.2 Stored Data (Per Word)

Minimum fields:

{
  "word": "但是",
  "pinyin": "dàn shì",
  "definition": "...",
  "lookupCount": 3,
  "firstSeenAt": "...",
  "contexts": [
    {
      "sentence": "...",
      "sourceUrl": "..."
    }
  ],
  "radicals": ["但", "是"],
  "components": ["亻"],
  "audioRef": "..."
}

10. Central Vocabulary Page
10.1 Purpose

A persistent, queryable view of accumulated vocabulary.

This is a reference surface, not a study mode.

10.2 Features

List of saved words

Filters:

Single character vs compound

Part of speech (if available)

HSK level (if available)

Lookup count

Sorting:

Most recent

Most looked up

Alphabetical (pinyin)

10.3 Read-only (MVP)

No manual editing

No tagging

Click-through to word detail only

11. Word Detail Page
11.1 Purpose

Acts as the user’s personal mini-Wiktionary page.

11.2 Required Sections

Word + pinyin + audio

Definitions

Character breakdown

Radical/component explanation

Example sentences:

Prefer sentences from the user’s browsing history

Lookup history

12. Data Sources (Open & Free)

Dictionary: CC-CEDICT / Wiktionary

Character metadata: Unicode Unihan

Radicals & strokes: Unihan

Stroke order: Hanzi Writer / Make Me a Hanzi / Wikimedia SVGs

AI usage is optional and minimal in MVP.

13. Extension Distribution & Sync Strategy
13.1 Distribution Model

The extension will be distributed privately

It will not be published to the Chrome Web Store

13.2 Stable Extension ID Requirement

Chrome Sync associates data with an extension’s ID.
All installations must share the same ID.

13.3 Required Installation Method

Enable Developer Mode in chrome://extensions

Use Pack Extension to generate:

.crx package

.pem private key

Install the .crx on all machines

Use the same Chrome profile with Sync enabled

13.4 Key Management

The .pem file must be preserved

Repacking without the original .pem creates a new ID

The .pem file must not be committed to public repos

14. Sync Scope & Storage Strategy
14.1 Synced Data (chrome.storage.sync)

Quota-aware, compact data only:

Vocabulary entries

Lookup counts

Word metadata:

characters

pinyin

definitions

radicals/components

HSK level

Limited example sentences per word

14.2 Local-Only Data (IndexedDB / chrome.storage.local)

Full page captures

Full sentence corpora

Audio cache

Stroke order assets

Large derived datasets

14.3 Conflict Resolution

Last-write-wins for scalar fields

Lookup counts merged additively

Vocabulary entries de-duplicated by normalized word key

15. Non-Goals (MVP)

No authentication system

No cloud backend

No collaboration

No flashcards

No grammar curriculum

16. Success Criteria (MVP)

Qualitative

Reading Chinese content feels less overwhelming

Lookups feel fast and intentional

Vocabulary accumulates naturally

Quantitative

0 words saved per reading session

Repeat lookups visible

User voluntarily visits the vocabulary page

17. Future Extensions (Explicitly Deferred)

Adaptive pinyin hiding

Recall prompts

Grammar pattern detection

Sentence rewrites

OCR

Writing practice

Spaced repetition

18. Guiding Principle

Reduce reading friction first.
Reinforce learning later.