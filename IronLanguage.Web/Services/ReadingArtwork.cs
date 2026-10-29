namespace IronLanguage.Web.Services;

public static class ReadingArtwork
{
    // Preserve artwork URLs stored in published books, revisions and old bookmarks.
    public static IReadOnlyDictionary<string, string> LegacyPaths { get; } = new[]
    {
        "schoolboy", "mischief", "testament", "reflection", "hope", "wish", "farewell", "orphans-mother"
    }.SelectMany(slug => new[] { "cover", "interior" }.Select(kind => $"/images/reading/{slug}-{kind}-v1"))
        .ToDictionary(path => path + ".png", path => path + ".webp", StringComparer.Ordinal);
}
