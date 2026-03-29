// Роут POST /api/chat — основний ендпоінт чат-асистента
import { Router, type Request, type Response } from 'express';
import { loadAllLaws } from '../../../laws/index.ts';
import { searchLaws, hybridSearchLaws } from '../services/lawSearch.ts';
import { buildPrompt } from '../services/promptBuilder.ts';
import { askClaude, summarizeHistory, type HistoryMessage } from '../services/claude.ts';
import { ініціалізуватиБД, чиДоступнаБД } from '../services/vectorStore.ts';
import { extractCitations, verifyCitations, removeCitationBlock } from '../services/citationVerifier.ts';
import { МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ, МАКС_ПОВІДОМЛЕНЬ_БЕЗ_СТИСНЕННЯ, МАКС_ПОВІДОМЛЕНЬ_ІСТОРІЇ, МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ_ІСТОРІЇ, ДИСКЛЕЙМЕР } from '../constants.ts';
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

// Спроба ініціалізації LanceDB — graceful, без неї працюємо з keyword пошуком
let lanceDBДоступна = false;

async function ініціалізуватиВекторнийПошук(): Promise<void> {
  try {
    await ініціалізуватиБД();
    lanceDBДоступна = await чиДоступнаБД();
    if (lanceDBДоступна) {
      logger.info('LanceDB ініціалізована — гібридний пошук активний');
    } else {
      logger.warn('LanceDB таблиця не знайдена — використовується keyword пошук. Запустіть: npm run init-vector-db');
    }
  } catch (e) {
    logger.warn({ помилка: e }, 'LanceDB недоступна — використовується keyword пошук');
    lanceDBДоступна = false;
  }
}

// Запускаємо ініціалізацію асинхронно (не блокуємо старт сервера)
ініціалізуватиВекторнийПошук();

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
  verifiedSources?: number;
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

  // Обмежуємо історію для захисту від зловживань
  const sanitizedHistory = history
    ?.slice(-МАКС_ПОВІДОМЛЕНЬ_ІСТОРІЇ)
    .map((msg) => ({
      role: msg.role,
      content: msg.content.slice(0, МАКС_ДОВЖИНА_ПОВІДОМЛЕННЯ_ІСТОРІЇ),
    }));

  if (summary !== undefined && typeof summary !== 'string') {
    res.status(400).json({ error: 'Невалідний формат резюме' });
    return;
  }

  const початок = Date.now();

  try {
    // Перевіряємо LanceDB якщо ще не доступна (могли ініціалізувати після старту)
    if (!lanceDBДоступна) {
      lanceDBДоступна = await чиДоступнаБД();
    }

    // Знаходимо релевантні чанки законів
    // При наявності історії — робимо два пошуки (поточний + з контекстом) і обʼєднуємо
    const пошук = lanceDBДоступна
      ? (q: string) => hybridSearchLaws(q, всіЧанки)
      : (q: string) => Promise.resolve(searchLaws(q, всіЧанки));

    let результатиПошуку = await пошук(trimmed);

    if (sanitizedHistory && sanitizedHistory.length > 0) {
      const останнєПитання = [...sanitizedHistory].reverse().find(m => m.role === 'user');
      if (останнєПитання) {
        // Додатковий пошук з контекстом попереднього питання
        const контекстнийЗапит = `${trimmed} ${останнєПитання.content}`.slice(0, 300);
        const контекстніРезультати = await пошук(контекстнийЗапит);

        // Обʼєднуємо результати: унікальні чанки, сортовані за найкращим score
        const seen = new Set(результатиПошуку.map(r => r.chunk.id));
        for (const r of контекстніРезультати) {
          if (!seen.has(r.chunk.id)) {
            результатиПошуку.push(r);
            seen.add(r.chunk.id);
          }
        }
        результатиПошуку.sort((а, б) => б.score - а.score);
        результатиПошуку = результатиПошуку.slice(0, 8);
        logger.info({ оригінал: trimmed, контекст: останнєПитання.content.slice(0, 50) }, 'Пошук з контекстом');
      }
    }
    const чанки = результатиПошуку.map(р => р.chunk);

    logger.info({ кількістьЧанків: чанки.length, довжинаЗапиту: trimmed.length }, 'Пошук законів завершено');

    // Складаємо промпт з контекстом законів
    const промпт = buildPrompt(trimmed, чанки);

    // Визначаємо чи потрібно стискати історію
    let актуальнаІсторія: HistoryMessage[] | undefined = sanitizedHistory;
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

    // Верифікація цитат — перевіряємо чи Claude не вигадав посилання
    const цитати = extractCitations(відповідь);
    const верифіковані = verifyCitations(цитати, чанки);

    if (верифіковані.length > 0) {
      const невірні = верифіковані.filter(ц => !ц.verified);
      if (невірні.length > 0) {
        logger.warn(
          { неверифіковані: невірні.map(ц => ({ article: ц.article, quote: ц.quote.slice(0, 50) })) },
          'Знайдено неверифіковані цитати у відповіді AI'
        );
      }
      logger.info(
        { всього: верифіковані.length, підтверджено: верифіковані.length - невірні.length },
        'Результат верифікації цитат'
      );
    }

    // Видаляємо блок ЦИТАТИ з відповіді (він для внутрішнього використання)
    відповідь = removeCitationBlock(відповідь);

    // Перевіряємо наявність дисклеймера — додаємо якщо AI пропустив
    if (!відповідь.includes(ДИСКЛЕЙМЕР)) {
      відповідь = відповідь.trimEnd() + '\n\n' + ДИСКЛЕЙМЕР;
    }

    // Збираємо ID чанків підтверджених цитатами
    const верифікованіЧанкиIds = new Set(
      верифіковані.filter(ц => ц.verified && ц.matchedChunkId).map(ц => ц.matchedChunkId)
    );

    // Формуємо джерела для клієнта (дедуплікуємо по унікальному ключу)
    // Якщо є верифіковані цитати — залишаємо тільки підтверджені джерела
    // Якщо цитат не було (Claude не додав блок) — повертаємо всі джерела як раніше (graceful)
    const фільтруватиДжерела = верифікованіЧанкиIds.size > 0;
    const seen = new Set<string>();
    const джерела: SourceItem[] = результатиПошуку
      .filter(р => !фільтруватиДжерела || верифікованіЧанкиIds.has(р.chunk.id))
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

    const кількістьВерифікованих = верифіковані.filter(ц => ц.verified).length;
    const response: ChatResponse = { answer: відповідь, sources: джерела };
    if (кількістьВерифікованих > 0) {
      response.verifiedSources = кількістьВерифікованих;
    }
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

/**
 * Встановлює доступність LanceDB (для тестів).
 */
export function _встановитиLanceDB(доступна: boolean): void {
  lanceDBДоступна = доступна;
}

export default router;
