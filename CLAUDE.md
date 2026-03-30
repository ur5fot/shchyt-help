# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Мова проекту

Весь проект ведеться **українською**: коментарі в коді, назви змінних (де доречно), UI-тексти, документація, повідомлення про помилки, commit-повідомлення. Англійською лишаються тільки технічні назви (імена бібліотек, стандартні патерни, назви файлів).

## Огляд проекту

**SHCHYT** — AI-асистент з прав військовослужбовців ЗСУ. Локальний веб-додаток: задаєш питання — отримуєш відповідь з посиланням на конкретну статтю закону. Може згенерувати рапорт або скаргу у PDF.

Повна специфікація — у `shchyt-AGENTS.md`. Прочитай перед початком будь-якої роботи.

## Стек

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + pdf-lib (PDF на клієнті)
- **Backend:** Node.js + Express + TypeScript
- **AI:** Claude API (`claude-sonnet-4-20250514`) через `@anthropic-ai/sdk`
- **Векторний пошук:** LanceDB (вбудована векторна БД) + `@xenova/transformers` (ембеддинги: `Xenova/multilingual-e5-small`, 384d; re-ranking: `Xenova/bge-reranker-base`)
- **База законів:** JSON-файли + LanceDB векторна база (генерується локально)
- **Без** Docker, PostgreSQL, pgvector, Ollama

## Команди

```bash
npm install              # Встановити залежності
npm run dev              # Запустити клієнт (5173) і сервер (3001) одночасно
npm test                 # Запустити всі тести (Vitest)
npm run lint             # Перевірити код ESLint
npm run lint:fix         # Автоматично виправити ESLint-помилки
npm run format           # Форматувати код Prettier
npm run init-vector-db   # Ініціалізувати векторну базу LanceDB (потрібно після npm install)
npm run update-law -- <url>  # Оновити/додати закон з zakon.rada.gov.ua
npm run eval             # Оцінка якості пошуку (retrieval recall по golden test set)
npm run eval -- --full   # Повний eval з Claude API (citation accuracy, fact recall)
```

Фронтенд: `http://localhost:5173`
Бекенд API: `http://localhost:3001`

## Архітектура

```
client/      → React фронтенд (Vite), проксі /api на localhost:3001
server/      → Express бекенд, єдиний ендпоінт POST /api/chat
laws/        → JSON-файли українських законів (чанки з ключовими словами)
data/lancedb/→ Векторна база LanceDB (генерується локально через init-vector-db)
templates/   → Шаблони документів (рапорт, скарга) у JSON
scripts/     → Парсер законів, ініціалізація векторної бази, оновлення законів, eval
eval/        → Golden test set (56 питань з очікуваними чанками та статтями)
```

**Потік запиту:** Питання користувача → `lawSearch.ts` знаходить релевантні чанки через гібридний пошук (keyword + vector similarity через LanceDB + HyDE hypothesis vector search) + cross-encoder re-ranking (top-20 → top-8) → `promptBuilder.ts` складає промпт з контекстом законів → `claude.ts` відправляє в Claude API → `citationVerifier.ts` перевіряє цитати AI проти наданих чанків → відповідь з верифікованими джерелами повертається клієнту. Якщо LanceDB не ініціалізована — автоматичний fallback на keyword пошук.

**Генерація PDF** відбувається повністю на клієнті через pdf-lib. Жодні дані не надсилаються назовні.

## Ключові правила

- Весь UI та відповіді — **українською**
- System prompt вимагає цитувати конкретні статті закону — ніколи не вигадувати цитати
- Кожна відповідь AI завершується: "⚠️ Це не юридична консультація. Для прийняття рішень зверніться до військового адвоката."
- Формат JSON законів: кожен файл має `title`, `short_title`, `source_url`, `last_updated` та `chunks[]`, де кожен чанк має `id`, `article`, `part`, `title`, `text`, `keywords`
- API ключ зберігається в `.env` як `ANTHROPIC_API_KEY` — ніколи не комітити цей файл

## Сервіси та ключові модулі

