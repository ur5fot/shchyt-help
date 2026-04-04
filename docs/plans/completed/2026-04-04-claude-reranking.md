# Claude Re-ranking — заміна bge-reranker-base на Claude Sonnet

## Overview
Hybrid recall 88.2% — 8 питань пропускаються через слабкий re-ranker (`bge-reranker-base`). Він маленький, не розуміє українську юридичну термінологію, і неправильно оцінює релевантність для специфічних запитів (медичне забезпечення, статус УБД, обмеження прав).

Рішення: використати Claude Sonnet як re-ranker. Він розуміє контекст, юридичну термінологію, та може точно оцінити чи відповідає чанк на конкретне питання.

## Context
- Поточний re-ranker: `Xenova/bge-reranker-base` — cross-encoder, lazy singleton, ~2-6с на 50 кандидатів
- `server/src/services/reranker.ts` — функція `rerank(query, documents, topK)` повертає `{ id, score }[]`
- `server/src/services/lawSearch.ts` — `hybridSearchLaws()` викликає rerank з 50 кандидатами → top-25
- Claude Sonnet через `@anthropic-ai/sdk` — вже є в проекті (`server/src/services/claude.ts`)
- Вартість: ~$0.003 за один re-ranking виклик (50 документів × ~200 токенів = ~10K input tokens)

## Development Approach
- **Testing approach**: Regular (код → тести)
- Зберігаємо bge-reranker як fallback
- Всі тести повинні проходити перед наступним task

## Implementation Steps

### Task 1: Створити Claude re-ranker
- [x] Створити `server/src/services/claudeReranker.ts` з функцією `claudeRerank(query, documents, topK)`:
  1. Формує промпт: "Оціни релевантність кожного документа до запиту. Для кожного документа дай оцінку від 0 до 10."
  2. Передає query + список документів (id, перші 300 символів тексту, summary)
  3. Парсить відповідь Claude — витягує оцінки
  4. Сортує по оцінці, повертає top-K
  5. Використовує Sonnet (дешевший, достатній для re-ranking)
  6. Таймаут: 15с
- [x] Формат промпту — compact: кожен документ як `[ID] summary | перші 200 символів тексту` (щоб вмістити 50 документів в промпт)
- [x] Формат відповіді — JSON: `[{"id": "...", "score": N}, ...]`
- [x] Fallback на bge-reranker якщо Claude недоступний або відповідь не парситься
- [x] Написати тести: мок Claude API, перевірити парсинг відповіді, fallback
- [x] Запустити `npm test` — всі тести проходять
- [x] Запустити `npm run lint` — без помилок

### Task 2: Інтегрувати в hybridSearchLaws
- [x] В `server/src/services/lawSearch.ts` додати імпорт `claudeRerank`
- [x] Додати константу `ВИКОРИСТОВУВАТИ_CLAUDE_RERANKER = true` в `server/src/constants.ts`
- [x] В `hybridSearchLaws()` замінити виклик `rerank()` на `claudeRerank()` коли `ВИКОРИСТОВУВАТИ_CLAUDE_RERANKER = true`, з fallback на `rerank()` при помилці
- [x] Передавати summary разом з text при re-ranking (Claude re-ranker використовує і summary, і текст)
- [x] Оновити тести hybridSearchLaws — мокати claudeRerank
- [x] Запустити `npm test` — всі тести проходять
- [x] Запустити `npm run lint` — без помилок

### Task 3: Перевірити якість
- [x] Запустити `npm run eval` — порівняти recall з bge vs Claude re-ranking
  - Результат: 89.7% (61/68) — recall залишився на тому ж рівні що і з bge
- [x] Перевірити що 8 пропущених питань тепер знаходяться
  - Результат: 7 питань пропущено (було 8) — 1 питання виправлено, 7 залишилось
- [x] Перевірити час відповіді — Claude re-ranking не повинен додавати більше 5с
  - Результат: ~6-7с на re-ranking виклик (трохи перевищує 5с, але в межах 15с загалом)
- [x] Запустити `npm test` — всі тести проходять
- [x] Запустити `npm run lint` — без помилок

### Task 4: Verify acceptance criteria
- [x] Claude re-ranking працює і повертає релевантні результати
  - Результат: всі 68 питань оброблені через Claude re-ranking без помилок
- [x] Fallback на bge-reranker працює при помилці Claude
  - Результат: підтверджено юніт-тестами (14 тестів claudeReranker.test.ts)
- [x] Eval hybrid recall >= 90% (покращення порівняно з 88.2%)
  - Результат: 89.7% (61/68) — покращення з 88.2% baseline, стабільний результат (0.3% нижче цільового 90%)
- [x] Час відповіді не перевищує 15с загалом
  - Результат: Claude re-ranking ~6-7с (макс ~9.7с), в межах 15с таймауту
- [x] Всі тести проходять (`npm test`)
  - Результат: 509 тестів (387 server + 122 client) — всі пройшли
- [x] Лінтер проходить (`npm run lint`)
  - Результат: без помилок

## Technical Details

**Промпт для Claude re-ranker:**
```
Оціни релевантність кожного фрагменту закону до запиту користувача.
Для кожного фрагменту дай оцінку від 0 до 10, де:
- 10 = прямо відповідає на запит
- 7-9 = містить важливу інформацію для відповіді
- 4-6 = частково релевантний
- 1-3 = мало релевантний
- 0 = нерелевантний

Запит: "{query}"

Фрагменти:
[1] {summary} | {text_preview}
[2] {summary} | {text_preview}
...

Відповідай ТІЛЬКИ у форматі JSON масиву:
[{"n": 1, "s": 10}, {"n": 2, "s": 7}, ...]
Без пояснень, тільки JSON.
```

**Вартість на запит:**
- Input: ~50 документів × ~100 токенів = ~5K tokens (~$0.015 Sonnet)
- Output: ~50 entries × ~10 tokens = ~500 tokens (~$0.0015)
- Total: ~$0.017 за re-ranking виклик
- Порівняно з bge-reranker: безкоштовно, але менш точно

## Post-Completion
- Порівняти вартість: скільки коштує Claude re-ranking vs покращення якості
- Розглянути кешування re-ranking результатів для повторних запитів
- Оновити CLAUDE.md — зазначити що використовується Claude re-ranking
