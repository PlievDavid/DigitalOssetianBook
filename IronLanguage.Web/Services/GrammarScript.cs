using System.Text;
using System.Text.RegularExpressions;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

/// <summary>Разбор и валидация задания «Форма слова»: предложение с пропуском и четыре варианта.</summary>
public static class GrammarScript
{
    private static readonly Regex Latin = new("[A-Za-z]", RegexOptions.Compiled);

    public static bool HasLatin(string? value) => value is not null && Latin.IsMatch(value);

    /// <summary>Приводит форму к сравнимому виду (как в MatchingScript).</summary>
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
        while (collapsed.Length > 1)
        {
            var last = collapsed[^1];
            if (last is not ('"' or '\'' or ')' or ']')) break;
            var opening = last switch { ')' => '(', ']' => '[', _ => last };
            if (!collapsed.StartsWith(opening)) break;
            collapsed = collapsed[1..^1].Trim();
        }
        return collapsed.ToLowerInvariant();
    }

    /// <summary>
    /// Валидирует одно задание: предложение, метка пропуска, правильная форма, правило и три отвлекающих формы.
    /// </summary>
    public static (GrammarMaterial? Material, string[] Errors) Validate(
        string? title, string? prompt, string? blank, string? correct, string? rule, string? distractorsText, Guid[]? wordIds = null)
    {
        var errors = new List<string>();
        title = (title ?? "").Trim();
        prompt = (prompt ?? "").Trim();
        blank = (blank ?? "").Trim();
        correct = (correct ?? "").Trim();
        rule = (rule ?? "").Trim();

        if (title.Length == 0) errors.Add("Форма слова: укажите название.");
        else if (title.Length > 200) errors.Add("Форма слова: название длиннее 200 символов.");
        if (HasLatin(title)) errors.Add("Форма слова: в названии есть латинские буквы.");

        if (blank.Length == 0) errors.Add("Форма слова: укажите метку пропуска, например «___».");
        else if (blank.Length > 10) errors.Add("Форма слова: метка пропуска длиннее 10 символов.");
        else if (HasLatin(blank)) errors.Add("Форма слова: в метке пропуска есть латинские буквы.");

        if (prompt.Length == 0) errors.Add("Форма слова: укажите предложение.");
        else if (prompt.Length > 300) errors.Add("Форма слова: предложение длиннее 300 символов.");
        else if (HasLatin(prompt)) errors.Add("Форма слова: в предложении есть латинские буквы.");
        else if (blank.Length > 0)
        {
            var count = 0;
            for (var index = prompt.IndexOf(blank, StringComparison.Ordinal); index >= 0; index = prompt.IndexOf(blank, index + blank.Length, StringComparison.Ordinal))
                count++;
            if (count == 0) errors.Add($"Форма слова: в предложении нет метки пропуска «{blank}».");
            else if (count > 1) errors.Add($"Форма слова: метка пропуска «{blank}» встречается {count} раз — нужен ровно один пропуск.");
        }

        if (correct.Length == 0) errors.Add("Форма слова: укажите правильную форму слова.");
        else if (correct.Length > 200) errors.Add("Форма слова: правильная форма длиннее 200 символов.");
        else if (HasLatin(correct)) errors.Add("Форма слова: латинские буквы в форме недопустимы.");

        if (rule.Length > 300) errors.Add("Форма слова: подсказка длиннее 300 символов.");
        if (HasLatin(rule)) errors.Add("Форма слова: в подсказке есть латинские буквы.");

        var distractors = ParseDistractors(distractorsText, correct, errors);

        var material = errors.Count == 0
            ? new GrammarMaterial(title, prompt, blank, correct, rule, distractors, wordIds ?? [])
            : null;
        return (material, errors.ToArray());
    }

    private static string[] ParseDistractors(string? text, string correct, List<string> errors)
    {
        var rows = Rows(text).ToList();
        if (rows.Count != 3)
        {
            errors.Add($"Форма слова: укажите ровно три отвлекающие формы, сейчас — {rows.Count}.");
            return [];
        }
        var correctKey = Normalize(correct);
        var seen = new HashSet<string> { correctKey };
        var distractors = new List<string>();
        for (var i = 0; i < rows.Count; i++)
        {
            var value = rows[i].Trim();
            var index = i + 1;
            if (value.Length == 0)
            { errors.Add($"Отвлекающая форма {index}: пустое значение."); continue; }
            if (value.Length > 200)
            { errors.Add($"Отвлекающая форма {index}: текст длиннее 200 символов."); continue; }
            if (HasLatin(value))
            { errors.Add($"Отвлекающая форма {index}: латинские буквы недопустимы."); continue; }
            var key = Normalize(value);
            if (!seen.Add(key))
            { errors.Add($"Отвлекающая форма {index}: «{value}» повторяется или совпадает с правильной формой."); continue; }
            distractors.Add(value);
        }
        return distractors.ToArray();
    }

    private static IEnumerable<string> Rows(string? text) =>
        (text ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(x => x.TrimEnd('\r')).Where(x => x.Length > 0);
}
