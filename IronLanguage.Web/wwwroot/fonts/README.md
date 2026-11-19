# Локальные шрифты

- Onest: https://github.com/google/fonts/tree/main/ofl/onest — вариативный оригинальный TTF, веса 100–900.
- Golos Text: https://github.com/google/fonts/tree/main/ofl/golostext — вариативный оригинальный TTF, веса 400–900.

Исходные TTF получены из официального репозитория Google Fonts 8 октября 2026 года. Файлы перекодированы в WOFF2 с сохранением набора символов и диапазона начертаний. Лицензии и авторские сведения находятся в OFL.txt рядом с каждым файлом. Оба файла содержат кириллицу и осетинские Ӕ/ӕ.

Обе оболочки подключают один шаблон предзагрузки `_Typography.cshtml`. Семейства и роли определены в `theme-green.css`. Onest используется для заголовков, Golos Text для основного текста, элементов управления и навигации. `font-display: block` даёт загружаемому шрифту время отобразиться первым.

## SHA-256 исходных файлов
- onest/Onest-Variable.ttf : 966C5C29B4755DA84B6854D5C21DD4EAA2420225D0E9874DE602DE176D4A9F31
- golos-text/GolosText-Variable.ttf : 17BB58FB69AEC2DFB047A2EBF52534023E9B688C97A6B7AC795B0A72912C2063
