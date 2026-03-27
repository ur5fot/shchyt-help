// Роут POST /api/chat — основний ендпоінт чат-асистента
import { Router, type Request, type Response } from 'express';
import { loadAllLaws } from '../../../laws/index.ts';
import { searchLaws } from '../services/lawSearch.ts';
import { buildPrompt } from '../services/promptBuilder.ts';
import { askClaude } from '../services/claude.ts';

const router = Router();

// Кешуємо завантажені чанки при старті
const всіЧанки = loadAllLaws();

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

  if (!message || message.trim().length === 0) {
    res.status(400).json({ error: 'Повідомлення не може бути порожнім' });
    return;
  }

  if (message.trim().length > 2000) {
    res.status(400).json({ error: 'Повідомлення занадто довге (максимум 2000 символів)' });
    return;
  }

  try {
    // Знаходимо релевантні чанки законів
    const результатиПошуку = searchLaws(message, всіЧанки);
    const чанки = результатиПошуку.map(р => р.chunk);

    // Складаємо промпт з контекстом законів
    const промпт = buildPrompt(message, чанки);

    // Запитуємо Claude
    const відповідь = await askClaude(промпт);

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

    res.json({ answer: відповідь, sources: джерела });
  } catch (помилка) {
    console.error('Помилка при обробці запиту:', помилка);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

export default router;
