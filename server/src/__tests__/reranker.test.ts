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
      // logits: sigmoid(-1)≈0.27, sigmoid(2)≈0.88, sigmoid(0.5)≈0.62
      const mockModel = vi.fn()
        .mockResolvedValueOnce({ logits: { data: [-1] } })
        .mockResolvedValueOnce({ logits: { data: [2] } })
        .mockResolvedValueOnce({ logits: { data: [0.5] } });
      const mockTokenizer = vi.fn().mockReturnValue({ input_ids: [] });
      const mockPipe = Object.assign(vi.fn(), { tokenizer: mockTokenizer, model: mockModel });
      mockPipeline.mockResolvedValue(mockPipe);

      const документи = створитиДокументи(3);
      const результат = await rerank('грошове забезпечення', документи);

      // Має бути відсортовано за спаданням score
      expect(результат).toHaveLength(3);
      expect(результат[0].id).toBe('chunk-2'); // logit 2 → найвищий
      expect(результат[1].id).toBe('chunk-3'); // logit 0.5
      expect(результат[2].id).toBe('chunk-1'); // logit -1 → найнижчий
    });

    it('обрізає результати до topK', async () => {
      const mockModel = vi.fn()
        .mockResolvedValue({ logits: { data: [0.5] } });
      const mockTokenizer = vi.fn().mockReturnValue({ input_ids: [] });
      const mockPipe = Object.assign(vi.fn(), { tokenizer: mockTokenizer, model: mockModel });
      mockPipeline.mockResolvedValue(mockPipe);

      const документи = створитиДокументи(5);
      const результат = await rerank('запит', документи, 2);

      expect(результат).toHaveLength(2);
    });

    it('передає правильні пари [запит, документ] у tokenizer з text_pair', async () => {
      const mockModel = vi.fn()
        .mockResolvedValue({ logits: { data: [0.5] } });
      const mockTokenizer = vi.fn().mockReturnValue({ input_ids: [] });
      const mockPipe = Object.assign(vi.fn(), { tokenizer: mockTokenizer, model: mockModel });
      mockPipeline.mockResolvedValue(mockPipe);

      const документи = [{ id: 'test-1', text: 'Відпустка військовослужбовця' }];
      await rerank('тривалість відпустки', документи);

      // Tokenizer отримує запит як перший аргумент, text_pair в опціях
      expect(mockTokenizer).toHaveBeenCalledWith('тривалість відпустки', {
        text_pair: 'Відпустка військовослужбовця',
        padding: true,
        truncation: true,
      });
    });

    it('graceful fallback при недоступній моделі — зберігає порядок та обрізає до topK', async () => {
      mockPipeline.mockRejectedValue(new Error('Модель недоступна'));

      const документи = створитиДокументи(10);
      const результат = await rerank('запит', документи, 3);

      // Обрізає до topK і зберігає порядок
      expect(результат).toHaveLength(3);
      expect(результат[0].id).toBe('chunk-1');
      expect(результат[1].id).toBe('chunk-2');
      expect(результат[2].id).toBe('chunk-3');
      expect(результат[0].score).toBeGreaterThan(результат[1].score);
    });

    it('graceful fallback при помилці під час scoring — обрізає до topK', async () => {
      const mockModel = vi.fn()
        .mockResolvedValueOnce({ logits: { data: [0.5] } })
        .mockRejectedValueOnce(new Error('Помилка inference'));
      const mockTokenizer = vi.fn().mockReturnValue({ input_ids: [] });
      const mockPipe = Object.assign(vi.fn(), { tokenizer: mockTokenizer, model: mockModel });
      mockPipeline.mockResolvedValue(mockPipe);

      const документи = створитиДокументи(5);
      const результат = await rerank('запит', документи, 2);

      // Fallback — оригінальний порядок, обрізано до topK
      expect(результат).toHaveLength(2);
      expect(результат[0].id).toBe('chunk-1');
    });

    it('працює з topK за замовчуванням (8)', async () => {
      const mockModel = vi.fn()
        .mockResolvedValue({ logits: { data: [0.5] } });
      const mockTokenizer = vi.fn().mockReturnValue({ input_ids: [] });
      const mockPipe = Object.assign(vi.fn(), { tokenizer: mockTokenizer, model: mockModel });
      mockPipeline.mockResolvedValue(mockPipe);

      const документи = створитиДокументи(15);
      const результат = await rerank('запит', документи);

      expect(результат).toHaveLength(10);
    });
  });
});
