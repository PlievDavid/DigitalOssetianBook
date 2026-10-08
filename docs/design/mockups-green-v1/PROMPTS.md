# Промпты макетов

Встроенный image_gen, без CLI/API fallback. Общая инструкция добавляется перед каждой спецификацией. Финальные изображения перечислены в README.md.

## Общая инструкция

```text
Use case: ui-mockup. Create a polished high-fidelity UI design board for the existing Russian Ossetian language learning website «Адам». Landscape canvas, crisp flat front-facing UI, generously sized legible Russian text, no device perspective, no photography. Match the current homepage: warm offwhite #f1f0ec outer background, rounded white website shell, dark forest green #173f31 actions, dark navy #101b34 text, muted #526273, pale sage #eff2e8, pale blue #ecf4fc for audio, warm sand #fcf5e9 for translation. Onest-like calm geometric sans headings, Golos Text-like Russian sans body; NO serifs. 16px cards, 10px buttons, airy spacing, subtle borders, minimal line icons. Small tasteful watercolor Ossetian mountains, medieval stone tower and leaves on header edges only, seamless fade into background. Logo at top left: three simple people blue/yellow/coral, «Адам» with small «Осетинский язык для всех». Desktop nav «Задания   Слова   Игры   Книги» and green «Войти» or round profile avatar; NO chevrons or arrow buttons beside nav labels. Mobile hamburger, bottom nav «Задания / Слова / Игры / Книги» reserve clear space. UI content stays front and central. Do not create new product functionality, course catalog, lesson search, subscriptions, fake learning translations or Chinese glyphs. Any educational content placeholders labelled «Пример материала»; preserve Ӕ/ӕ as Cyrillic. Small board label outside UI indicates conceptual design, not implemented screenshot. Exact UI text use the supplied Russian labels. 
```

## 1. Аудиопазлы и перевод фраз

```text
Board title «01 · Аудиопазлы и перевод фраз». Composition: two large desktop page frames side by side across upper 2/3; two small corresponding mobile frames below. LEFT desktop audio catalog: heading «Аудиопазлы», subtitle «Прослушайте фразу и соберите её», calm blue banner with headphone line icon and watercolor mountain corner. Three spacious cards labelled «Пример материала», each with audio icon, small «Открыть». Guest notice thin neutral strip «Прогресс и слова не сохраняются» plus «Войти». RIGHT desktop active translation: back «К списку», heading «Перевод фраз», sand header opposing arrows icon, prompt panel labelled «Русская подсказка» containing grey content placeholder lines. Rounded outlined answer area «Ваш ответ», token chips below «Выберите слова», use token labels «Слово 1», «Слово 2», «Ӕ/ӕ». Green «Проверить ответ», text «Сбросить». Small success panel «Ответ принят» without fake scores. A compact audio player inset in left mobile active audio state, play round button, waveform, answer chips; right mobile translation catalog. Same components across all frames.
```

## 2. Диалоги

```text
Board title «02 · Диалоги». Three frames: one desktop catalog left, one desktop active dialogue center, one tall mobile active dialogue right. Catalog header «Диалоги», subtitle «Отвечайте собеседнику», subtle sage watercolor speech bubbles and mountain detail; three dialogue cards «Пример материала» with «Иронский · Уровень 1» and «Открыть». Catalog guest strip «Прогресс не сохраняется · Войти». Active screen back «К списку», heading «Диалог», calm alternating rounded conversation bubbles with actor labels «Собеседник» and «Вы». Content grey lines with label «Пример реплики», never invent Ossetian sentences/translations. Below conversation an answer form «Ваш ответ», large text input, primary «Отправить», secondary «Подсказка». Small alternate choice-state inset with three answer buttons «Вариант 1», «Вариант 2», «Вариант 3». Mobile conversation comfortably fits above bottom nav with adequate padding. No fake chat friends/AI/video calling.
```

## 3. Словарь, тренировка и подбор пар

```text
Board title «03 · Словарь и тренировка». Three frames: large desktop dictionary left, desktop practice center, tall mobile matching game right. Dictionary title «Мои слова», green actions «Тренировка слов» and outlined «Подбор пар». Sections «Сохранено» and «Доступные слова», elegant readable cards: example label «Пример материала», heading «Слово», smaller «Перевод», grey line «Пример употребления», speaker line icon and «Сохранить». Avoid fake real translations. Practice title «Практика слов», back «К словарю», centered cream/sage card «Переведите на русский», bold «Слово», labelled «Ваш ответ» input, primary «Проверить». Show subtle success state «Ответ принят» with no points. Mobile game heading «Подберите пары», subheading «Найдите слова и их переводы», «Новая игра», two columns of five separate rounded matching tiles labelled «Слово 1»..«Слово 5» and «Перевод 1»..«Перевод 5», one selected pair green outline, one matched pair sage. No new search/category/filter features.
```

