using System.Globalization;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

/// <summary>Разбор и валидация текстовой разметки задания «Разбить слова на группы».</summary>
public static class GroupingScript
{
    public const int MinGroups = 2;
    public const int MaxGroups = 6;
    public const int MinWords = 4;
    public const int MaxWords = 30;

    public static bool HasLatin(string? value) => MatchingScript.HasLatin(value);
    public static string Normalize(string? value) => MatchingScript.Normalize(value);

    /// <summary>
    /// Разбирает названия групп (по одному на строке) и слова «слово | номер группы».
    /// Номер группы в разметке — с единицы; в материале хранится индекс с нуля.
    /// </summary>
    public static (GroupingMaterial? Material, string[] Errors) Parse(string? title, string? groupsText, string? wordsText)
    {
        var errors = new List<string>();
        title = (title ?? "").Trim();
        if (title.Length == 0) errors.Add("Группы слов: укажите название задания.");
        else if (title.Length > 200) errors.Add("Группы слов: название длиннее 200 символов.");
        if (HasLatin(title)) errors.Add("Группы слов: в названии есть латинские буквы.");

        var groups = ParseGroups(groupsText, errors);
        var words = ParseWords(wordsText, groups.Count, errors);
        if (groups.Count > 0 && words.Count > 0)
        {
            for (var index = 0; index < groups.Count; index++)
            {
                if (!words.Any(word => word.Group == index))
                    errors.Add($"Группы слов: в группе «{groups[index]}» нет ни одного слова.");
            }
        }

        var material = errors.Count == 0
            ? new GroupingMaterial(title, groups.ToArray(), words.ToArray(), [])
            : null;
        return (material, errors.ToArray());
    }

    private static List<string> ParseGroups(string? text, List<string> errors)
    {
        var groups = new List<string>();
        var keys = new HashSet<string>();
        var index = 0;
        foreach (var raw in Rows(text))
        {
            index++;
            if (raw.Length > 100)
            {
                errors.Add($"Группы, строка {index}: название длиннее 100 символов.");
                continue;
            }
            if (HasLatin(raw))
            {
                errors.Add($"Группы, строка {index}: латинские буквы недопустимы.");
                continue;
            }
            if (!keys.Add(Normalize(raw)))
            {
                errors.Add($"Группы, строка {index}: название «{raw}» повторяется.");
                continue;
            }
            groups.Add(raw);
        }
        if (groups.Count is < MinGroups or > MaxGroups)
            errors.Add($"Группы слов: нужно от {MinGroups} до {MaxGroups} групп, сейчас — {groups.Count}.");
        return groups;
    }

    private static List<GroupingWord> ParseWords(string? text, int groupCount, List<string> errors)
    {
        var words = new List<GroupingWord>();
        var keys = new HashSet<string>();
        var index = 0;
        foreach (var raw in Rows(text))
        {
            index++;
            var parts = raw.Split('|', StringSplitOptions.TrimEntries);
            if (parts.Length != 2)
            {
                errors.Add($"Слова, строка {index}: ожидается «слово | номер группы».");
                continue;
            }
            var word = parts[0];
            if (word.Length == 0)
            {
                errors.Add($"Слова, строка {index}: укажите слово.");
                continue;
            }
            if (word.Length > 200)
            {
                errors.Add($"Слова, строка {index}: слово длиннее 200 символов.");
                continue;
            }
            if (HasLatin(word))
            {
                errors.Add($"Слова, строка {index}: латинские буквы недопустимы.");
                continue;
            }
            if (!keys.Add(Normalize(word)))
            {
                errors.Add($"Слова, строка {index}: слово «{word}» повторяется.");
                continue;
            }
            if (!int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var group)
                || parts[1] != group.ToString(CultureInfo.InvariantCulture)
                || group < 1 || group > groupCount)
            {
                errors.Add($"Слова, строка {index}: укажите номер группы от 1 до {Math.Max(1, groupCount)}.");
                continue;
            }
            words.Add(new GroupingWord(word, group - 1));
        }
        if (words.Count is < MinWords or > MaxWords)
            errors.Add($"Группы слов: нужно от {MinWords} до {MaxWords} слов, сейчас — {words.Count}.");
        return words;
    }

    private static IEnumerable<string> Rows(string? text) =>
        (text ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(x => x.TrimEnd('\r').Trim()).Where(x => x.Length > 0);
}
