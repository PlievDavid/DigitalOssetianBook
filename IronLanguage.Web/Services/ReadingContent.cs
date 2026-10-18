using System.Text.RegularExpressions;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public static partial class ReadingContent
{
    public static bool ValidImagePath(string? path) => path is not null && ImagePath().IsMatch(path);

    public static bool ValidIllustrations(ReadingIllustration[] illustrations, MaterialChapter[] chapters) =>
        illustrations.Length <= 20 && illustrations.All(illustration => illustration is not null
            && ValidImagePath(illustration.ImagePath)
            && !string.IsNullOrWhiteSpace(illustration.Description) && illustration.Description.Length <= 400
            && chapters.Any(chapter => chapter.Id == illustration.ChapterId && illustration.AfterLine >= 0
                && illustration.AfterLine <= string.Concat(chapter.Tokens.Select(token => token.Text)).Split('\n').Length));

    [GeneratedRegex(@"^(?:/media/books/[a-f0-9]{32}\.(?:png|jpg|jpeg|webp)|/images/reading/[a-z]+(?:-[a-z]+)*-interior-v[1-9][0-9]*\.png)$", RegexOptions.CultureInvariant)]
    private static partial Regex ImagePath();
}
