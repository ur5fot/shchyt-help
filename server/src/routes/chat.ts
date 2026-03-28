// Роут POST /api/chat — основний ендпоінт чат-асистента
import { Router, type Request, type Response } from 'express';
import { loadAllLaws } from '../../../laws/index.ts';
import { searchLaws } from '../services/lawSearch.ts';
import { buildPrompt } from '../services/promptBuilder.ts';
import { askClaude, summarizeHistory, type HistoryMessage } from '../services/claude.ts';
import { МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ, МАКС_ПОВІДОМЛЕНЬ_БЕЗ_СТИСНЕННЯ, ДИСКЛЕЙМЕР } from '../constants.ts';
import { logger } from '../logger.ts';

const router = Router();

// Кешуємо завантажені чанки при старті — критична залежність, без неї сервер непрацездатний
let всіЧанки: ReturnType<typeof loadAllLaws>;
try {
  всіЧанки = loadAllLaws();
  logger.info({ кількістьЧанків: всіЧанки.length }, 'База законів завантажена');
} catch (e) {
  logger.fatal({ помилка: e }, 'Не вдалося завантажити базу законів');
  throw e; // зупиняємо сервер — без бази законів відповіді будуть порожніми
}

interface ChatRequest {
  message?: string;
  history?: HistoryMessage[];
  summary?: string;
}

interface SourceItem {
  law: string;
  article: string;
  sourceUrl: string;
}

interface ChatResponse {
  answer: string;
  sources: SourceItem[];
  summary?: string;
}

function validateHistory(history: unknown): history is HistoryMessage[] {
  if (!Array.isArray(history)) return false;
  return history.every(
    (msg) =>
      typeof msg === 'object' &&
      msg !== null &&
      (msg.role === 'user' || msg.role === 'assistant') &&
      typeof msg.content === 'string',
  );
}

router.post('/', async (req: Request<object, ChatResponse, ChatRequest>, res: Response) => {
  const { message, history, summary } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: 'Повідомлення не може бути порожнім' });
    return;
  }

  const trimmed = message.trim();

  if (trimmed.length > МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ) {
    res.status(400).json({ error: `Повідомлення занадто довге (максимум ${МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ} символів)` });
    return;
  }

  if (history !== undefined && !validateHistory(history)) {
    res.status(400).json({ error: 'Невалідний формат історії чату' });
    return;
  }

  if (summary !== undefined && typeof summary !== 'string') {
    res.status(400).json({ error: 'Невалідний формат резюме' });
    return;
  }

  const початок = Date.now();

  try {
    // Знаходимо релевантні чанки законів
    const результатиПошуку = searchLaws(trimmed, всіЧанки);
    const чанки = результатиПошуку.map(р => р.chunk);

    logger.info({ кількістьЧанків: чанки.length, довжинаЗапиту: trimmed.length }, 'Пошук законів завершено');

    // Складаємо промпт з контекстом законів
    const промпт = buildPrompt(trimmed, чанки);

    // Визначаємо чи потрібно стискати історію
    let актуальнаІсторія: HistoryMessage[] | undefined = history;
    let актуальнеРезюме: string | undefined = summary;
    let новеРезюме: string | undefined;

    if (актуальнаІсторія && актуальнаІсторія.length > МАКС_ПОВІДОМЛЕНЬ_БЕЗ_СТИСНЕННЯ) {
      logger.info({ кількістьПовідомлень: актуальнаІсторія.length }, 'Стиснення історії чату');

      try {
        // Якщо є попереднє резюме — додаємо його як контекст перед сумаризацією
        const повідомленняДляСтиснення: HistoryMessage[] = актуальнеРезюме
          ? [{ role: 'assistant', content: `Попереднє резюме: ${актуальнеРезюме}` }, ...актуальнаІсторія]
          : актуальнаІсторія;

        актуальнеРезюме = await summarizeHistory(повідомленняДляСтиснення);
        актуальнаІсторія = undefined;
        новеРезюме = актуальнеРезюме;
      } catch (помилка) {
        logger.warn({ помилка }, 'Не вдалося стиснути історію, використовуємо останні повідомлення');
        актуальнаІсторія = актуальнаІсторія.slice(-МАКС_ПОВІДОМЛЕНЬ_БЕЗ_СТИСНЕННЯ);
      }
    }

    // Запитуємо Claude
    let відповідь = await askClaude(промпт, актуальнаІсторія, актуальнеРезюме);

    // Перевіряємо наявність дисклеймера — додаємо якщо AI пропустив
    if (!відповідь.includes(ДИСКЛЕЙМЕР)) {
      відповідь = відповідь.trimEnd() + '\n\n' + ДИСКЛЕЙМЕР;
    }

    // Формуємо джерела для клієнта (дедуплікуємо по унікальному ключу)
    const seen = new Set<string>();
    const джерела: SourceItem[] = результатиПошуку
      .map(р => ({
        law: р.chunk.lawTitle,
        article: р.chunk.part
          ? `${р.chunk.article}, ${р.chunk.part}`
          : р.chunk.article,
        sourceUrl: р.chunk.sourceUrl,
      }))
      .filter(д => {
        const key = `${д.law}|${д.article}|${д.sourceUrl}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const часВідповіді = Date.now() - початок;
    logger.info({ часВідповідіМс: часВідповіді, кількістьДжерел: джерела.length }, 'Запит оброблено');

    const response: ChatResponse = { answer: відповідь, sources: джерела };
    if (новеРезюме) {
      response.summary = новеРезюме;
    }

    res.json(response);
  } catch (помилка) {
    const часВідповіді = Date.now() - початок;
    logger.error({ помилка, часВідповідіМс: часВідповіді }, 'Помилка при обробці запиту');

    // Зрозуміле повідомлення при відсутньому API ключі
    if (помилка instanceof Error && помилка.message.includes('ANTHROPIC_API_KEY')) {
      res.status(503).json({ error: 'API ключ не налаштований. Додайте ANTHROPIC_API_KEY у файл .env' });
      return;
    }

    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

export default router;
