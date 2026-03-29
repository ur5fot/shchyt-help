# Golden Test Set — автоматична оцінка якості

## Overview
Створити набір з 50+ питань з очікуваними статтями/пунктами закону. Автоматичний скрипт `npm run eval` вимірює: retrieval recall (чи знайшли правильну статтю), citation accuracy (чи AI цитує правильно), response quality. Це фундамент для обʼєктивної оцінки всіх подальших змін.

## Context
- Зараз: якість оцінюється вручну — немає обʼєктивних метрик
- Потрібно: автоматизований eval після кожної зміни в пошуку/промптах
- 10 законів, ~1869 чанків, гібридний пошук + верифікація цитат

## Development Approach
- **Testing approach**: Regular (code first, then tests)
- **CRITICAL: всі тести мають проходити перед початком наступного таску** (`npm test`)

## Progress Tracking
- Завершені елементи позначати `[x]` одразу

## Implementation Steps

### Task 1: Створити golden test set (`eval/golden-set.json`)
- [x] Створити директорію `eval/`
- [x] Створити `eval/golden-set.json` з 50+ питаннями у форматі:
```json
[
  {
    "id": "vacation-basic",
    "question": "Чи маю я право на відпустку під час служби?",
    "expectedChunks": ["про-проходження-служ-p204-rIX-ch0"],
    "expectedArticles": ["Пункт 204"],
    "category": "відпустки"
  }
]
```
- [x] Покрити всі основні категорії:
  - Відпустки (основна, додаткова, лікування, Чорнобиль) — 8 питань
  - Грошове забезпечення (оклад, бойові, затримки) — 11 питань
  - Звільнення/демобілізація — 7 питань
  - Мобілізація (відстрочки, бронювання) — 8 питань
  - Поранення/лікування/ВЛК — 6 питань
  - Статус УБД/пільги — 5 питань
  - Переведення/ротація — 4 питання
  - Воєнний стан — 3 питання
  - Запити російською — 4 питання
- [x] Кожне питання має мати мінімум 1 expectedChunk (ID чанка з laws/*.json)
- [x] Перевірити що всі expectedChunk ID реально існують у базі

### Task 2: Створити eval скрипт (`scripts/eval.ts`)
- [x] Завантажити golden set з `eval/golden-set.json`
- [x] Для кожного питання:
  - Запустити `searchLaws()` (keyword) — перевірити чи expectedChunks є в результатах
  - Запустити `hybridSearchLaws()` (якщо LanceDB доступна) — те саме
  - Записати retrieval recall: % питань де правильний чанк знайдено в top-8
- [x] Вивести підсумкову таблицю:
  - Overall recall (keyword / hybrid)
  - Recall по категоріях
  - Список питань де пошук не знайшов правильну статтю
- [x] Додати npm script: `"eval": "tsx scripts/eval.ts"` в root package.json
- [x] Запустити `npm run eval` — перевірити що працює

### Task 3: Додати eval через Claude API (end-to-end)
- [x] Розширити eval скрипт: для кожного питання також відправити запит до Claude API (через `askClaude`)
- [x] Перевірити citation accuracy: чи цитати з відповіді AI збігаються з expectedArticles
- [x] Перевірити response quality: чи відповідь містить ключові факти (додати поле `expectedFacts` в golden set для 10-15 ключових питань)
- [x] Вивести метрики:
  - Citation accuracy: % правильних цитат
  - Hallucination rate: % вигаданих цитат
  - Fact recall: % згаданих очікуваних фактів
- [x] Додати прапорець `--full` для повного eval з Claude API (за замовчуванням тільки retrieval)
- [x] `npm run eval` — тільки retrieval (швидко, без API)
- [x] `npm run eval -- --full` — повний eval з Claude API (повільно, коштує токени)

### Task 4: Тести та документація
- [ ] Написати тести для eval скрипту (парсинг golden set, підрахунок метрик)
- [ ] Оновити `CLAUDE.md` — додати опис `npm run eval` та golden test set
- [ ] Оновити `README.md` — додати команду eval
- [ ] `npm test` — всі тести проходять
- [ ] `npm run lint` — без помилок
- [ ] Запустити `npm run eval` — фінальний звіт з метриками

## Verification
1. `npm run eval` → таблиця з retrieval recall по категоріях
2. `npm run eval -- --full` → повний звіт з citation accuracy та hallucination rate
3. `npm test` → всі тести проходять
4. Golden set покриває всі 10 законів
5. Кожен expectedChunk ID існує в базі