## 4. Каталог и описание книги

```text
Board title «04 · Книги». Three large frames: desktop catalog left, desktop book detail center, tall mobile catalog right. Catalog eyebrow «Библиотека», heading «Книги на осетинском», subtitle «Читайте с переводом и словарными подсказками». Three book cards, each original watercolor cover with mountains/leaves/book, simple cover text «Книга», card «Пример материала», «Автор», small «Начальный», green «Читать». No invented literary book titles or authors. Detail back «Все книги», large watercolor cover left, text «Название книги», «Автор», difficulty pill «Начальный», description placeholder grey lines, primary «Начать чтение». Below modest «Главы» list «Глава 1», «Глава 2» no fake content. Small guest strip «Прогресс и слова не сохраняются» and «Войти». Mobile one-column books, image covers modest and readable, buttons and last card above reserved bottom-nav space. No search or future subscriptions.
```

## 5. Чтение и словарная подсказка

```text
Board title «05 · Чтение книги». One large desktop reader occupying left 70%, tall mobile reader right 30%. Reader deliberately quiet without banner artwork, for comfortable reading. Top normal site header, reader back «Описание книги», title «Название книги», small «Автор». Left narrow chapter rail «Главы», «Глава 1», «Глава 2», active sage. Reading area two columns «Осетинский текст» and «Литературный перевод». Do not generate real sentences: use several grey typographic placeholder lines, discrete italic annotation «Текст из опубликованной книги». Show one selected word as literal «Ӕ/ӕ» and anchored small popup titled «Словарная подсказка», placeholder «Перевод», green «Сохранить слово»; no invented translation. Mobile stacks literary translation beneath original, inline chapter controls and popup contained within viewport. Footer actions «Предыдущая глава» / «Следующая глава», generously separated from bottom nav. Add small alternate guest popup card «Войдите, чтобы сохранять слова». No translations automated and no new reader tools.
```

## 6. Вход, регистрация, профиль и результаты

```text
Board title «06 · Аккаунт и результаты». Four clearly separated generous frames, 2 by 2 desktop pages plus slim mobile sample at far right if space allows. Frame1 login «Войти», text «Продолжите занятия и работу со словарём», fields «Электронная почта», «Пароль», green «Войти», «Нет аккаунта? Зарегистрироваться». Frame2 signup «Создать аккаунт», «Сохраняйте слова и продолжайте занятия с любого устройства», same email/password fields, «Зарегистрироваться», «Уже есть аккаунт? Войти». Frame3 profile identity circle «Я», «Учётная запись», cards «Мои результаты», «Мои слова», smaller role-dependent «Редактор материалов», secondary «Выйти из аккаунта». Frame4 «Мои результаты»: two sage/sand stat cards «Очки» value 0, «Дней подряд» value 0, below «Награды», quiet empty state «Пока нет наград». No invented analytics charts, settings, reset-password, social login, subscriptions. Consistent white forms calm mountain/book illustration beside forms, no artwork behind text. Mobile signup sample with big inputs and keyboard-safe spacing.
```

## 7. Редактор: библиотека материалов

```text
Board title «07 · Редактор материалов». One large desktop page left 75%, tall mobile editor right25%. Role marker «Редактор». Heading «Что вы хотите добавить?», description «Сохраните черновик, проверьте и опубликуйте материал». Five tasteful compact add cards «Слово», «Аудиопазл», «Перевод фразы», «Книга», «Диалог» with matching minimal line icons; blue audio, sand translation, sage book/dialog. Below «Материалы», tabs «Черновики», «Опубликовано», «Архив», native selector «Все типы». Draft rows labelled «Пример материала» and type, visible «Изменить», «Предпросмотр», subdued «Удалить». Published inset row actions «Создать новую версию», «История версий», «В архив». Clearly show editing published content through a new draft rather than inline publishing. Mobile cards stacked and material row actions wrap. Keep editor functional and restrained, no ornamental hero occupying workspace, no permissions/admin/new users functionality.
```

## 8. Редактор: формы и публикация