- **lawSearch.ts** — гібридний пошук по законах: keyword (стемінг, синоніми, поріг 3 бали) + vector similarity через LanceDB (0.4 keyword + 0.6 vector) + HyDE (hypothesis vector search) + cross-encoder re-ranking (top-20 → top-8)
- **hyde.ts** (сервер) — HyDE (Hypothetical Document Embeddings): генерує коротку гіпотетичну відповідь через Claude API (max_tokens: 200), ембеддинг гіпотези використовується для додаткового vector пошуку. Фільтрація коротких запитів (<15 символів), graceful fallback при помилці API
- **reranker.ts** (сервер) — cross-encoder re-ranking через `Xenova/bge-reranker-base`, lazy singleton завантаження, graceful fallback якщо модель недоступна
- **embeddings.ts** (сервер) — генерація ембеддингів через `@xenova/transformers` (модель `Xenova/multilingual-e5-small`, 384d), lazy завантаження
- **vectorStore.ts** (сервер) — робота з LanceDB: ініціалізація, створення таблиці, cosine similarity пошук, upsert чанків
- **citationVerifier.ts** (сервер) — верифікація цитат AI: парсинг блоку `ЦИТАТИ:` з відповіді, fuzzy-перевірка кожної цитати проти наданих чанків (нормалізація + 80% порогове співпадіння слів), видалення блоку цитат з відповіді користувачу. Захист від галюцінацій — вигадані цитати не потрапляють у sources
- **claude.ts** (сервер) — обгортка Claude API: `askClaude` з підтримкою історії, `summarizeHistory` для стиснення діалогу (>10 повідомлень)
- **templateDetector.ts** (клієнт) — виявлення шаблонів документів у відповідях AI через масив паттернів
- **pdfGenerator.ts** (клієнт) — генерація PDF з санітизацією полів (trim, видалення спецсимволів, обмеження довжини)
- **logger.ts** (сервер) — структуроване логування через pino (JSON в production, pretty в dev)
- **app.ts** — Express з rate limiting (20 запитів/хвилину на IP)
- **evalMetrics.ts** (сервер) — утиліти для eval: нормалізація статей, перевірка фактів, підрахунок retrieval recall, citation accuracy, hallucination rate
- **scripts/eval.ts** — скрипт оцінки якості: `npm run eval` (retrieval recall по golden set, 56 питань), `npm run eval -- --full` (повний eval з Claude API: citation accuracy, fact recall)

## База законів

10 документів, ~1869 чанків — покривають ~95% типових питань:

Закони:
1. «Про соціальний і правовий захист військовослужбовців та членів їх сімей» — грошове забезпечення, відпустки, соцгарантії
2. «Про військовий обов'язок і військову службу» — мобілізація, звільнення, переведення
3. «Про статус ветеранів війни, гарантії їх соціального захисту» — статус УБД, пільги
4. «Про мобілізаційну підготовку та мобілізацію» — мобілізація, відстрочки, бронювання
5. «Про правовий режим воєнного стану» — обмеження прав, повноваження командирів
6. Закон №3633-IX (зміни щодо мобілізації від 11.04.2024) — оновлення обліку, мобілізації, служби

Підзаконні акти:
8. Положення про проходження військової служби у ЗСУ — порядок служби, звільнення, переведення, ротація
9. Постанова КМУ №704 про грошове забезпечення — оклади, надбавки, бойові виплати
10. Порядок виплати грошового забезпечення (Наказ МОУ №260) — деталі виплат, затримки, перерахунки
11. Положення про ВЛК у ЗСУ — військово-лікарська експертиза, придатність до служби

## Плановані покращення якості AI

Пріоритезовані за впливом на якість відповідей:

### ~~1. Cross-encoder re-ranking~~ — РЕАЛІЗОВАНО
Гібридний пошук (top-20) пропускається через cross-encoder `Xenova/bge-reranker-base` для отримання top-8. Re-ranker бачить запит І документ разом (`reranker.ts`). Retrieval recall покращився з 42.9% до 87.5%. Graceful fallback: якщо модель недоступна — працює без re-ranking.

### ~~2. Верифікація цитат (анти-галюцінація)~~ — РЕАЛІЗОВАНО
System prompt інструктує Claude додавати блок `ЦИТАТИ:` з посиланнями у форматі `- Стаття N, Частина N | "точна цитата"`. Сервер програмно перевіряє кожну цитату проти наданих чанків через fuzzy match (`citationVerifier.ts`). Неверифіковані цитати логуються як warning, sources фільтруються до підтверджених. Graceful degradation: якщо Claude не додав блок ЦИТАТИ — все працює як раніше.

### ~~3. Golden test set (оцінка якості)~~ — РЕАЛІЗОВАНО
56 питань у `eval/golden-set.json` з очікуваними чанками та статтями по 9 категоріях. `npm run eval` вимірює retrieval recall (keyword), `npm run eval -- --full` додає citation accuracy, hallucination rate та fact recall через Claude API. Метрики реалізовані в `evalMetrics.ts`.

### 4. Chunk enrichment (збагачення чанків)
Додати до кожного чанка: LLM-згенероване резюме (1-2 речення), повний ієрархічний шлях (закон → розділ → стаття → частина). Покращує і retrieval, і генерацію відповідей.

### ~~5. HyDE (Hypothetical Document Embeddings)~~ — РЕАЛІЗОВАНО
Для кожного запиту Claude генерує коротку гіпотетичну відповідь (max_tokens: 200), ембеддинг якої використовується для додаткового vector пошуку в LanceDB (`hyde.ts`). Результати HyDE об'єднуються з оригінальним пошуком (дедуплікація з кращою оцінкою), потім проходять через re-ranking. Retrieval recall покращився з 80.4% до 83.9%. Graceful fallback: якщо Claude API недоступний — пошук працює без HyDE. Додає ~3-5с на запит (один короткий Claude API виклик).

### Архітектурні рішення
- **LanceDB** залишається оптимальним вибором для ~2000 чанків (PostgreSQL+pgvector — overkill)
- **Без LangChain/LlamaIndex** — для нашого масштабу краще 3 функції вручну, ніж важкий framework
- **Без fine-tuning LLM** — prompt engineering + якісний RAG достатньо для юридичного домену
