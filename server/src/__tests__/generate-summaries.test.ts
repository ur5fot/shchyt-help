// Тести для скрипта генерації резюме
import { describe, it, expect } from 'vitest';
import { buildUserPrompt, parseSummaryResponse, parseArgs } from '../../../scripts/generate-summaries';

describe('buildUserPrompt', () => {
  it('формує промпт з усіма полями', () => {
    const chunk = {
      id: 'test-1',
      article: 'Стаття 10',
      part: 'Частина 3',
      title: 'Відпустки',
      text: 'Військовослужбовцям надається відпустка...',
      keywords: ['відпустка'],
    };

    const result = buildUserPrompt(chunk, 'Закон про соціальний захист');
    expect(result).toContain('Закон: Закон про соціальний захист');
    expect(result).toContain('Стаття: Стаття 10, Частина 3');
    expect(result).toContain('Текст: Військовослужбовцям надається відпустка...');
  });

  it('формує промпт без part', () => {
    const chunk = {
      id: 'test-2',
      article: 'Стаття 5',
      part: '',
      title: '',
      text: 'Текст статті',
      keywords: [],
    };

    const result = buildUserPrompt(chunk, 'Закон');
    expect(result).toContain('Стаття: Стаття 5');
    expect(result).not.toContain(', Частина');
  });
});

describe('parseSummaryResponse', () => {
  it('прибирає зайві пробіли та нові рядки', () => {
    const input = '  Перше речення.\nДруге речення.  ';
    expect(parseSummaryResponse(input)).toBe('Перше речення. Друге речення.');
  });

  it('повертає порожній рядок для порожнього вводу', () => {
    expect(parseSummaryResponse('')).toBe('');
  });

  it('замінює кілька нових рядків одним пробілом', () => {
    const input = 'Рядок 1\n\n\nРядок 2';
    expect(parseSummaryResponse(input)).toBe('Рядок 1 Рядок 2');
  });
});

describe('parseArgs', () => {
  it('парсить --dry-run', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.dryRun).toBe(true);
    expect(args.batchSize).toBe(5);
    expect(args.file).toBeUndefined();
  });

  it('парсить --file', () => {
    const args = parseArgs(['--file', 'pro-soczakhyst.json']);
    expect(args.file).toBe('pro-soczakhyst.json');
  });

  it('парсить --batch-size', () => {
    const args = parseArgs(['--batch-size', '10']);
    expect(args.batchSize).toBe(10);
  });

  it('парсить всі аргументи разом', () => {
    const args = parseArgs(['--dry-run', '--file', 'test.json', '--batch-size', '3']);
    expect(args.dryRun).toBe(true);
    expect(args.file).toBe('test.json');
    expect(args.batchSize).toBe(3);
  });

  it('повертає defaults без аргументів', () => {
    const args = parseArgs([]);
    expect(args.dryRun).toBe(false);
    expect(args.batchSize).toBe(5);
    expect(args.file).toBeUndefined();
  });

  it('fallback на 5 при невалідному batch-size', () => {
    const args = parseArgs(['--batch-size', 'abc']);
    expect(args.batchSize).toBe(5);
  });
});
