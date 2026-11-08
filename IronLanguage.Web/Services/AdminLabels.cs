namespace IronLanguage.Web.Services;
public static class AdminLabels
{
    public static string Section(string key) => key switch { "home" => "Главная", "courses" or "course" => "Курсы", "lessons" or "lesson" => "Уроки", "reading" or "book" => "Чтение", "games" => "Игры", "wordle" => "Пять букв", "crosswords" => "Кроссворды", "words" or "word" => "Слова", "exercises" => "Упражнения", "audio" => "Аудиопазлы", "translation" => "Собери фразу", "listening" => "Аудирование", "dialogues" or "dialogue" => "Диалоги", "matching" => "Соотнесение", "picture" => "Картинка и слово", _ => key };
    public static string Action(string key) => key switch { "grant-admin" => "Выдать Admin", "revoke-admin" => "Снять Admin", "grant-editor" => "Выдать Editor", "revoke-editor" => "Снять Editor", "block" => "Заблокировать", "unblock" => "Разблокировать", "signout" => "Завершить все сеансы", _ => key };
}
