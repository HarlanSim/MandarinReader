import React, { useEffect, useState, useRef } from 'react';
import type { VocabularyEntry } from '../../shared/types';

function WordDetailPage() {
  const [entry, setEntry] = useState<VocabularyEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const word = params.get('word');

    if (!word) {
      setError('No word specified');
      setLoading(false);
      return;
    }

    loadWord(word);
  }, []);

  async function loadWord(word: string) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_WORD', word });
      if (response.entry) {
        setEntry(response.entry);
      } else {
        setError('Word not found');
      }
    } catch (err) {
      console.error('Failed to load word:', err);
      setError('Failed to load word');
    } finally {
      setLoading(false);
    }
  }

  const audioCache = useRef<Map<string, string>>(new Map());
  const currentAudio = useRef<HTMLAudioElement | null>(null);

  async function playAudio() {
    if (!entry) return;

    // Stop any currently playing audio
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }

    const word = entry.word;
    let audioUrl = audioCache.current.get(word);

    if (!audioUrl) {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_AUDIO', text: word });
        if (response?.audioUrl) {
          audioUrl = response.audioUrl;
          audioCache.current.set(word, audioUrl);
        }
      } catch (e) {
        console.error('Audio fetch error:', e);
        return;
      }
    }

    if (audioUrl) {
      currentAudio.current = new Audio(audioUrl);
      currentAudio.current.play().catch(console.error);
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function goBack() {
    window.location.href = 'vocabulary.html';
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="page">
        <div className="error-state">
          <p>{error || 'Word not found'}</p>
          <button onClick={goBack} className="back-btn">← Back to Vocabulary</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="header">
        <button onClick={goBack} className="back-link">← Back to Vocabulary</button>
      </header>

      <div className="word-detail">
        <div className="word-hero">
          <h1 className="word-large">{entry.word}</h1>
          <div className="word-pinyin-large">{entry.pinyin}</div>
          <button className="audio-btn-large" onClick={playAudio}>
            🔊 Play Pronunciation
          </button>
        </div>

        <section className="section">
          <h2>Definitions</h2>
          <ul className="definitions-list">
            {entry.definitions.map((def, i) => (
              <li key={i}>{def}</li>
            ))}
          </ul>
        </section>

        {entry.characters.length > 0 && (
          <section className="section">
            <h2>Character Breakdown</h2>
            <div className="char-grid">
              {entry.characters.map((char, i) => (
                <div key={i} className="char-card">
                  <div className="char-large">{char.character}</div>
                  <div className="char-info-row">
                    <span className="label">Radical:</span>
                    <span className="value">{char.radical}</span>
                    {char.radicalMeaning && (
                      <span className="meaning">({char.radicalMeaning})</span>
                    )}
                  </div>
                  {char.strokeCount > 0 && (
                    <div className="char-info-row">
                      <span className="label">Strokes:</span>
                      <span className="value">{char.strokeCount}</span>
                    </div>
                  )}
                  {char.components && char.components.length > 0 && (
                    <div className="char-info-row">
                      <span className="label">Components:</span>
                      <span className="value">{char.components.join(' ')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {entry.contexts.length > 0 && (
          <section className="section">
            <h2>Example Contexts</h2>
            <div className="contexts-list">
              {entry.contexts.map((ctx, i) => (
                <div key={i} className="context-card">
                  <p className="context-sentence">{ctx.sentence}</p>
                  {ctx.sourceUrl && (
                    <a
                      href={ctx.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="context-source"
                    >
                      Source →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="section">
          <h2>Lookup History</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{entry.lookupCount}</div>
              <div className="stat-label">Times looked up</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{formatDate(entry.firstSeenAt)}</div>
              <div className="stat-label">First seen</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{formatDate(entry.lastSeenAt)}</div>
              <div className="stat-label">Last seen</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default WordDetailPage;