```text
Board title «08 · Формы и публикация». A comprehensive polished 2-by-3 board of six front-facing UI frames, enough resolution for main form labels. Frame1 «Слово»: fields «Осетинское слово», «Перевод», «Пример», optional «Аудиозапись». Frame2 «Аудиопазл»: fields «Правильный ответ», «Слова для сборки», «Допустимые ответы», «Пояснение», required «Аудиозапись». Frame3 «Перевод фразы»: fields «Русская подсказка», «Осетинский ответ», «Слова для сборки», «Связанные слова». Frame4 «Книга»: «Название», «Авторы», «Уровень», «Описание», «Обложка», «Литературный перевод», «Главы», «Добавить главу». Frame5 «Диалог»: «Название», «Диалект», «Уровень», «Персонажи», «Реплики», «Ходы ученика» multi-line structured textarea fields (existing text based editor, no imagined dragdrop editor). Each form bottom green «Сохранить черновик», outlined «Отмена». Frame6 «Предпросмотр»: pill «Черновик · Версия 1», learner preview placeholder card «Пример материала», «Изменить», checkbox full exact «Я проверил текст, перевод и права на публикацию», green «Опубликовать», below «История версий». Include a tiny lower note «Новая версия опубликованного материала проходит через черновик». Same calm colors/fonts, minimal watercolor leaf at border only. No educational content invented, no actual password/token fields. On mobile future implementation stack the same fields; show single narrow mobile form inset only if comfortable spacing.
```

## 9. Навигация и служебные состояния

```text
Board title «09 · Навигация и служебные состояния». Polished reference board with six modest UI components: (1) desktop header showing mouse hover on text «Задания» opening a white dropdown directly below with «Все задания», «Аудиопазлы», «Перевод фраз», «Диалоги», no chevrons beside any label, click label opens home. (2) mobile hamburger menu expanded with full links under «Задания» and «Слова», no chevrons; below words «Словарь», «Тренировка слов», «Подбор пар». (3) Games existing placeholder menu «Кроссворды», «Вордли», «Переводилка» each «В разработке» disabled grey, do not show playable pages. (4) small card «Доступ запрещён», «Доступ к редактору предоставляется роли Editor», «На главную». (5) error card «Не удалось загрузить материал», «Попробуйте ещё раз», green «Повторить»; adjacent empty vocabulary card «Пока нет сохранённых слов», «Открыть книги». (6) restrained article-page «Конфиденциальность» with grey paragraph placeholders, no invented legal statements. Guest notice component «Занимайтесь без входа. Прогресс и слова не сохраняются.» link «Войти, чтобы сохранять». Heading at top «Состояния интерфейса», diagram-free actual UI panels with consistent green/sage/blue/sand. Legible large Russian text.
```

## Точечные уточнения финальных изображений

### Лист 3

```text
Edit only the header of the left dictionary frame. This is authenticated «Мои слова», so replace green «Войти» with a round dark green profile avatar marked «Я». Preserve every other pixel/layout/text, colors and all other frames.
```

### Лист 5

```text
Edit only top desktop header authentication control: replace «Войти» button with round dark green profile avatar «Я». This shows authenticated save-word state. Keep reader, placeholders, popup, entire mobile frame and all other design identical.
```

### Лист 6

```text
Correct this UI concept with exactly two changes. In lower-left profile frame delete the password label and password dots entirely: profiles never display stored passwords. Replace that entire small email/password info panel with two simple navigational cards «Мои результаты» and «Мои слова», keep avatar «Я» and «Выйти из аккаунта». Remove eye icons from all three login/register password inputs because visibility toggles do not exist in current product; keep masking dots in form inputs. Preserve rest of image faithfully.
```

### Лист 7

```text
Edit only header account control on desktop editor: remove both scenic avatar and «Войти» button; replace them with one round dark green avatar «Р» and text «Редактор · профиль». This editor is role-protected authenticated state. Keep all other frames/cards/actions/text/colors exactly unchanged.
```

### Лист 8 — уточнение полей

```text
Edit this UI mockup board, preserve the six-frame composition, all titles and main field labels, palette, typography, spacing, watercolor accents, action buttons and publication checkbox. Make these precise fidelity corrections only: remove ALL asterisks beside field labels, leaving only required «Аудиозапись» on audio-puzzle frame marked required in plain text. Remove ALL placeholder/helper text inside every input/textarea/upload box including file size limits, comma-separated instructions, drag-and-drop instructions, example lines and formats. Leave blank clean fields or subtle grey placeholder strokes. For «Связанные слова» in translation frame use a compact search input with placeholder «Найти опубликованное слово» and a selected chip «Слово», not a multiline textarea. Keep book chapters and Add chapter button; keep role profile avatar in headers. Do not add functionality.
```
