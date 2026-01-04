const toneMarks: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à', 'a'],
  e: ['ē', 'é', 'ě', 'è', 'e'],
  i: ['ī', 'í', 'ǐ', 'ì', 'i'],
  o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
  u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
  v: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
};

function getToneVowel(syllable: string): string | null {
  const lower = syllable.toLowerCase();

  if (lower.includes('a')) return 'a';
  if (lower.includes('e')) return 'e';
  if (lower.includes('ou')) return 'o';

  const vowels = ['i', 'o', 'u', 'ü', 'v'];
  let lastVowelIndex = -1;
  let lastVowel: string | null = null;

  for (const v of vowels) {
    const idx = lower.lastIndexOf(v);
    if (idx > lastVowelIndex) {
      lastVowelIndex = idx;
      lastVowel = v;
    }
  }

  return lastVowel;
}

export function numericToToneMark(pinyin: string): string {
  const syllables = pinyin.split(/\s+/);

  return syllables.map(syllable => {
    const match = syllable.match(/^([a-züv]+)(\d)?$/i);
    if (!match) return syllable;

    const [, letters, toneNum] = match;
    if (!toneNum) return letters;

    const tone = parseInt(toneNum, 10);
    if (tone < 1 || tone > 5) return syllable;

    const vowel = getToneVowel(letters);
    if (!vowel) return letters;

    const toneChar = toneMarks[vowel.toLowerCase()]?.[tone - 1];
    if (!toneChar) return letters;

    const vowelIndex = letters.toLowerCase().indexOf(vowel.toLowerCase());
    const isUpperCase = letters[vowelIndex] === letters[vowelIndex].toUpperCase();
    const replacement = isUpperCase ? toneChar.toUpperCase() : toneChar;

    return letters.slice(0, vowelIndex) + replacement + letters.slice(vowelIndex + 1);
  }).join(' ');
}

export function normalizePinyin(pinyin: string): string {
  return pinyin
    .replace(/u:/g, 'ü')
    .replace(/U:/g, 'Ü')
    .replace(/v/g, 'ü')
    .replace(/V/g, 'Ü');
}

export function parseCedictPinyin(pinyin: string): string {
  const normalized = normalizePinyin(pinyin);
  return numericToToneMark(normalized);
}

const numberPinyin: Record<string, string> = {
  '0': 'líng',
  '1': 'yī',
  '2': 'èr',
  '3': 'sān',
  '4': 'sì',
  '5': 'wǔ',
  '6': 'liù',
  '7': 'qī',
  '8': 'bā',
  '9': 'jiǔ',
  '10': 'shí',
  '100': 'bǎi',
  '1000': 'qiān',
  '10000': 'wàn',
};

export function numberToPinyin(num: number): string {
  if (num === 0) return numberPinyin['0'];
  if (num < 0) return 'fù ' + numberToPinyin(-num);

  const parts: string[] = [];

  if (num >= 10000) {
    const wanCount = Math.floor(num / 10000);
    if (wanCount > 1 || num >= 20000) {
      parts.push(numberToPinyin(wanCount));
    }
    parts.push(numberPinyin['10000']);
    num %= 10000;
    if (num > 0 && num < 1000) parts.push(numberPinyin['0']);
  }

  if (num >= 1000) {
    const qianCount = Math.floor(num / 1000);
    if (qianCount > 1) {
      parts.push(numberPinyin[qianCount.toString()] || numberToPinyin(qianCount));
    } else if (qianCount === 1) {
      parts.push(numberPinyin['1']);
    }
    parts.push(numberPinyin['1000']);
    num %= 1000;
    if (num > 0 && num < 100) parts.push(numberPinyin['0']);
  }

  if (num >= 100) {
    const baiCount = Math.floor(num / 100);
    if (baiCount > 1) {
      parts.push(numberPinyin[baiCount.toString()] || numberToPinyin(baiCount));
    } else if (baiCount === 1) {
      parts.push(numberPinyin['1']);
    }
    parts.push(numberPinyin['100']);
    num %= 100;
    if (num > 0 && num < 10) parts.push(numberPinyin['0']);
  }

  if (num >= 10) {
    const shiCount = Math.floor(num / 10);
    if (shiCount > 1) {
      parts.push(numberPinyin[shiCount.toString()]);
    }
    parts.push(numberPinyin['10']);
    num %= 10;
  }

  if (num > 0) {
    parts.push(numberPinyin[num.toString()]);
  }

  return parts.join(' ');
}

export function convertNumbersInText(text: string): string {
  return text.replace(/\d+/g, (match) => {
    const num = parseInt(match, 10);
    return numberToPinyin(num);
  });
}

export function pinyinToHtml(pinyin: string): string {
  if (!pinyin) return '';

  const syllables = pinyin.split(/\s+/);

  return syllables.map(syllable => {
    // Check for tone number at end (for raw CEDICT pinyin)
    const numMatch = syllable.match(/^(.+?)(\d)$/);
    if (numMatch) {
      const [, text, tone] = numMatch;
      const toneMarked = numericToToneMark(syllable);
      return `<span class="mr-tone-${tone}">${toneMarked}</span>`;
    }

    // Check for tone marks in already-converted pinyin
    const tone = detectToneFromMarks(syllable);
    return `<span class="mr-tone-${tone}">${syllable}</span>`;
  }).join(' ');
}

function detectToneFromMarks(syllable: string): number {
  // Tone 1 marks: ā ē ī ō ū ǖ
  if (/[āēīōūǖ]/.test(syllable)) return 1;
  // Tone 2 marks: á é í ó ú ǘ
  if (/[áéíóúǘ]/.test(syllable)) return 2;
  // Tone 3 marks: ǎ ě ǐ ǒ ǔ ǚ
  if (/[ǎěǐǒǔǚ]/.test(syllable)) return 3;
  // Tone 4 marks: à è ì ò ù ǜ
  if (/[àèìòùǜ]/.test(syllable)) return 4;
  // Neutral tone (no mark)
  return 5;
}
