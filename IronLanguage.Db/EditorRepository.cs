using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace IronLanguage.Db;

public sealed record DictionaryMatch(Guid SenseId, bool Approximate);
public sealed record MaterialToken(string Text, Guid? WordId, DictionaryMatch[]? Matches = null);
public sealed record MaterialChapter(Guid Id, int Number, string Title, MaterialToken[] Tokens);
public sealed record WordMaterial(string Ossetian, string Russian, string Example, string? AudioPath);
public sealed record ExerciseMaterial(string Kind, string RussianPrompt, string OssetianAnswer, string[] Tokens, string[] Alternatives, string Explanation, Guid[] WordIds, string? AudioPath, string[][]? Distractors = null);
public sealed record BookMaterial(string Title, string Description, MaterialChapter[] Chapters, string LiteraryTranslation = "",
    string Authors = "", string Difficulty = "", string? CoverImagePath = null);
public sealed record DialogueCharacter(string Id, string Name, string Color);
public sealed record DialogueLine(int Number, string CharacterId, string Text, string? AudioPath = null);
public sealed record DialogueTurn(int LineNumber, string Kind, string[] References, string[] Options, int HintThreshold, bool Skippable);
public sealed record DialogueMaterial(string Title, string Dialect, int Level, DialogueCharacter[] Characters, DialogueLine[] Lines, DialogueTurn[] Turns);
public sealed record EditorItem(string Kind, Guid Id, string Title, bool Published, int Version, Guid? PendingRevisionId, bool Archived);
public sealed record EditorMaterial(string Kind, Guid Id, bool Published, int Version, string PayloadJson);

public interface IEditorRepository
{
    Task<List<EditorItem>> Items(CancellationToken ct = default);
    Task<EditorMaterial?> Material(string kind, Guid id, CancellationToken ct = default);
    Task<Guid> Create(string kind, string payloadJson, CancellationToken ct = default);
    Task<bool> UpdateDraft(string kind, Guid id, string payloadJson, CancellationToken ct = default);
    Task<bool> PublishDraft(string kind, Guid id, Guid editorId, CancellationToken ct = default);
    Task<ContentRevision?> Revision(Guid id, CancellationToken ct = default);
    Task<List<ContentRevision>> History(string kind, Guid id, CancellationToken ct = default);
    Task<Guid?> StartRevision(string kind, Guid id, Guid editorId, CancellationToken ct = default);
    Task<bool> UpdateRevision(Guid id, string payloadJson, CancellationToken ct = default);
    Task<bool> PublishRevision(Guid id, CancellationToken ct = default);
    Task<bool> DeleteDraft(string kind, Guid id, CancellationToken ct = default);
    Task<bool> DeleteRevision(Guid id, CancellationToken ct = default);
    Task<bool> SetArchived(string kind, Guid id, bool archived, CancellationToken ct = default);
}

