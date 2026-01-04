import { describe, it, expect } from 'vitest';
import { numericToToneMark, parseCedictPinyin } from './pinyin';

describe('numericToToneMark', () => {
  it('converts tone 1', () => {
    expect(numericToToneMark('ma1')).toBe('mā');
    expect(numericToToneMark('ni3 hao3')).toBe('nǐ hǎo');
  });

  it('converts tone 2', () => {
    expect(numericToToneMark('ma2')).toBe('má');
  });

  it('converts tone 3', () => {
    expect(numericToToneMark('ma3')).toBe('mǎ');
  });

  it('converts tone 4', () => {
    expect(numericToToneMark('ma4')).toBe('mà');
  });

  it('converts tone 5 (neutral)', () => {
    expect(numericToToneMark('ma5')).toBe('ma');
  });

  it('handles multiple syllables', () => {
    expect(numericToToneMark('zhong1 guo2')).toBe('zhōng guó');
  });

  it('handles ü character', () => {
    expect(numericToToneMark('nü3')).toBe('nǚ');
    expect(numericToToneMark('lü4')).toBe('lǜ');
  });

  it('handles v as ü', () => {
    expect(numericToToneMark('nv3')).toBe('nǚ');
  });

  it('places tone mark on correct vowel', () => {
    expect(numericToToneMark('dui4')).toBe('duì');
    expect(numericToToneMark('liu2')).toBe('liú');
    expect(numericToToneMark('lao3')).toBe('lǎo');
  });
});

describe('parseCedictPinyin', () => {
  it('parses CEDICT format pinyin', () => {
    expect(parseCedictPinyin('ni3 hao3')).toBe('nǐ hǎo');
    expect(parseCedictPinyin('Zhong1 guo2')).toBe('Zhōng guó');
  });

  it('handles u: notation', () => {
    expect(parseCedictPinyin('nu:3')).toBe('nǚ');
  });
});
