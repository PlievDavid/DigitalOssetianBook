namespace IronLanguage.Web.Models;

public sealed record Question(string Prompt, string[] Options, int CorrectIndex);
public sealed record LessonWord(string Ossetian, string Russian, string Context);
public sealed record Lesson(string Slug, string Category, string Title, string Description, string Level, int Minutes, string Artwork, string Symbol, LessonWord[] Words, Question[] Questions);

public static class LessonCatalog
{
    // Use only words and meanings already published in the local catalog.
    public static readonly IReadOnlyList<Lesson> All =
    [
        new("azar-words", "Чтение", "Первые слова из «Азар!»", "Разберите четыре слова из стихотворения, сохраните их и проверьте себя.", "Начальный", 10, "coral", "✦", [
            new("дæ", "твой", "Æз дæ зарынмæ куы хъусын"),
            new("мæ", "мой", "О, мæ хуры хай"),
            new("бон", "день", "О, мæ бон"),
            new("уæд", "тогда", "Уæд хъæлдзæгдæрæй фæкусын")
        ], [
            new("Какое слово в строке «О, мæ хуры хай» означает «мой»?", ["дæ", "мæ", "бон"], 1),
            new("Выберите значение слова «дæ».", ["твой", "мой", "день"], 0),
            new("Какое слово означает «день»?", ["уæд", "мæ", "бон"], 2),
            new("Выберите значение «уæд».", ["день", "тогда", "твой"], 1),
            new("Какое слово в строке «О, мæ бон» означает «день»?", ["мæ", "бон", "дæ"], 1),
            new("Выберите верную пару.", ["дæ — мой", "уæд — день", "мæ — мой"], 2)])
    ];

    public static Lesson? Find(string slug) => All.FirstOrDefault(x => x.Slug == slug);
}
