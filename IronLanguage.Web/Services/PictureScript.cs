using System.Text;
using System.Text.RegularExpressions;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

/// <summary>Разбор и валидация задания «Картинка и слово»: одна картинка, один вопрос.</summary>
public static class PictureScript
{
    public const string ChoiceMode = "choice";
    public const string FreeMode = "free";

    private static readonly Regex Latin = new("[A-Za-z]", RegexOptions.Compiled);
    private static readonly char[] EndPunctuation = ['.', ',', '?', '!'];

    public static bool HasLatin(string? value) => value is not null && Latin.IsMatch(value);

    public static bool ValidPicturePath(string? path) =>
        !string.IsNullOrWhiteSpace(path) && path.StartsWith("/media/pictures/", StringComparison.Ordinal)
        && path.Length <= 300 && !path.Contains("..", StringComparison.Ordinal)
        && !path.Contains('?', StringComparison.Ordinal) && !path.Contains('#', StringComparison.Ordinal);

    public static bool ValidMode(string? mode) => mode is ChoiceMode or FreeMode;

    /// <summary>Приводит слово к сравнимому виду (как в MatchingScript).</summary>
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var text = value.Normalize(NormalizationForm.FormC);
        var builder = new StringBuilder(text.Length);
        foreach (var ch in text)
        {
            builder.Append(ch switch
            {
                ' ' or ' ' => ' ',
                '‘' or '’' or 'ʼ' or '`' => '\'',
                '“' or '”' or '«' or '»' => '"',
                '‐' or '‑' or '‒' or '–' or '—' or '−' => '-',
                'Æ' or 'æ' => 'ӕ',
                _ => ch
            });
        }
        var collapsed = string.Join(' ', builder.ToString().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        collapsed = collapsed.TrimEnd(EndPunctuation);
        while (collapsed.Length > 1)
        {
            var last = collapsed[^1];
            if (last is not ('"' or '\'' or ')' or ']')) break;
            var opening = last switch { ')' => '(', ']' => '[', _ => last };
            if (!collapsed.StartsWith(opening)) break;
            collapsed = collapsed[1..^1].TrimEnd(EndPunctuation);
        }
        return collapsed.ToLowerInvariant();
    }

    /// <summary>
    /// Валидирует одно задание: картинка, слово, режим и отвлекающие слова.
    /// Путь картинки уже должен быть сохранён в /media/pictures/.
    /// </summary>
    public static (PictureMaterial? Material, string[] Errors) Validate(
        string? title, string? picturePath, string? word, string? mode, string? distractorsText)
    {
        var errors = new List<string>();
        title = (title ?? "").Trim();
        picturePath = (picturePath ?? "").Trim();
        word = (word ?? "").Trim();
        mode = (mode ?? "").Trim();

        if (title.Length == 0) errors.Add("Картинка и слово: укажите название.");
        else if (title.Length > 200) errors.Add("Картинка и слово: название длиннее 200 символов.");
        if (HasLatin(title)) errors.Add("Картинка и слово: в названии есть латинские буквы.");

        if (!ValidMode(mode)) errors.Add("Картинка и слово: выберите режим ответа — «варианты» или «ввод слова».");
        if (!ValidPicturePath(picturePath)) errors.Add("Картинка и слово: загрузите картинку в формате PNG, JPEG или WebP.");

        if (word.Length == 0) errors.Add("Картинка и слово: укажите правильное слово.");
        else if (word.Length > 200) errors.Add("Картинка и слово: слово длиннее 200 символов.");
        else if (HasLatin(word)) errors.Add("Картинка и слово: латинские буквы в слове недопустимы.");

        string[] distractors = [];
        if (mode == ChoiceMode)
            distractors = ParseChoiceDistractors(distractorsText, word, errors);
        else if (mode == FreeMode && !string.IsNullOrWhiteSpace(distractorsText) && Rows(distractorsText).Any())
            errors.Add("Картинка и слово: в режиме ввода слова отвлекающие слова не нужны — переключите режим или очистите поле.");

        var material = errors.Count == 0
            ? new PictureMaterial(title, picturePath, word, mode, distractors, [])
            : null;
        return (material, errors.ToArray());
    }

    private static string[] ParseChoiceDistractors(string? text, string word, List<string> errors)
    {
        var rows = Rows(text).ToList();
        if (rows.Count != 2)
        {
            errors.Add($"Картинка и слово: для режима «варианты» укажите ровно два отвлекающих слова, сейчас — {rows.Count}.");
            return [];
        }
        var correctKey = Normalize(word);
        var seen = new HashSet<string> { correctKey };
        var distractors = new List<string>();
        for (var i = 0; i < rows.Count; i++)
        {
            var value = rows[i].Trim();
            var index = i + 1;
            if (value.Length == 0)
            { errors.Add($"Отвлекающее слово {index}: пустое значение."); continue; }
            if (value.Length > 200)
            { errors.Add($"Отвлекающее слово {index}: текст длиннее 200 символов."); continue; }
            if (HasLatin(value))
            { errors.Add($"Отвлекающее слово {index}: латинские буквы недопустимы."); continue; }
            var key = Normalize(value);
            if (!seen.Add(key))
            { errors.Add($"Отвлекающее слово {index}: «{value}» повторяется или совпадает с правильным словом."); continue; }
            distractors.Add(value);
        }
        return distractors.ToArray();
    }

    private static IEnumerable<string> Rows(string? text) =>
        (text ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(x => x.TrimEnd('\r')).Where(x => x.Length > 0);
}
