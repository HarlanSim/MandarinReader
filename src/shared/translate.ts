export async function translateToEnglish(text: string): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=${encodeURIComponent(text)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Translation request failed: ${response.status}`);
    }

    const data = await response.json();

    // Google Translate returns nested arrays, extract the translated text
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const translatedParts = data[0]
        .filter((part: unknown) => Array.isArray(part) && part[0])
        .map((part: unknown[]) => part[0]);
      return translatedParts.join('');
    }

    return '';
  } catch {
    return '';
  }
}
