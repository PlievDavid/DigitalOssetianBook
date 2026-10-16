using System.Text;
using System.Text.RegularExpressions;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

/// <summary>Разбор и валидация текстовой разметки задания «Соотнесение».</summary>
public static class MatchingScript
{
    private static readonly Regex Latin = new("[A-Za-z]", RegexOptions.Compiled);
    private static readonly char[] EndPunctuation = ['.', ',', '?', '!'];

    public static bool HasLatin(string? value) => value is not null && Latin.IsMatch(value);

    /// <summary>Приводит текст к сравнимому виду: без лишних пробелов, кавычек и окончательных знаков препинания, в нижнем регистре.</summary>
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var text = value.Normalize(NormalizationForm.FormC);
        var builder = new StringBuilder(text.Length);
        foreach (var ch in text)
        {
            builder.Append(ch switch
            {
                '\u00A0' or '\u202F' => ' ',
                '\u2018' or '\u2019' or '\u02BC' or '`' => '\'',
                '\u201C' or '\u201D' or '\u00AB' or '\u00BB' => '"',
                '\u2010' or '\u2011' or '\u2012' or '\u2013' or '\u2014' or '\u2212' => '-',
                '\u00C6' or '\u00E6' => '\u04D5',
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
    /// Разбирает пары «лево | право» и отвлекающие слова справа.
    /// Возвращает материал без привязки к словам (WordIds заполняется вызывающей стороной).
    /// </summary>
    public static (MatchingMaterial? Material, string[] Errors) Parse(string? title, string? pairsText, string? distractorsText)
    {
        var errors = new List<string>();
        title = (title ?? "").Trim();
        if (title.Length == 0) errors.Add("Соотнесение: укажите название.");
        else if (title.Length > 200) errors.Add("Соотнесение: название длиннее 200 символов.");
        if (HasLatin(title)) errors.Add("Соотнесение: в названии есть латинские буквы.");

        var pairs = ParsePairs(pairsText, errors);
        var distractors = ParseDistractors(distractorsText, pairs, errors);

        var material = errors.Count == 0
            ? new MatchingMaterial(title, pairs.ToArray(), distractors.ToArray(), [])
            : null;
        return (material, errors.ToArray());
    }

    private static List<MatchingPair> ParsePairs(string? text, List<string> errors)
    {
        var pairs = new List<MatchingPair>();
        var leftKeys = new HashSet<string>();
        var rightKeys = new HashSet<string>();
        var index = 0;
        foreach (var raw in Rows(text))
        {
            index++;
            var parts = raw.Split('|', StringSplitOptions.TrimEntries);
            if (parts.Length != 2)
            { errors.Add($"Пары, строка {index}: ожидается два значения через «|» — «слово | перевод»."); continue; }
            var left = parts[0];
            var right = parts[1];
            if (left.Length == 0 || right.Length == 0)
            { errors.Add($"Пары, строка {index}: обе части пары должны быть заполнены."); continue; }
            if (left.Length > 200 || right.Length > 200)
            { errors.Add($"Пары, строка {index}: текст длиннее 200 символов."); continue; }
            if (HasLatin(left) || HasLatin(right))
            { errors.Add($"Пары, строка {index}: латинские буквы недопустимы."); continue; }
            var key = Normalize(left);
            if (!leftKeys.Add(key))
            { errors.Add($"Пары, строка {index}: левое слово «{left}» повторяется."); continue; }
            // Одинаковые правые части дали бы скрытую коллизию индексов при проверке.
            if (!rightKeys.Add(Normalize(right)))
            { errors.Add($"Пары, строка {index}: правая часть пары «{right}» повторяется."); continue; }
            pairs.Add(new MatchingPair(left, right));
        }
        if (pairs.Count is < 2 or > 10) errors.Add($"Соотнесение: нужно от 2 до 10 пар, сейчас — {pairs.Count}.");
        return pairs;
    }

    private static List<string> ParseDistractors(string? text, List<MatchingPair> pairs, List<string> errors)
    {
        var distractors = new List<string>();
        var rightKeys = pairs.Select(x => Normalize(x.Right)).ToHashSet();
        var seen = new HashSet<string>();
        var index = 0;
        foreach (var raw in Rows(text))
        {
            index++;
            var value = raw.Trim();
            if (value.Length == 0) continue;
            if (value.Length > 200)
            { errors.Add($"Отвлекающие слова, строка {index}: текст длиннее 200 символов."); continue; }
            if (HasLatin(value))
            { errors.Add($"Отвлекающие слова, строка {index}: латинские буквы недопустимы."); continue; }
            var key = Normalize(value);
            if (rightKeys.Contains(key))
            { errors.Add($"Отвлекающие слова, строка {index}: «{value}» совпадает с переводом из пар."); continue; }
            if (!seen.Add(key))
            { errors.Add($"Отвлекающие слова, строка {index}: «{value}» повторяется."); continue; }
            distractors.Add(value);
        }
        if (distractors.Count > 5) errors.Add($"Соотнесение: больше 5 отвлекающих слов ({distractors.Count}).");
        return distractors;
    }

    private static IEnumerable<string> Rows(string? text) =>
        (text ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(x => x.TrimEnd('\r')).Where(x => x.Length > 0);
}
