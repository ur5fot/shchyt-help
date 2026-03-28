// Роут POST /api/chat — основний ендпоінт чат-асистента
import { Router, type Request, type Response } from 'express';
import { loadAllLaws } from '../../../laws/index.ts';
import { searchLaws } from '../services/lawSearch.ts';
import { buildPrompt } from '../services/promptBuilder.ts';
import { askClaude } from '../services/claude.ts';
import { МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ, ДИСКЛЕЙМЕР } from '../constants.ts';
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
}

interface SourceItem {
  law: string;
  article: string;
  sourceUrl: string;
}

interface ChatResponse {
  answer: string;
  sources: SourceItem[];
}

router.post('/', async (req: Request<object, ChatResponse, ChatRequest>, res: Response) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: 'Повідомлення не може бути порожнім' });
    return;
  }

  const trimmed = message.trim();

  if (trimmed.length > МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ) {
    res.status(400).json({ error: `Повідомлення занадто довге (максимум ${МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ} символів)` });
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

    // Запитуємо Claude
    let відповідь = await askClaude(промпт);

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

    res.json({ answer: відповідь, sources: джерела });
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
