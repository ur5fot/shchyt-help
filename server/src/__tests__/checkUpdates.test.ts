import { describe, it, expect } from 'vitest';
import { computeHash, type LawHashes } from '../../../scripts/generate-hashes';

describe('checkUpdates — хешування та порівняння', () => {
  describe('computeHash', () => {
    it('повертає правильний sha256 для відомого входу', () => {
      // Відомий sha256('test') = 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
      expect(computeHash('test')).toBe(
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
      );
    });

    it('повертає sha256 hex рядок довжиною 64 символи', () => {
      const hash = computeHash('тестовий текст');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('детерміністичний — однаковий вхід дає однаковий хеш', () => {
      const hash1 = computeHash('Стаття 1. Право на відпустку');
      const hash2 = computeHash('Стаття 1. Право на відпустку');
      expect(hash1).toBe(hash2);
    });

    it('різний вхід дає різний хеш', () => {
      const hash1 = computeHash('Стаття 1. Право на відпустку');
      const hash2 = computeHash('Стаття 2. Грошове забезпечення');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('порівняння хешів (логіка з check-updates)', () => {
    /**
     * Функція порівняння з check-updates.ts:
     * const changed = !savedEntry || savedEntry.hash !== newHash;
     */
    function hasLawChanged(hashes: LawHashes, url: string, newHash: string): boolean {
      const savedEntry = hashes[url];
      return !savedEntry || savedEntry.hash !== newHash;
    }

    it('виявляє зміну коли хеш відрізняється', () => {
      const hashes: LawHashes = {
        'https://zakon.rada.gov.ua/laws/show/test': {
          hash: computeHash('старий текст'),
          lastChecked: '2026-03-30',
          chunksCount: 10,
        },
      };
      const newHash = computeHash('новий текст');
      expect(hasLawChanged(hashes, 'https://zakon.rada.gov.ua/laws/show/test', newHash)).toBe(true);
    });

    it('визначає відсутність змін коли хеш збігається', () => {
      const content = '<html>Стаття 1. Текст закону</html>';
      const hash = computeHash(content);
      const hashes: LawHashes = {
        'https://zakon.rada.gov.ua/laws/show/test': {
          hash,
          lastChecked: '2026-03-30',
          chunksCount: 50,
        },
      };
      expect(hasLawChanged(hashes, 'https://zakon.rada.gov.ua/laws/show/test', hash)).toBe(false);
    });

    it('виявляє зміну коли запис відсутній (перший запуск)', () => {
      const hashes: LawHashes = {};
      expect(hasLawChanged(hashes, 'https://zakon.rada.gov.ua/laws/show/test', 'abc123')).toBe(true);
    });

    it('виявляє зміну коли URL відсутній у хешах', () => {
      const hashes: LawHashes = {
        'https://zakon.rada.gov.ua/laws/show/other': {
          hash: 'somehash',
          lastChecked: '2026-03-30',
          chunksCount: 20,
        },
      };
      expect(hasLawChanged(hashes, 'https://zakon.rada.gov.ua/laws/show/test', 'abc123')).toBe(true);
    });
  });
});
