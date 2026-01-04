# Mandarin Reader

A private Chrome extension that helps beginner Mandarin learners read real-world Chinese webpages through intentional, on-demand lookup of selected Chinese text.

## Features

- **Alt + Highlight Lookup**: Hold Alt and highlight any Chinese text to see its meaning
- **Pinyin with Tone Marks**: See proper pinyin pronunciation for every word
- **Audio Pronunciation**: Listen to native pronunciation using Web Speech API
- **Character Breakdown**: View radicals and components for each character
- **Vocabulary Tracking**: Automatically saves every lookup to your personal word list
- **Multi-device Sync**: Vocabulary syncs across devices via Chrome's storage sync
- **Clean Vocabulary UI**: Browse and search your learned words

## Philosophy

- **Attempt first, assist second**: No always-on translation or auto-glossing
- **Intentional lookup**: You control when to look things up (Alt + highlight)
- **Reading aid only**: Not a course or flashcard system

## Setup

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install dependencies
npm install

# Build dictionary data (downloads CC-CEDICT)
npm run build:dict

# Generate icons
npx tsx scripts/generate-icons.ts

# Build the extension
npm run build
```

### Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist` folder

## Usage

1. Navigate to any webpage with Chinese text
2. Hold **Alt** and highlight Chinese text with your mouse
3. A popup will appear showing:
   - The characters
   - Pinyin with tone marks
   - English definitions
   - Audio button for pronunciation
4. Switch tabs to see:
   - **Parts**: Radical and component breakdown
   - **Draw**: Stroke order (coming soon)
5. Release Alt to dismiss, or click 📌 to pin the popup
6. Click the extension icon to access your vocabulary list

## Packaging for Distribution

To create a `.crx` file for installing on multiple machines with synced vocabulary:

### First Time (Generate Key)

```bash
# Create a builds directory
mkdir -p builds

# Pack the extension (Chrome will generate a .pem key file)
# Go to chrome://extensions
# Click "Pack extension"
# Select the dist folder
# Leave "Private key file" empty for first pack
# Save the generated .pem file securely!
```

### Subsequent Builds

```bash
# Pack with the same key to maintain extension ID
# Go to chrome://extensions
# Click "Pack extension"
# Select the dist folder
# Select your saved .pem file as "Private key file"
```

**Important**: Keep your `.pem` file safe and use the same one for all builds. This ensures:
- The extension keeps the same ID across machines
- Vocabulary sync works correctly between devices
- Updates work without losing data

## Data Storage

### Synced (chrome.storage.sync)
- Word, pinyin, definitions (truncated)
- Lookup count, first/last seen timestamps
- Limited to ~100KB total

### Local (IndexedDB)
- Full definitions
- Context sentences
- Component mappings
- No size limit

## Dictionary Data

- **CC-CEDICT**: Open-source Chinese-English dictionary (~120k entries)
- **Unihan**: Unicode character database for radicals and strokes
- Data is bundled with the extension (no network requests during lookup)

## Development

```bash
# Watch mode (rebuilds on changes)
npm run dev

# Run tests
npm test
```

## Project Structure

```
src/
├── background/           # Service worker
│   └── service-worker.ts
├── content/              # Content script (in-page popup)
│   ├── content.ts
│   └── content.css
├── pages/                # Extension pages (React)
│   ├── vocabulary/
│   └── word-detail/
├── shared/               # Shared utilities
│   ├── types.ts
│   ├── dictionary.ts
│   ├── storage.ts
│   └── pinyin.ts
scripts/
├── build-dictionary.ts   # Dictionary data builder
└── generate-icons.ts     # Icon generator
```

## Limitations

- Sync quota: ~100KB for chrome.storage.sync
- Audio uses browser's built-in TTS (quality varies by system)
- Stroke order view is not yet implemented
- No manual editing of vocabulary entries

## License

Private use only.
