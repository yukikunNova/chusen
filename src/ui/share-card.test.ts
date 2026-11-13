import { describe, expect, it } from 'vitest';
import { buildShareModel } from '../domain/share';
import { renderShareCard } from './share-card';

describe('renderShareCard', () => {
  it('canvas に描けない環境では例外を出さず null を返す', async () => {
    // テスト環境（happy-dom）の canvas は 2D 描画に対応していない
    await expect(renderShareCard(buildShareModel(['a', 'b'], null, false))).resolves.toBeNull();
  });
});
