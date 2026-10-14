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
}
