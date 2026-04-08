# SHCHYT — AI-асистент з прав військовослужбовців ЗСУ

Веб-додаток: задаєш питання про права військовослужбовця — отримуєш відповідь з посиланням на конкретну статтю закону.

> ⚠️ Це не юридична консультація. Для прийняття рішень зверніться до військового адвоката.

## Швидкий старт

```bash
# 1. Встановити залежності
npm install

# 2. Налаштувати API ключ
cp .env.example .env
# Відкрити .env та вставити свій ANTHROPIC_API_KEY
# Отримати ключ: https://console.anthropic.com/

# 3. Ініціалізувати векторну базу
npm run init-vector-db

# 4. Запустити
npm run dev
```

Фронтенд: http://localhost:5173 — Бекенд: http://localhost:3002

## Як це працює

```
Питання користувача
    ↓
Гібридний пошук (keyword + vector + HyDE)
    ↓
Claude Sonnet re-ranking (top-50 → top-25)
    ↓
Claude Opus + extended thinking (контекст законів)
    ↓
Верифікація цитат (анти-галюцінація)
    ↓
Відповідь з джерелами та посиланнями
```

**Ключові рішення:**
- **Гібридний пошук** — keyword (стемінг, синоніми, summary) + vector similarity (LanceDB) + HyDE (гіпотетична відповідь → vector search)
- **Claude Sonnet як re-ranker** — розуміє українську юридичну термінологію краще за bge cross-encoder
- **Верифікація цитат** — кожна цитата AI перевіряється fuzzy-match проти наданих чанків, вигадані цитати відкидаються
- **LLM-збагачення чанків** — summary для кожного з 4236 чанків покращує keyword recall з 44% до 53%
- **Retrieval recall: 89.7%** — виміряний на golden test set (68 питань)

## Функціональність

- Відповіді на питання з цитатами конкретних статей законів
- Гібридний пошук по 25 документах (~4236 чанків): закони, підзаконні акти, довідкові матеріали
- Експорт бесіди в PDF
- Генерація .docx документів (рапорти, скарги) — тимчасово вимкнена, на доопрацюванні
- Підказки типових питань для швидкого старту
- Зворотний зв'язок через email (з PDF вкладенням чату)

## База законів

25 документів, ~4236 чанків — покривають ~95% типових питань:

**Закони:** соціальний захист, військовий обов'язок, статус ветеранів, мобілізація, воєнний стан, пенсійне забезпечення, військові злочини (КК), безоплатна правова допомога, дисциплінарний статут, статут внутрішньої служби, зміни щодо мобілізації 2024.

**Підзаконні акти:** проходження служби, грошове забезпечення (КМУ №704, МОУ №260), ВЛК, діловодство (МОУ №40), статус УБД, бронювання, одноразова допомога, реабілітація ветеранів, супровід демобілізованих, зубопротезування.

**Довідкові матеріали:** гарячі лінії, типові документи, актуальні показники (прожитковий мінімум, бойові виплати, оклади).

### Додати новий закон

```bash
npm run update-law -- https://zakon.rada.gov.ua/laws/show/XXXXX "Коротка назва"
```

## Стек

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + pdf-lib
- **Backend:** Node.js + Express + TypeScript
- **AI:** Claude API (claude-opus-4-6) через @anthropic-ai/sdk
- **Векторний пошук:** LanceDB + @xenova/transformers (multilingual-e5-small, 384d)
- **Re-ranking:** Claude Sonnet (fallback: bge-reranker-base)
- **Тести:** Vitest + @testing-library/react
- **Лінтинг:** ESLint + Prettier

Без PostgreSQL, без Docker, без LangChain. Все максимально просто.

## Структура проекту

```
client/      — React фронтенд (Vite, TypeScript, Tailwind CSS)
server/      — Express бекенд (Claude API, пошук, верифікація цитат)
laws/        — JSON-файли законів (чанки з ключовими словами та summary)
data/lancedb/— Векторна база LanceDB (генерується через init-vector-db)
scripts/     — Парсер законів, ініціалізація бази, eval, генерація summary
eval/        — Golden test set (68 питань для оцінки якості)
```

## Команди

```bash
npm run dev              # Клієнт (5173) + сервер (3002)
npm run prod             # Production збірка (3001)
npm test                 # Тести (Vitest)
npm run lint             # ESLint перевірка
npm run format           # Prettier форматування
npm run init-vector-db   # Ініціалізація LanceDB
npm run update-law -- <url>  # Додати/оновити закон
npm run check-updates    # Перевірити оновлення законів на rada.gov.ua
npm run eval             # Retrieval recall (keyword)
npm run eval -- --full   # Повний eval з Claude API
npm run generate-summaries  # LLM-резюме для чанків
```

## Ліцензія

MIT
