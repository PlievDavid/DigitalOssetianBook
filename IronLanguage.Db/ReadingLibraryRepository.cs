using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed record ReadingImportItem(Guid Id, BookMaterial Material);
public sealed record ReadingImportResult(int Added, int Archived);
public sealed record ReadingPublicationItem(Guid Id, BookMaterial Material, string PreviousTranslation);
public sealed record ReadingPublicationResult(int Added, int Updated, int Unchanged);

public interface IReadingLibraryRepository
{
    Task<ReadingImportResult> ReplaceLibrary(ReadingImportItem[] items, Guid editorId, CancellationToken ct);
    Task<ReadingPublicationResult> PublishSeeds(ReadingPublicationItem[] items, Guid editorId, CancellationToken ct);
}

public sealed class EfReadingLibraryRepository(AdamDbContext db) : IReadingLibraryRepository
{
    public async Task<ReadingPublicationResult> PublishSeeds(ReadingPublicationItem[] items, Guid editorId, CancellationToken ct)
    {
        if (items.Length != 3 || items.Select(item => item.Id).Distinct().Count() != 3
            || items.Any(item => !item.Material.TranslationReviewed || item.Material.Chapters.Length != 1
                || string.IsNullOrWhiteSpace(item.Material.Chapters[0].Translation) || item.Material.Chapters[0].Translation.Contains('⚠')))
            throw new ArgumentException("Нужны три произведения с проверенным переводом.");
        if (!await db.Users.AnyAsync(user => user.Id == editorId && user.IsEditor, ct))
            throw new InvalidOperationException("Сиды должен публиковать редактор.");
        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(1938238190)", ct);
        var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var editor = new EfEditorRepository(db);
        var added = 0; var updated = 0; var unchanged = 0;
        foreach (var item in items)
        {
            var seed = item.Material;
            var book = await db.Books.Include(book => book.Chapters).SingleOrDefaultAsync(book => book.Id == item.Id, ct);
            if (book is null)
            {
                book = new Book { Id = item.Id, Title = seed.Title, Authors = seed.Authors, Description = seed.Description,
                    Difficulty = seed.Difficulty, Published = true, TranslationReviewed = true,
                    CoverDesignJson = JsonSerializer.Serialize(seed.CoverDesign ?? BookCoverDesign.ForTitle(seed.Title), json),
                    IllustrationsJson = JsonSerializer.Serialize(seed.Illustrations ?? [], json),
                    Chapters = seed.Chapters.Select(chapter => new BookChapter { Id = chapter.Id, BookId = item.Id,
                        Number = chapter.Number, Title = chapter.Title, Translation = chapter.Translation,
                        TokensJson = JsonSerializer.Serialize(chapter.Tokens, json) }).ToList() };
                db.Books.Add(book);
                db.ContentRevisions.Add(new ContentRevision { Kind = "book", ContentId = book.Id, Version = 1,
                    PayloadJson = JsonSerializer.Serialize(seed, json), Published = true, EditorId = editorId, PublishedAt = DateTimeOffset.UtcNow });
                added++;
                continue;
            }
            // Subsequent runs preserve editor publications and intentional archival.
            if (book.Archived || book.TranslationReviewed) { unchanged++; continue; }
            var before = (await editor.Material("book", book.Id, ct))!;
            var material = JsonSerializer.Deserialize<BookMaterial>(before.PayloadJson, json)!;
            var chapter = material.Chapters.SingleOrDefault();
            var expected = seed.Chapters[0];
            var translation = string.IsNullOrEmpty(chapter?.Translation) ? material.LiteraryTranslation : chapter.Translation;
            if (!book.Published || chapter is null || chapter.Id != expected.Id
                || string.Concat(chapter.Tokens.Select(token => token.Text)) != string.Concat(expected.Tokens.Select(token => token.Text))
                || translation != item.PreviousTranslation && translation != expected.Translation)
                throw new InvalidOperationException($"«{book.Title}» изменено редактором: автоматическое обновление отменено.");
            var pending = await db.ContentRevisions.SingleOrDefaultAsync(revision => revision.Kind == "book"
                && revision.ContentId == book.Id && !revision.Published, ct);
            if (pending is not null && pending.BaseVersion != book.Version)
                throw new InvalidOperationException($"У «{book.Title}» есть устаревший черновик: сначала разрешите конфликт версий.");
            if (!await db.ContentRevisions.AnyAsync(revision => revision.Kind == "book" && revision.ContentId == book.Id
                && revision.Published && revision.Version == book.Version, ct))
                db.ContentRevisions.Add(new ContentRevision { Kind = "book", ContentId = book.Id, Version = book.Version,
                    BaseVersion = book.Version - 1, PayloadJson = before.PayloadJson, Published = true, EditorId = editorId,
                    PublishedAt = DateTimeOffset.UtcNow });
            var publication = material with { Chapters = [chapter with { Translation = expected.Translation }],
                LiteraryTranslation = "", TranslationReviewed = true,
                Description = material.Description == "Осетинский оригинал и черновой подстрочный перевод для редакторской проверки." ? seed.Description : material.Description };
            var oldVersion = book.Version;
            book.Chapters.Single().Translation = expected.Translation;
            book.LiteraryTranslation = ""; book.DraftTranslation = ""; book.TranslationReviewed = true;
            book.Description = publication.Description; book.Version++;
            db.ContentRevisions.Add(new ContentRevision { Kind = "book", ContentId = book.Id, Version = book.Version,
                BaseVersion = oldVersion, PayloadJson = JsonSerializer.Serialize(publication, json), Published = true,
                EditorId = editorId, PublishedAt = DateTimeOffset.UtcNow });
            if (pending is not null)
            {
                // Rebase the user's draft without publishing its other changes or losing its ID.
                var draft = JsonSerializer.Deserialize<BookMaterial>(pending.PayloadJson, json)!;
                var inherited = draft.Chapters.Length == 1 && draft.Chapters[0].Id == chapter.Id
                    && (string.IsNullOrEmpty(draft.Chapters[0].Translation) ? draft.LiteraryTranslation : draft.Chapters[0].Translation) == translation;
                if (inherited)
                    draft = draft with { Chapters = [draft.Chapters[0] with { Translation = expected.Translation }],
                        LiteraryTranslation = "", TranslationReviewed = string.Concat(draft.Chapters[0].Tokens.Select(token => token.Text))
                            == string.Concat(chapter.Tokens.Select(token => token.Text)) };
                pending.BaseVersion = book.Version; pending.Version = book.Version + 1;
                pending.PayloadJson = JsonSerializer.Serialize(draft, json);
            }
            updated++;
        }
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return new(added, updated, unchanged);
    }

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
