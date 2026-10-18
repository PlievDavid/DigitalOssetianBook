# Книги — иллюстрированный макет, версия 1

Дата: 18 октября 2026 года. Ветка: `codex/books-library-mockup`.

Это предложение интерфейса, не реализованные страницы. Текущие книги, тексты, прогресс и БД не изменены; импорт и удаление материалов не выполнялись. Ветка создана от обновлённой локальной `main`; существовавший локальный коммит main сохранён без изменения.

## Изображения

- `01-library-desktop-mobile.png` — каталог: десять самостоятельных произведений, крупные тематические обложки, общая авторская подборка; компьютер и телефон.
- `02-reader-desktop-mobile.png` — читалка: иллюстрация внутри произведения, оригинал и литературный перевод рядом на компьютере; на телефоне предложен переключатель языков.

Макеты созданы встроенным OpenAI `image_gen`, без CLI/API fallback и без программной обработки изображений. Референс стиля — ранее согласованный макет карточек кроссвордов «Адам». Для читалки дополнительный референс — новый макет библиотеки. Рисунки — художественная интерпретация, не документальная реконструкция быта.

## Контент и границы

Пользователь выбрал десять отдельных карточек и иллюстрации внутри текстов. Перевод рядом с оригиналом сохранён по текущему интерфейсу; мобильный переключатель — предлагаемое поведение, а не готовая функция. Управление размером шрифта на картинке также является предложением.

