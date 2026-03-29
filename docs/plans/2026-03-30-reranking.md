# Cross-encoder re-ranking для покращення пошуку

## Overview
Додати cross-encoder re-ranking після гібридного пошуку. Retrieve top-20 → re-rank через `BAAI/bge-reranker-v2-m3` → top-8. Cross-encoder бачить запит І документ разом, що дає значно кращу релевантність. Мета: підняти retrieval recall з 42.9% (keyword) до 60-70%.

## Context
- Golden test set показав: overall recall 42.9%, грошове забезп. 9%, мобілізація 13%
- Поточний пошук: keyword (стемінг + синоніми) + vector (LanceDB cosine similarity)
- Проблема: bi-encoder ембеддинги порівнюють запит і документ окремо, cross-encoder бачить їх разом
- `bge-reranker-v2-m3` — мультимовна модель, підтримує українську, працює локально через `@xenova/transformers`

## Development Approach
- **Testing approach**: Regular (code first, then tests)
- **CRITICAL: всі тести мають проходити перед початком наступного таску** (`npm test`)
- **CRITICAL: запустити `npm run eval` до і після для порівняння**

## Progress Tracking
- Завершені елементи позначати `[x]` одразу

## Implementation Steps

### Task 1: Додати re-ranker модуль (`server/src/services/reranker.ts`)
- [x] Створити модуль з lazy singleton завантаженням моделі `Xenova/bge-reranker-v2-m3` (або `cross-encoder/ms-marco-MiniLM-L-6-v2` якщо bge не працює з @xenova/transformers)
- [x] Функція `завантажитиReranker()` — lazy singleton, pipeline для text-classification або custom cross-encoder
- [x] Функція `rerank(query: string, documents: {id: string, text: string}[], topK?: number): Promise<{id: string, score: number}[]>` — приймає запит і масив документів, повертає відсортований масив з scores
- [x] Обробка помилок — якщо модель не завантажилась, повертати документи без зміни порядку (graceful fallback)
- [x] Написати тести з мок-моделлю
- [x] `npm test` — всі тести проходять

### Task 2: Інтегрувати re-ranking в hybridSearchLaws
- [ ] В `server/src/services/lawSearch.ts` — після гібридного пошуку (top-20) пропустити через `rerank()`
- [ ] Збільшити initial retrieval з top-8 до top-20 для гібридного пошуку (більше кандидатів для re-ranking)
- [ ] Після re-ranking обрізати до top-8
- [ ] Graceful fallback: якщо re-ranker недоступний — повернути результати без re-ranking
- [ ] Логувати: "Re-ranking: N кандидатів → M результатів"
- [ ] Написати тести
- [ ] `npm test` — всі тести проходять

### Task 3: Запустити eval та порівняти
- [ ] Запустити `npm run eval` — зафіксувати нові метрики
- [ ] Порівняти recall до і після re-ranking
- [ ] Якщо recall погіршився — діагностувати та виправити
- [ ] Оновити eval golden set якщо потрібно (деякі expectedChunks можуть бути неточними)

### Task 4: Оптимізація та документація
- [ ] Перевірити час відповіді — re-ranking не має додавати більше 1-2 секунди
- [ ] Якщо повільно — розглянути кешування або меншу модель
- [ ] Оновити `CLAUDE.md` — додати опис re-ranking
- [ ] Позначити re-ranking як реалізований у розділі "Плановані покращення"
- [ ] `npm test` — всі тести проходять
- [ ] `npm run lint` — без помилок

## Verification
1. `npm run eval` → retrieval recall вищий ніж 42.9%
2. `npm test` → всі тести проходять
3. Час відповіді — не більше +2с на re-ranking
4. Graceful fallback: якщо re-ranker не завантажився — працює як раніше