public sealed class EfEditorRepository(AdamDbContext db) : IEditorRepository
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<List<EditorItem>> Items(CancellationToken ct = default)
    {
        var words = await db.Words.AsNoTracking().Where(x => x.DictionarySenseId == null).ToListAsync(ct);
        var exercises = await db.Exercises.AsNoTracking().ToListAsync(ct);
        var books = await db.Books.AsNoTracking().ToListAsync(ct);
        var dialogues = await db.Dialogues.AsNoTracking().ToListAsync(ct);
        var pending = await db.ContentRevisions.AsNoTracking().Where(x => !x.Published).ToListAsync(ct);
        Guid? Pending(string kind, Guid id) => pending.FirstOrDefault(x => x.Kind == kind && x.ContentId == id)?.Id;
        return words.Select(x => new EditorItem("word", x.Id, x.Ossetian, x.Published, x.Version, Pending("word", x.Id), x.Archived))
            .Concat(exercises.Select(x => new EditorItem(x.Kind, x.Id, x.RussianPrompt, x.Published, x.Version, Pending(x.Kind, x.Id), x.Archived)))
            .Concat(books.Select(x => new EditorItem("book", x.Id, x.Title, x.Published, x.Version, Pending("book", x.Id), x.Archived)))
            .Concat(dialogues.Select(x => new EditorItem("dialogue", x.Id, x.Title, x.Published, x.Version, Pending("dialogue", x.Id), x.Archived)))
            .OrderBy(x => x.Title).ToList();
    }

    public async Task<EditorMaterial?> Material(string kind, Guid id, CancellationToken ct = default)
    {
        if (kind == "word")
        {
            var word = await db.Words.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            return word is null ? null : new(kind, id, word.Published, word.Version, Capture(word));
        }
        if (kind is "audio" or "translation")
        {
            var exercise = await db.Exercises.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.Kind == kind, ct);
            return exercise is null ? null : new(kind, id, exercise.Published, exercise.Version, Capture(exercise));
        }
        if (kind == "book")
        {
            var book = await db.Books.AsNoTracking().Include(x => x.Chapters).SingleOrDefaultAsync(x => x.Id == id, ct);
            return book is null ? null : new(kind, id, book.Published, book.Version, Capture(book));
        }
        if (kind == "dialogue")
        {
            var dialogue = await db.Dialogues.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            return dialogue is null ? null : new(kind, id, dialogue.Published, dialogue.Version, Capture(dialogue));
        }
        return null;
    }

    public async Task<Guid> Create(string kind, string payloadJson, CancellationToken ct = default)
    {
        if (kind == "word")
        {
            var p = Parse<WordMaterial>(payloadJson);
            var word = new WordEntry { Ossetian = p.Ossetian, Russian = p.Russian, Example = p.Example, AudioPath = p.AudioPath };
            db.Words.Add(word); await db.SaveChangesAsync(ct); return word.Id;
        }
        if (kind is "audio" or "translation")
        {
            var p = Parse<ExerciseMaterial>(payloadJson);
            var exercise = new Exercise { Kind = kind, RussianPrompt = p.RussianPrompt, OssetianAnswer = p.OssetianAnswer,
                TokensJson = JsonSerializer.Serialize(p.Tokens), AlternativesJson = JsonSerializer.Serialize(p.Alternatives),
                DistractorsJson = JsonSerializer.Serialize(p.Distractors ?? []),
                WordIdsJson = JsonSerializer.Serialize(p.WordIds), Explanation = p.Explanation, AudioPath = p.AudioPath };
            db.Exercises.Add(exercise); await db.SaveChangesAsync(ct); return exercise.Id;
        }
        if (kind == "book")
        {
            var p = Parse<BookMaterial>(payloadJson);
            var book = new Book { Title = p.Title, Authors = p.Authors, Difficulty = p.Difficulty,
                Description = p.Description, CoverImagePath = p.CoverImagePath, LiteraryTranslation = p.LiteraryTranslation };
            book.Chapters = p.Chapters.Select(x => new BookChapter { Id = x.Id == Guid.Empty ? Guid.NewGuid() : x.Id,
                Number = x.Number, Title = x.Title, TokensJson = JsonSerializer.Serialize(x.Tokens) }).ToList();
            db.Books.Add(book); await db.SaveChangesAsync(ct); return book.Id;
        }
        if (kind == "dialogue")
        {
            var p = Parse<DialogueMaterial>(payloadJson);
            var dialogue = new Dialogue { Title = p.Title, Dialect = p.Dialect, Level = p.Level, ScriptJson = payloadJson };
            db.Dialogues.Add(dialogue); await db.SaveChangesAsync(ct); return dialogue.Id;
        }
        throw new ArgumentException("Unknown material kind", nameof(kind));
    }

    public async Task<bool> UpdateDraft(string kind, Guid id, string payloadJson, CancellationToken ct = default)
    {
        if (kind == "word")
        {
            var word = await db.Words.SingleOrDefaultAsync(x => x.Id == id && !x.Published, ct);
            if (word is null) return false;
            Apply(word, Parse<WordMaterial>(payloadJson));
        }
        else if (kind is "audio" or "translation")
        {
            var exercise = await db.Exercises.SingleOrDefaultAsync(x => x.Id == id && x.Kind == kind && !x.Published, ct);
            if (exercise is null) return false;
            Apply(exercise, Parse<ExerciseMaterial>(payloadJson));
        }
        else if (kind == "book")
        {
            var book = await db.Books.Include(x => x.Chapters).SingleOrDefaultAsync(x => x.Id == id && !x.Published, ct);
            if (book is null) return false;
            Apply(book, Parse<BookMaterial>(payloadJson));
        }
        else if (kind == "dialogue")
        {
            var dialogue = await db.Dialogues.SingleOrDefaultAsync(x => x.Id == id && !x.Published, ct);
            if (dialogue is null) return false;
            Apply(dialogue, Parse<DialogueMaterial>(payloadJson));
        }
        else return false;
        await db.SaveChangesAsync(ct); return true;
    }

    public async Task<bool> PublishDraft(string kind, Guid id, Guid editorId, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var material = await Material(kind, id, ct);
        if (material is null || material.Published) return false;
        if (kind == "word") (await db.Words.SingleAsync(x => x.Id == id, ct)).Published = true;
        else if (kind == "book") (await db.Books.SingleAsync(x => x.Id == id, ct)).Published = true;
        else if (kind == "dialogue") (await db.Dialogues.SingleAsync(x => x.Id == id, ct)).Published = true;
        else (await db.Exercises.SingleAsync(x => x.Id == id, ct)).Published = true;
        db.ContentRevisions.Add(new ContentRevision { Kind = kind, ContentId = id, Version = 1, BaseVersion = 0,
            PayloadJson = material.PayloadJson, Published = true, EditorId = editorId, PublishedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true;
    }

    public Task<ContentRevision?> Revision(Guid id, CancellationToken ct = default) =>
        db.ContentRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);

    public Task<List<ContentRevision>> History(string kind, Guid id, CancellationToken ct = default) =>
        db.ContentRevisions.AsNoTracking().Where(x => x.Kind == kind && x.ContentId == id && x.Published)
            .OrderByDescending(x => x.Version).ToListAsync(ct);

    public async Task<Guid?> StartRevision(string kind, Guid id, Guid editorId, CancellationToken ct = default)
    {
        var material = await Material(kind, id, ct);
        if (material is null || !material.Published) return null;
        var existing = await db.ContentRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.Kind == kind && x.ContentId == id && !x.Published, ct);
        if (existing is not null) return existing.Id;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (!await db.ContentRevisions.AnyAsync(x => x.Kind == kind && x.ContentId == id && x.Published && x.Version == material.Version, ct))
            db.ContentRevisions.Add(new ContentRevision { Kind = kind, ContentId = id, Version = material.Version, BaseVersion = Math.Max(0, material.Version - 1),
                PayloadJson = material.PayloadJson, Published = true, EditorId = editorId, PublishedAt = DateTimeOffset.UtcNow });
        var revision = new ContentRevision { Kind = kind, ContentId = id, Version = material.Version + 1, BaseVersion = material.Version,
            PayloadJson = material.PayloadJson, EditorId = editorId };
        db.ContentRevisions.Add(revision);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return revision.Id;
    }

    public async Task<bool> UpdateRevision(Guid id, string payloadJson, CancellationToken ct = default)
    {
        var revision = await db.ContentRevisions.SingleOrDefaultAsync(x => x.Id == id && !x.Published, ct);
        if (revision is null) return false;
        revision.PayloadJson = payloadJson;
        await db.SaveChangesAsync(ct); return true;
    }

    public async Task<bool> PublishRevision(Guid id, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var revision = await db.ContentRevisions.SingleOrDefaultAsync(x => x.Id == id && !x.Published, ct);
        if (revision is null) return false;
        if (revision.Kind == "word")
        {
            var word = await db.Words.SingleOrDefaultAsync(x => x.Id == revision.ContentId && x.Published && x.Version == revision.BaseVersion, ct);
            if (word is null) return false;
            Apply(word, Parse<WordMaterial>(revision.PayloadJson)); word.Version++;
        }
        else if (revision.Kind is "audio" or "translation")
        {
            var exercise = await db.Exercises.SingleOrDefaultAsync(x => x.Id == revision.ContentId && x.Kind == revision.Kind && x.Published && x.Version == revision.BaseVersion, ct);
            if (exercise is null) return false;
            Apply(exercise, Parse<ExerciseMaterial>(revision.PayloadJson)); exercise.Version++;
        }
        else if (revision.Kind == "book")
        {
            var book = await db.Books.Include(x => x.Chapters).SingleOrDefaultAsync(x => x.Id == revision.ContentId && x.Published && x.Version == revision.BaseVersion, ct);
            if (book is null) return false;
            var payload = Parse<BookMaterial>(revision.PayloadJson);
            Apply(book, payload); book.Version++;
            var first = payload.Chapters.OrderBy(x => x.Number).First();
            var chapters = book.Chapters.ToDictionary(x => x.Id);
            var positions = await db.ReadingPositions.Where(x => x.BookId == book.Id).ToListAsync(ct);
            foreach (var position in positions)
            {
                var chapter = chapters.GetValueOrDefault(position.ChapterId);
                if (chapter is null) { position.ChapterId = first.Id; position.TokenIndex = 0; }
                else position.TokenIndex = Math.Min(position.TokenIndex, Math.Max(0, Parse<MaterialToken[]>(chapter.TokensJson).Length - 1));
            }
        }
        else if (revision.Kind == "dialogue")
        {
            var dialogue = await db.Dialogues.SingleAsync(x => x.Id == revision.ContentId && x.Published && x.Version == revision.BaseVersion, ct);
            if (dialogue is null) return false;
            Apply(dialogue, Parse<DialogueMaterial>(revision.PayloadJson)); dialogue.Version++;
        }
        else return false;
        revision.Published = true; revision.PublishedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true;
    }

    public async Task<bool> DeleteDraft(string kind, Guid id, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (kind == "word")
        {
            var word = await db.Words.SingleOrDefaultAsync(x => x.Id == id && !x.Published && x.DictionarySenseId == null, ct);
            if (word is null) return false;
            db.Words.Remove(word);
        }
        else if (kind is "audio" or "translation")
        {
            var exercise = await db.Exercises.SingleOrDefaultAsync(x => x.Id == id && x.Kind == kind && !x.Published, ct);
            if (exercise is null) return false;
            db.Exercises.Remove(exercise);
        }
        else if (kind == "book")
        {
            var book = await db.Books.Include(x => x.Chapters).SingleOrDefaultAsync(x => x.Id == id && !x.Published, ct);
            if (book is null) return false;
            db.Books.Remove(book);
        }
        else if (kind == "dialogue")
        {
            var dialogue = await db.Dialogues.SingleOrDefaultAsync(x => x.Id == id && !x.Published, ct);
            if (dialogue is null) return false;
            db.Dialogues.Remove(dialogue);
        }
        else return false;
        await db.ContentRevisions.Where(x => x.Kind == kind && x.ContentId == id && !x.Published).ExecuteDeleteAsync(ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    public async Task<bool> DeleteRevision(Guid id, CancellationToken ct = default)
    {
        var revision = await db.ContentRevisions.SingleOrDefaultAsync(x => x.Id == id && !x.Published, ct);
        if (revision is null) return false;
        db.ContentRevisions.Remove(revision);
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> SetArchived(string kind, Guid id, bool archived, CancellationToken ct = default)
    {
        if (kind == "word")
            return await db.Words.Where(x => x.Id == id && x.Published && x.DictionarySenseId == null && x.Archived != archived)
                .ExecuteUpdateAsync(x => x.SetProperty(p => p.Archived, archived), ct) == 1;
        if (kind is "audio" or "translation")
            return await db.Exercises.Where(x => x.Id == id && x.Kind == kind && x.Published && x.Archived != archived)
                .ExecuteUpdateAsync(x => x.SetProperty(p => p.Archived, archived), ct) == 1;
        if (kind == "book")
            return await db.Books.Where(x => x.Id == id && x.Published && x.Archived != archived)
                .ExecuteUpdateAsync(x => x.SetProperty(p => p.Archived, archived), ct) == 1;
        if (kind == "dialogue")
            return await db.Dialogues.Where(x => x.Id == id && x.Published && x.Archived != archived)
                .ExecuteUpdateAsync(x => x.SetProperty(p => p.Archived, archived), ct) == 1;
        return false;
    }

    private static T Parse<T>(string json) => JsonSerializer.Deserialize<T>(json, JsonOptions) ?? throw new ArgumentException("Invalid material payload");
    private static string Capture(WordEntry x) => JsonSerializer.Serialize(new WordMaterial(x.Ossetian, x.Russian, x.Example, x.AudioPath), JsonOptions);
    private static string Capture(Exercise x) => JsonSerializer.Serialize(new ExerciseMaterial(x.Kind, x.RussianPrompt, x.OssetianAnswer,
        Parse<string[]>(x.TokensJson), Parse<string[]>(x.AlternativesJson), x.Explanation, Parse<Guid[]>(x.WordIdsJson), x.AudioPath,
        Parse<string[][]>(x.DistractorsJson)), JsonOptions);
    private static string Capture(Book x) => JsonSerializer.Serialize(new BookMaterial(x.Title, x.Description, x.Chapters.OrderBy(c => c.Number)
        .Select(c => new MaterialChapter(c.Id, c.Number, c.Title, Parse<MaterialToken[]>(c.TokensJson))).ToArray(),
        x.LiteraryTranslation, x.Authors, x.Difficulty, x.CoverImagePath), JsonOptions);
    private static void Apply(WordEntry x, WordMaterial p) { x.Ossetian = p.Ossetian; x.Russian = p.Russian; x.Example = p.Example; x.AudioPath = p.AudioPath; }
    private static void Apply(Exercise x, ExerciseMaterial p)
    {
        x.RussianPrompt = p.RussianPrompt; x.OssetianAnswer = p.OssetianAnswer; x.Explanation = p.Explanation; x.AudioPath = p.AudioPath;
        x.TokensJson = JsonSerializer.Serialize(p.Tokens); x.AlternativesJson = JsonSerializer.Serialize(p.Alternatives); x.WordIdsJson = JsonSerializer.Serialize(p.WordIds);
        x.DistractorsJson = JsonSerializer.Serialize(p.Distractors ?? []);
    }
    private static string Capture(Dialogue x)
    {
        var p = Parse<DialogueMaterial>(x.ScriptJson);
        return JsonSerializer.Serialize(p with { Title = x.Title, Dialect = x.Dialect, Level = x.Level }, JsonOptions);
    }
    private void Apply(Dialogue x, DialogueMaterial p)
    {
        x.Title = p.Title; x.Dialect = p.Dialect; x.Level = p.Level;
        x.ScriptJson = JsonSerializer.Serialize(p, JsonOptions);
    }
    private void Apply(Book x, BookMaterial p)
    {
        x.Title = p.Title; x.Authors = p.Authors; x.Difficulty = p.Difficulty;
        x.Description = p.Description; x.CoverImagePath = p.CoverImagePath; x.LiteraryTranslation = p.LiteraryTranslation;
        var wanted = p.Chapters.Select(c => c.Id).ToHashSet();
        foreach (var old in x.Chapters.Where(c => !wanted.Contains(c.Id)).ToList()) { db.Chapters.Remove(old); x.Chapters.Remove(old); }
        foreach (var chapter in p.Chapters)
        {
            var current = x.Chapters.SingleOrDefault(c => c.Id == chapter.Id);
            if (current is null)
                x.Chapters.Add(new BookChapter { Id = chapter.Id, BookId = x.Id, Number = chapter.Number, Title = chapter.Title, TokensJson = JsonSerializer.Serialize(chapter.Tokens) });
            else { current.Number = chapter.Number; current.Title = chapter.Title; current.TokensJson = JsonSerializer.Serialize(chapter.Tokens); }
        }
    }
}
