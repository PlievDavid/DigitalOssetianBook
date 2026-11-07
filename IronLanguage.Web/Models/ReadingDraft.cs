using System.Text.Json;
using System.Text.RegularExpressions;

namespace IronLanguage.Web.Models;

public sealed record ReadingDraft(string Slug, string Title, string OssetianTitle, string Authors,
    string Difficulty, string Description, string SourceUrl, string Original, string Translation,
    string ReviewNotes, string CoverImagePath, string IllustrationImagePath,
    string IllustrationDescription, int IllustrationAfterLine)
{
    public bool CoverReady { get; init; }
    public bool IllustrationReady { get; init; }
}

public static partial class ReadingDraftCatalog
{
    public static ReadingDraft[] Read(string path)
    {
        var drafts = JsonSerializer.Deserialize<ReadingDraft[]>(File.ReadAllText(path),
            new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? [];
        if (drafts.Length != 8 || drafts.Any(draft => draft is null)
            || drafts.Select(draft => draft.Slug).Distinct(StringComparer.Ordinal).Count() != drafts.Length)
            throw new InvalidDataException("В предпросмотре должно быть восемь разных произведений.");
        foreach (var draft in drafts)
        {
            var required = new[] { draft.Slug, draft.Title, draft.OssetianTitle, draft.Authors,
                draft.Original, draft.Translation, draft.ReviewNotes, draft.IllustrationDescription };
            if (required.Any(string.IsNullOrWhiteSpace) || !SlugPattern().IsMatch(draft.Slug))
                throw new InvalidDataException("У произведения должны быть название, автор, тексты и описание рисунка.");
            if (draft.Original.Length > 50_000 || draft.Translation.Length > 50_000
                || draft.Original.Contains('\r') || draft.Translation.Contains('\r'))
                throw new InvalidDataException("Тексты должны использовать переносы строк LF и не превышать 50000 символов.");
            var originalLines = draft.Original.Split('\n');
            var translationLines = draft.Translation.Split('\n');
            if (originalLines.Length != translationLines.Length
                || originalLines.Where((line, index) => string.IsNullOrWhiteSpace(line)
                    != string.IsNullOrWhiteSpace(translationLines[index])).Any()
                || draft.IllustrationAfterLine < 0 || draft.IllustrationAfterLine > originalLines.Length)
                throw new InvalidDataException("Строки и строфы перевода должны соответствовать оригиналу.");
            if (draft.CoverImagePath != $"/images/reading/{draft.Slug}-cover-v1.webp"
                || draft.IllustrationImagePath != $"/images/reading/{draft.Slug}-interior-v1.webp"
                || !Uri.TryCreate(draft.SourceUrl, UriKind.Absolute, out var source) || source.Scheme != Uri.UriSchemeHttps)
                throw new InvalidDataException("Неверный путь изображения или ссылка на источник.");
        }
        return drafts;
    }

    [GeneratedRegex("^[a-z]+(?:-[a-z]+)*$", RegexOptions.CultureInvariant)]
    private static partial Regex SlugPattern();
}
