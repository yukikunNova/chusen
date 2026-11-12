import { describe, expect, it } from 'vitest';
import { formatResult } from './result-text';

describe('formatResult', () => {
  it('番号付きの行にする', () => {
    expect(formatResult(['佐藤', '田中'])).toBe('1. 佐藤\n2. 田中');
  });
  it('空なら空文字', () => {
    expect(formatResult([])).toBe('');
  });
});
