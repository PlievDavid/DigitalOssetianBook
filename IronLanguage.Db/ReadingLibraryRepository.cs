using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed record ReadingImportItem(Guid Id, BookMaterial Material);
public sealed record ReadingImportResult(int Added, int Archived);

public interface IReadingLibraryRepository
{
    Task<ReadingImportResult> ReplaceLibrary(ReadingImportItem[] items, Guid editorId, CancellationToken ct);
}

public sealed class EfReadingLibraryRepository(AdamDbContext db) : IReadingLibraryRepository
{
    public async Task<ReadingImportResult> ReplaceLibrary(ReadingImportItem[] items, Guid editorId, CancellationToken ct)
    {
        if (items.Length != 8 || items.Select(item => item.Id).Distinct().Count() != 8)
            throw new ArgumentException("Для замены библиотеки нужны восемь разных произведений.");
        if (!await db.Users.AnyAsync(user => user.Id == editorId && user.IsEditor, ct))
            throw new InvalidOperationException("Импорт должен быть связан с редактором.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(1938238190)", ct);
        var ids = items.Select(item => item.Id).ToArray();
        var existing = await db.Books.CountAsync(book => ids.Contains(book.Id), ct);
        if (existing == items.Length) return new(0, 0);
        if (existing != 0) throw new InvalidOperationException("Часть подборки уже существует. Автоматическая замена отменена.");
        var archived = await db.Books.Where(book => book.Published && !book.Archived)
            .ExecuteUpdateAsync(update => update.SetProperty(book => book.Archived, true), ct);
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        foreach (var item in items)
        {
            var material = item.Material;
            db.Books.Add(new Book
            {
                Id = item.Id, Title = material.Title, Description = material.Description, Authors = material.Authors,
                Difficulty = material.Difficulty, CoverImagePath = material.CoverImagePath,
                CoverDesignJson = JsonSerializer.Serialize(material.CoverDesign ?? BookCoverDesign.ForTitle(material.Title), options),
                LiteraryTranslation = material.TranslationReviewed ? material.LiteraryTranslation : "",
                DraftTranslation = material.TranslationReviewed ? "" : material.LiteraryTranslation, TranslationReviewed = material.TranslationReviewed,
                IllustrationsJson = JsonSerializer.Serialize(material.Illustrations ?? [], options), Published = true,
                Chapters = material.Chapters.Select(chapter => new BookChapter
                {
                    Id = chapter.Id, BookId = item.Id, Number = chapter.Number, Title = chapter.Title,
                    TokensJson = JsonSerializer.Serialize(chapter.Tokens, options), Translation = chapter.Translation ?? ""
                }).ToList()
            });
            db.ContentRevisions.Add(new ContentRevision
            {
                Kind = "book", ContentId = item.Id, Version = 1, BaseVersion = 0, EditorId = editorId,
                PayloadJson = JsonSerializer.Serialize(material, options), Published = true, PublishedAt = DateTimeOffset.UtcNow
            });
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new(items.Length, archived);
    }
}
