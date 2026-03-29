import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted — щоб змінні були доступні в factory-функціях vi.mock (які hoisted)
const { mockPipeline } = vi.hoisted(() => ({
  mockPipeline: vi.fn(),
}));

vi.mock('@xenova/transformers', () => ({
  pipeline: mockPipeline,
}));

vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { rerank, завантажитиReranker, _скинутиReranker, type RerankDocument } from '../services/reranker';

describe('reranker', () => {
  beforeEach(() => {
    _скинутиReranker();
    mockPipeline.mockReset();
  });

  afterEach(() => {
    _скинутиReranker();
  });

  const створитиДокументи = (кількість: number): RerankDocument[] =>
    Array.from({ length: кількість }, (_, i) => ({
      id: `chunk-${i + 1}`,
      text: `Текст документа ${i + 1}`,
    }));

  describe('завантажитиReranker', () => {
    it('завантажує модель через pipeline', async () => {
      const mockМодель = vi.fn();
      mockPipeline.mockResolvedValue(mockМодель);

      const модель = await завантажитиReranker();

      expect(mockPipeline).toHaveBeenCalledWith('text-classification', 'Xenova/bge-reranker-base', {
        quantized: true,
      });
      expect(модель).toBe(mockМодель);
    });

    it('використовує singleton — викликає pipeline лише раз', async () => {
      const mockМодель = vi.fn();
      mockPipeline.mockResolvedValue(mockМодель);

      await завантажитиReranker();
      await завантажитиReranker();
      await завантажитиReranker();

      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });

    it('повертає null якщо модель не вдалося завантажити', async () => {
      mockPipeline.mockRejectedValue(new Error('Модель не знайдена'));

      const модель = await завантажитиReranker();
      expect(модель).toBeNull();
    });

    it('після помилки завантаження не намагається знову', async () => {
      mockPipeline.mockRejectedValue(new Error('Модель не знайдена'));

      await завантажитиReranker();
      await завантажитиReranker();

      // pipeline викликається лише раз, після помилки — модельНедоступна = true
      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });
  });

  describe('rerank', () => {
    it('повертає порожній масив для порожнього вводу', async () => {
      const результат = await rerank('запит', []);
      expect(результат).toEqual([]);
    });

    it('ранжує документи за score від cross-encoder', async () => {
      const mockМодель = vi.fn()
        .mockResolvedValueOnce([{ label: 'LABEL_0', score: 0.3 }])
        .mockResolvedValueOnce([{ label: 'LABEL_0', score: 0.9 }])
        .mockResolvedValueOnce([{ label: 'LABEL_0', score: 0.6 }]);

      mockPipeline.mockResolvedValue(mockМодель);

      const документи = створитиДокументи(3);
      const результат = await rerank('грошове забезпечення', документи);

      // Має бути відсортовано за спаданням score
      expect(результат).toHaveLength(3);
      expect(результат[0].id).toBe('chunk-2'); // score 0.9
      expect(результат[1].id).toBe('chunk-3'); // score 0.6
      expect(результат[2].id).toBe('chunk-1'); // score 0.3
    });

    it('обрізає результати до topK', async () => {
      const mockМодель = vi.fn()
        .mockResolvedValue([{ label: 'LABEL_0', score: 0.5 }]);

      mockPipeline.mockResolvedValue(mockМодель);

      const документи = створитиДокументи(5);
      const результат = await rerank('запит', документи, 2);

      expect(результат).toHaveLength(2);
    });

    it('передає правильні пари [запит, документ] у модель', async () => {
      const mockМодель = vi.fn()
        .mockResolvedValue([{ label: 'LABEL_0', score: 0.5 }]);

      mockPipeline.mockResolvedValue(mockМодель);

      const документи = [{ id: 'test-1', text: 'Відпустка військовослужбовця' }];
      await rerank('тривалість відпустки', документи);

      expect(mockМодель).toHaveBeenCalledWith(
        { text: 'тривалість відпустки', text_pair: 'Відпустка військовослужбовця' },
        { topk: 1 }
      );
    });

    it('graceful fallback при недоступній моделі — зберігає порядок', async () => {
      mockPipeline.mockRejectedValue(new Error('Модель недоступна'));

      const документи = створитиДокументи(3);
      const результат = await rerank('запит', документи);

      // Порядок зберігається — перший документ має найвищий score
      expect(результат).toHaveLength(3);
      expect(результат[0].id).toBe('chunk-1');
      expect(результат[1].id).toBe('chunk-2');
      expect(результат[2].id).toBe('chunk-3');
      expect(результат[0].score).toBeGreaterThan(результат[1].score);
    });

    it('graceful fallback при помилці під час scoring', async () => {
      const mockМодель = vi.fn()
        .mockResolvedValueOnce([{ label: 'LABEL_0', score: 0.5 }])
        .mockRejectedValueOnce(new Error('Помилка inference'));

      mockPipeline.mockResolvedValue(mockМодель);

      const документи = створитиДокументи(2);
      const результат = await rerank('запит', документи);

      // Fallback — оригінальний порядок
      expect(результат).toHaveLength(2);
      expect(результат[0].id).toBe('chunk-1');
    });

    it('працює з topK за замовчуванням (8)', async () => {
      const mockМодель = vi.fn()
        .mockResolvedValue([{ label: 'LABEL_0', score: 0.5 }]);

      mockPipeline.mockResolvedValue(mockМодель);

      const документи = створитиДокументи(15);
      const результат = await rerank('запит', документи);

      expect(результат).toHaveLength(8);
    });
  });
});
