import React, { useEffect, useState, useMemo } from 'react';
import type { VocabularyEntry } from '../../shared/types';

type SortBy = 'recent' | 'count' | 'pinyin';
type FilterType = 'all' | 'single' | 'compound';

function VocabularyPage() {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [minLookups, setMinLookups] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadVocabulary();
  }, []);

  async function loadVocabulary() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_VOCABULARY' });
      if (response.entries) {
        setEntries(response.entries);
      }
    } catch (error) {
      console.error('Failed to load vocabulary:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredAndSorted = useMemo(() => {
    let result = [...entries];

    if (filterType === 'single') {
      result = result.filter(e => e.word.length === 1);
    } else if (filterType === 'compound') {
      result = result.filter(e => e.word.length > 1);
    }

    if (minLookups > 0) {
      result = result.filter(e => e.lookupCount >= minLookups);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.word.includes(query) ||
        e.pinyin.toLowerCase().includes(query) ||
        e.definitions.some(d => d.toLowerCase().includes(query))
      );
    }

    switch (sortBy) {
      case 'recent':
        result.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        break;
      case 'count':
        result.sort((a, b) => b.lookupCount - a.lookupCount);
        break;
      case 'pinyin':
        result.sort((a, b) => a.pinyin.localeCompare(b.pinyin));
        break;
    }

    return result;
  }, [entries, sortBy, filterType, minLookups, searchQuery]);

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  }

  const audioCache = React.useRef<Map<string, string>>(new Map());
  const currentAudio = React.useRef<HTMLAudioElement | null>(null);

  async function playAudio(word: string, e: React.MouseEvent) {
    e.stopPropagation();

    // Stop any currently playing audio
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }

    // Check cache first
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

  function openWordDetail(word: string) {
    window.location.href = `word-detail.html?word=${encodeURIComponent(word)}`;
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading">Loading vocabulary...</div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="header">
        <h1>📚 My Vocabulary</h1>
        <p className="subtitle">{entries.length} words learned</p>
      </header>

      <div className="filters">
        <div className="filter-row">
          <input
            type="text"
            placeholder="Search words, pinyin, or definitions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-row">
          <div className="filter-group">
            <label>Sort by:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="recent">Most Recent</option>
              <option value="count">Most Looked Up</option>
              <option value="pinyin">Pinyin (A-Z)</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Type:</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as FilterType)}>
              <option value="all">All</option>
              <option value="single">Single Characters</option>
              <option value="compound">Compounds</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Min lookups:</label>
            <select value={minLookups} onChange={(e) => setMinLookups(Number(e.target.value))}>
              <option value="0">Any</option>
              <option value="2">2+</option>
              <option value="5">5+</option>
              <option value="10">10+</option>
            </select>
          </div>
        </div>
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="empty-state">
          {entries.length === 0 ? (
            <>
              <p>No words yet!</p>
              <p className="hint">
                Hold Alt and highlight Chinese text on any webpage to look it up and add it to your vocabulary.
              </p>
            </>
          ) : (
            <p>No words match your filters.</p>
          )}
        </div>
      ) : (
        <div className="word-list">
          {filteredAndSorted.map((entry) => (
            <div
              key={entry.id}
              className="word-card"
              onClick={() => openWordDetail(entry.word)}
            >
              <div className="word-main">
                <span className="word-text">{entry.word}</span>
                <button
                  className="audio-btn"
                  onClick={(e) => playAudio(entry.word, e)}
                  title="Play pronunciation"
                >
                  🔊
                </button>
              </div>
              <div className="word-pinyin">{entry.pinyin}</div>
              <div className="word-definition">
                {entry.definitions.slice(0, 2).join('; ')}
              </div>
              <div className="word-meta">
                <span className="lookup-count">{entry.lookupCount}× looked up</span>
                <span className="last-seen">Last: {formatDate(entry.lastSeenAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default VocabularyPage;