Источник названий и авторства: [«Ирон фæндыр — Осетинская лира»](https://hetagurov.ru/po_kosta/perevody/if/ir_ru/). Предварительный набор: «Киска», «Школьник», «Шалун», «Петушок», «Весна», «Лето», «Осень», «Зима», «Ворона и лисица», «Волк и журавль». Порядок и окончательный состав можно изменить после согласования. Это произведения Коста Хетагурова, а не десять разных полных сборников.

Для читалки использован только короткий фрагмент [«Гино — Киска»](https://hetagurov.ru/po_kosta/perevody/if/ir_ru/gino.php), литературный перевод А. Шпирта указан в оглавлении источника. Полные тексты не скопированы. До реального импорта необходимо проверить права на каждое произведение и литературный перевод; доступность на сайте сама по себе не является разрешением на перепубликацию.

Растровое написание букв приблизительное: при реализации брать UTF-8 текст из проверенного источника, проверять Ӕ/ӕ и не использовать надписи с картинки как учебный материал. В макете показаны обычные межсловные интервалы без растяжения строки. Исправление пробелов пока не реализовано: в дальнейшем сначала определить источник лишних интервалов, сохранить авторские переносы, строфы и смысловые отступы, не применять глобальное удаление пробелов.

Рисунки пока существуют только внутри макетов; отдельные обложки и встроенные иллюстрации потребуют подготовки после утверждения. Никакие дополнительные материалы, аудио, категории, оценки сложности, очки или прогресс чтения не импортированы и не заявлены работающими.

## Проверка

Оба результата визуально просмотрены: каталог содержит десять карточек, читалка — встроенный рисунок, обе страницы показывают компьютерный и мобильный вариант. Это растровые эскизы: адаптивная вёрстка, клавиатура и доступность не проверялись как работающий интерфейс. Сборка приложения не требуется: исходный код не изменён.

## Промпты

### 1. Библиотека

```text
Use case: ui-mockup.
Create one beautiful high-fidelity web application UI presentation image for the illustrated library of the Ossetian language platform "Адам". Input image 1 is STYLE REFERENCE ONLY: preserve its actual platform identity, three-person colorful logo, dark navy headings, forest green controls, warm off-white outer background, white rounded app shell, restrained sage surfaces and softly painted illustrated aesthetic. Do NOT copy crossword UI or stars.
Composition: a large full desktop library page at left (roughly 3/4 image width), and one legible narrow mobile library screen at right. Flat front-on screen designs, not tilted devices, no desks, no photography, no annotations or huge presentation titles. High resolution, generous readable typography. Desktop shows a complete coherent page, not a cropped screenshot.
Desktop header exactly: logo "Адам", tagline "Осетинский язык для всех"; navigation "Задания", "Слова", "Игры", "Книги" with Книги active, small profile avatar.
Main heading "Книги на осетинском". Small warm editorial intro panel with "Коста Хетагуров", "Ирон фӕндыр · Осетинская лира", subtext "Читайте с переводом и иллюстрациями." Small tasteful illustrated open book with a mountain landscape, NOT an oversized hero.
Below label "10 произведений". Show EXACTLY ten separate work cards in an orderly desktop grid, four columns, three rows with two last cards. Each card has a LARGE beautiful portrait-format illustrated cover, short title below and author "Коста Хетагуров" in muted text. Covers must feel like a coordinated premium collection, not arbitrary clipart: soft gouache/storybook drawings, gentle paper texture, sage, ochre, sky blue, coral. Minimal card chrome, quiet corners, comfortable gaps. Distinct scenes:
1 "Киска": curled gray cat by a warm hearth.
2 "Школьник": Ossetian schoolboy carrying a book.
3 "Шалун": mischievous smiling young boy.
4 "Петушок": golden red rooster at dawn.
5 "Весна": blossoming orchard and green Caucasus foothills.
6 "Лето": sunny meadow and distant mountain village.
7 "Осень": amber leaves and stone village house.
8 "Зима": snowy mountain village under pale blue sky.
9 "Ворона и лисица": black crow on branch, orange fox below.
10 "Волк и журавль": wolf and white crane in a meadow.
Do not add fictional ratings, fake completion percentages, pricing, categories, audio controls, achievements, search fields or sorting controls for this small collection. Footer same quiet platform footer as reference with "Адам", "Изучайте осетинский в своём темпе", privacy and illustration links.
Mobile screen: same heading and visual identity, two-column illustrated cover grid with first four works visible and natural continuation below, no desktop header stuffed into mobile. Four bottom navigation items ONLY "Задания", "Слова", "Книги", "Профиль", Книги active. Safe inset so nav does not obscure content. Realistic accessible typography, generous touch areas.
All UI text in Russian; retain provided Ossetian ӕ correctly. This is a DESIGN PROPOSAL, not code or a live website. No invented poem text. Elegant and restrained, sufficiently rich to justify a separate library section.
```

### 2. Читалка

```text
Use case: ui-mockup.
Create one high-fidelity UI design presentation for the READING PAGE of the Russian/Ossetian learning platform "Адам". Reference image 1 is the approved new library visual system: match that same logo, typography, navigation, forest green, navy, sage, warm paper, and illustrated cat. Reference image 2 is the broader platform style. This page must look like a restrained literary reading experience, not a game or a textbook worksheet.
Composition: large fully readable DESKTOP reading page on the left, and a narrower MOBILE version of that same reading page on the right. Flat front-on screens, one coherent design board, soft warm off-white surround, white rounded application shells, no mockup desk/device perspective, no annotations outside the screens.
Desktop retain compact actual top navigation "Адам" / "Задания" / "Слова" / "Игры" / "Книги" (Книги active), avatar. Consistent content top padding, normal back link "← К книгам".
Article heading "Гино · Киска", author "Коста Хетагуров", small collection attribution "Осетинская лира". Restrained small Aa reading-size control at right, not many toolbars.
IMPORTANT: a charming LARGE storybook/gouache illustration must be embedded INSIDE THE READING CONTENT, NOT just a book cover/thumbnail. Draw the same cozy gray cat asleep near an Ossetian home's stone hearth, soft amber light, subtle Caucasian domestic details, cream/rust/sage colors. The illustration feels printed on the page, with quiet organic edges or a modest rounded rectangular crop, broad but not overwhelming. It should be integrated above the poem excerpt within the article, occupying roughly 28% of content height; reader can focus on text, image not a background behind text.
Under that, two spacious but not excessively spaced aligned columns. Left label "На осетинском", right label "Литературный перевод". Text dark navy, normal single word spaces, NO justification or artificial character/word spacing, lines preserved, line-height about1.6, font approximately24px at desktop scale, same family as platform with good ӕ support. No selection highlighting or word underlines everywhere.
Use ONLY this exact SHORT VERIFIED EXCERPT (it is intentionally just an excerpt, do not invent or complete poem text).
Left exactly two lines:
"Гино, гино, гис!
Иу гӕды нӕм ис,"
Right exactly two lines:
"Киска, киска, кис!
Где ты, отзовись!.."
Small unobtrusive label beneath excerpt "Фрагмент для макета"; below it a quiet instruction "Нажмите на слово, чтобы открыть словарь." At foot of article link "Следующее произведение →". Keep a normal platform footer with logo; no fake listening/sound buttons, no game points/stars, no fake reading progress or completion claims. No modal.
MOBILE: same work heading, back link, author, segmented choice "Оригинал" active and "Перевод" inactive (only one language visible at a time). Embed the SAME cat scene inside the article, between heading and text. Show only the exact SAME two Ossetian lines and the small excerpt label/instruction. Natural compact spaces, generous touch targets, no clipping. Standard four-item mobile nav "Задания", "Слова", "Книги", "Профиль" with Книги active, reserve safe bottom space so it does not cover article controls.
Visually legible and sophisticated, calm authentic illustrated literature; important UI accurately rendered in Russian, Ossetian ӕ character preserved. This is a proposed design, NOT a statement that translation switching or inline illustrations are already implemented.
```
