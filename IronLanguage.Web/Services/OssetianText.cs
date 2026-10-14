using IronLanguage.Db;

namespace IronLanguage.Web.Services;

/// <summary>Нормализация осетинского текста, поступающего от пользователей.</summary>
public static class OssetianText
{
    /// <summary>
    /// Заменяет латинские <c>æ</c>/<c>Æ</c> на осетинские <c>ӕ</c>/<c>Ӕ</c> с сохранением регистра.
    /// Иначе в сохранённом контенте остаётся буква-двойник: ответы принимаются, а слово показывается неправильно.
    /// </summary>
    public static string FixAe(string? value) =>
        string.IsNullOrEmpty(value) ? value ?? "" : value.Replace('æ', 'ӕ').Replace('Æ', 'Ӕ');

    /// <summary>
    /// Нормализует название главы и текст токенов уже разобранных глав: <c>JsonSerializer</c> экранирует не-ASCII,
    /// поэтому в JSON латинская <c>æ</c> приходит как последовательность <c>\u00e6</c> и пропускается заменой по сырой строке.
    /// <c>null</c> сохраняется, чтобы валидация по-прежнему находила пустые название и текст.
    /// </summary>
    public static MaterialChapter[] FixAe(MaterialChapter[] chapters) =>
        chapters.Select(chapter => chapter with
        {
            Title = chapter.Title is null ? null! : FixAe(chapter.Title),
            Tokens = chapter.Tokens is null
                ? null!
                : chapter.Tokens.Select(token => token with
                {
                    Text = token.Text is null ? null! : FixAe(token.Text)
                }).ToArray()
        }).ToArray();
}
