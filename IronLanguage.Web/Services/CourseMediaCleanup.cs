using System.Text.RegularExpressions;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public static partial class CourseMediaCleanup
{
    [GeneratedRegex(@"[a-f0-9]{32}\.(?:png|jpe?g|webp|mp4|webm)", RegexOptions.IgnoreCase)]
    private static partial Regex References();

    public static async Task<int> Run(ICourseRepository courses, IEnumerable<string> directories, bool apply, CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddDays(-1);
        var candidates = directories
            .Where(path => Directory.Exists(path) && !File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint))
            .SelectMany(path => Directory.EnumerateFiles(path))
            .Where(path =>
            {
                var file = Path.GetFileName(path);
                return References().Match(file).Length == file.Length &&
                    File.GetLastWriteTimeUtc(path) < cutoff &&
                    !File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint);
            })
            .ToLookup(path => Path.GetFileName(path)!, StringComparer.OrdinalIgnoreCase);

        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await foreach (var document in courses.MediaReferenceDocuments().WithCancellation(ct))
            foreach (Match match in References().Matches(document))
                if (candidates.Contains(match.Value)) used.Add(match.Value);

        var unused = candidates.Where(group => !used.Contains(group.Key)).SelectMany(group => group).ToArray();
        if (apply)
            foreach (var file in unused) File.Delete(file);
        return unused.Length;
    }
}
