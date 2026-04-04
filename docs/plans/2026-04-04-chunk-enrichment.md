# Chunk Enrichment — LLM-згенеровані резюме для покращення retrieval

## Overview
Retrieval recall 88.2% — 8 питань пропускаються через те що keyword та vector search знаходять тематично близькі, але не ті конкретні чанки. Наприклад, "медичне забезпечення після поранення" тягне ВЛК замість соцзахисту ст.11.

Рішення: додати до кожного чанка LLM-згенероване резюме (1-2 речення), яке описує ЗМІСТ і КОНТЕКСТ чанка. Резюме використовується для:
- Keyword search (додаткове зважене поле)
- Vector search (ембеддинг резюме замість або разом з текстом)
- Контекст для AI при генерації відповіді

## Context
- 3107 чанків у базі (14 документів)
- Keyword search: поля keywords (×3), title (×2), text (×1) — `server/src/services/lawSearch.ts`
- Vector search: ембеддинг тексту чанка через `Xenova/multilingual-e5-small` (384d) — `server/src/services/embeddings.ts`
- LanceDB schema: id, article, part, title, text, keywords, lawTitle, sourceUrl, vector — `server/src/services/vectorStore.ts`
- LawChunk інтерфейс: `laws/index.ts`
- Парсинг: `scripts/parse-law.ts` — `extractKeywords()` генерує top-8 слів за частотою

## Development Approach
- **Testing approach**: Regular (код → тести)
- Кожен task включає тести
- Всі тести повинні проходити перед наступним task

## Implementation Steps

### Task 1: Додати поле summary до інтерфейсів та бази
- [x] Додати `summary?: string` до `LawChunkRaw` в `scripts/parse-law.ts`
- [x] Додати `summary?: string` до `LawChunk` в `laws/index.ts` — та передавати його при завантаженні
- [x] Додати поле `summary` до LanceDB schema в `server/src/services/vectorStore.ts` — створитиТаблицю, оновитиЧанки, пошукПоВектору, VectorSearchResult
- [x] Оновити keyword search в `server/src/services/lawSearch.ts` — додати summary як зважене поле (вага 2, як title)
- [x] Написати тести для нових полів
- [x] Запустити `npm test` — всі тести проходять
- [x] Запустити `npm run lint` — без помилок

### Task 2: Створити скрипт генерації резюме через Claude API
- [x] Створити `scripts/generate-summaries.ts` — скрипт що:
  1. Читає всі JSON файли з `laws/`
  2. Для кожного чанка без summary генерує резюме через Claude API (Sonnet для економії):
     - Промпт: "Ти — юрист. Напиши 1-2 речення що описують ЗМІСТ цього фрагменту закону. Вкажи: що регулює, кого стосується, які права/обов'язки. Фрагмент: {text}"
     - max_tokens: 100
  3. Зберігає summary в JSON файл
  4. Підтримує `--dry-run` (показує що буде, без API calls)
  5. Підтримує `--file <filename>` (обробити один файл)
  6. Підтримує `--batch-size N` (кількість паралельних запитів, default 5)
  7. Показує прогрес (N/total, час)
- [x] Додати rate limiting — не більше 10 запитів/сек до Claude API
- [x] Додати graceful resume — якщо summary вже є, пропустити чанк
- [x] Написати тест для парсингу відповіді та запису в JSON
- [x] Запустити `npm test` — всі тести проходять
- [x] Запустити `npm run lint` — без помилок

### Task 3: Згенерувати резюме для всіх чанків
- [ ] Додати npm скрипт: `"generate-summaries": "tsx scripts/generate-summaries.ts"` в `package.json`
- [ ] Запустити `npm run generate-summaries -- --dry-run` — перевірити що скрипт працює
- [ ] Запустити `npm run generate-summaries` — згенерувати резюме для всіх 3107 чанків
- [ ] Перевірити що summary додано до всіх чанків (grep по JSON файлах)
- [ ] Переініціалізувати LanceDB: `npm run init-vector-db`
- [ ] Запустити `npm test` — всі тести проходять

### Task 4: Оновити ембеддинги щоб включати summary
- [ ] В `scripts/init-vector-db.ts` — при генерації ембеддингів використовувати `summary + ' ' + text` замість тільки `text` (або `summary` окремо як додатковий vector)
- [ ] Переініціалізувати LanceDB з новими ембеддингами
- [ ] Запустити `npm run eval` — перевірити що recall покращився
- [ ] Запустити `npm test` — всі тести проходять
- [ ] Запустити `npm run lint` — без помилок

### Task 5: Verify acceptance criteria
- [ ] Всі чанки мають непорожній summary (3107/3107)
- [ ] Keyword search використовує summary як зважене поле
- [ ] LanceDB містить summary та оновлені ембеддинги
- [ ] Eval hybrid recall >= 88% (не погіршився)
- [ ] Всі тести проходять (`npm test`)
- [ ] Лінтер проходить (`npm run lint`)

## Technical Details

**Формат summary:**
```json
{
  "id": "про-військовий-обов-st26-ch5-3",
  "article": "Стаття 26",
  "part": "Частина 5, п.3",
  "title": "Звільнення з військової служби",
  "summary": "Вичерпний перелік підстав звільнення контрактників під час мобілізації та воєнного стану: за віком, станом здоров'я (ВЛК), обвинувальним вироком, сімейними обставинами, закінченням контракту укладеного під час ВС, звільненням з полону.",
  "text": "3) під час проведення мобілізації та дії воєнного стану: а) за віком...",
  "keywords": [...]
}
```

**Промпт для генерації:**
```
Ти — юрист з військового права України. Напиши 1-2 речення що описують ЗМІСТ фрагменту закону.
Обов'язково вкажи:
- Що саме регулює цей фрагмент (право, обов'язок, процедура, обмеження)
- Кого стосується (контрактник, мобілізований, офіцер, сім'я)
- Ключові умови або обмеження (воєнний стан, мирний час, строки)
Не цитуй текст — опиши своїми словами. Максимум 2 речення.

Закон: {lawTitle}
Стаття: {article}, {part}
Текст: {text}
```

**Вартість:**
- 3107 чанків × ~300 input tokens × ~50 output tokens
- Sonnet: ~$0.50 за всю базу
- Opus: ~$7.50 за всю базу
- Рекомендація: Sonnet (достатня якість для резюме)

**Keyword search scoring з summary:**
```typescript
// Зараз:
keywords (×3) + title (×2) + text (×1)
// Після:
keywords (×3) + summary (×2) + title (×2) + text (×1)
```

## Post-Completion
- Оновити CLAUDE.md — зазначити що chunk enrichment реалізовано
- Додати summary до promptBuilder.ts контексту (якщо потрібно)
- Розглянути використання summary для re-ranking замість повного тексту
