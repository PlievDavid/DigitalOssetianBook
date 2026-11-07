using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using IronLanguage.Db;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Services;

public sealed partial class ReadingSeedService(DictionaryService dictionary, IReadingLibraryRepository repository,
    IAccountRepository accounts, IWebHostEnvironment environment)
{
    public static Guid StableId(string value) => new(SHA256.HashData(Encoding.UTF8.GetBytes("adam-reading-v1:" + value)).AsSpan(0, 16));

    public static ReadingImportItem Build(ReadingDraft draft)
    {
        var chapterId = StableId(draft.Slug + ":chapter");
        var tokens = Tokens().Matches(draft.Original).Select(match => new MaterialToken(match.Value, null)).ToArray();
        var material = new BookMaterial(draft.Title, draft.Description,
            [new(chapterId, 1, draft.OssetianTitle, tokens, draft.Translation)], "", draft.Authors, draft.Difficulty,
            draft.CoverImagePath, [new(chapterId, draft.IllustrationAfterLine, draft.IllustrationImagePath, draft.IllustrationDescription)], false);
        return new(StableId(draft.Slug), material);
    }

    public async Task<ReadingImportResult> Import(CancellationToken ct)
    {
        var source = Path.Combine(environment.ContentRootPath, "Data", "reading", "drafts.json");
        var items = ReadingDraftCatalog.Read(source).Select(Build).ToArray();
        foreach (var item in items)
        {
            foreach (var path in item.Material.Illustrations!.Select(image => image.ImagePath))
                if (!File.Exists(Path.Combine(environment.WebRootPath, path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar))))
                    throw new InvalidDataException("Перед импортом нужно подготовить внутренние рисунки.");
        }
        var editor = await accounts.FirstEditor(ct) ?? throw new InvalidOperationException("В локальной базе нет редактора.");
        var prepared = new List<ReadingImportItem>();
        foreach (var item in items) prepared.Add(item with { Material = await dictionary.Prepare(item.Material, ct) });
        return await repository.ReplaceLibrary(prepared.ToArray(), editor.Id, ct);
    }

    public async Task<ReadingPublicationResult> PublishSeeds(CancellationToken ct)
    {
        var items = ReadingPublicationSeeds.Read(Path.Combine(environment.ContentRootPath, "Data", "reading"));
        var editor = await accounts.FirstEditor(ct) ?? throw new InvalidOperationException("В базе нет редактора.");
        var prepared = new List<ReadingPublicationItem>();
        foreach (var item in items)
        {
            foreach (var illustration in item.Material.Illustrations ?? [])
                if (!File.Exists(Path.Combine(environment.WebRootPath, illustration.ImagePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar))))
                    throw new InvalidDataException("Перед публикацией сидов нужно подготовить внутренние рисунки.");
            prepared.Add(item with { Material = await dictionary.Prepare(item.Material, ct) });
        }
        return await repository.PublishSeeds(prepared.ToArray(), editor.Id, ct);
    }

    [GeneratedRegex(@"\s+|[\p{L}\p{M}\p{N}]+(?:[-ʼ’][\p{L}\p{M}\p{N}]+)*|[^\s\p{L}\p{M}\p{N}]+", RegexOptions.CultureInvariant)]
    private static partial Regex Tokens();
}
