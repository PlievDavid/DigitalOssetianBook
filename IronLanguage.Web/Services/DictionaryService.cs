using System.Globalization;
using System.Text;
using IronLanguage.Db;
using Microsoft.EntityFrameworkCore;
using Microsoft.VisualBasic.FileIO;

namespace IronLanguage.Web.Services;

public sealed class DictionaryService(AdamDbContext db)
{
    public static (int Rows, int Meanings) InspectSource(string path)
    {
        using var parser = new TextFieldParser(path, Encoding.UTF8) { TextFieldType = FieldType.Delimited, HasFieldsEnclosedInQuotes = true };
        parser.SetDelimiters(",");
        var header = parser.ReadFields() ?? [];
        parser.ReadFields();
        if (header.Length < 8 || header[0].TrimStart('\uFEFF') != "rus" || header[4] != "ose")
            throw new InvalidDataException("Unexpected dictionary columns.");
        var rows = 0; var meanings = 0;
        while (!parser.EndOfData)
        {
            var cells = parser.ReadFields() ?? [];
            rows++;
            meanings += Enumerable.Range(4, 4).Count(index => index < cells.Length && !string.IsNullOrWhiteSpace(cells[index]));
        }
        return (rows, meanings);
    }

    public Task<List<DictionarySense>> Meanings(Guid[] ids, CancellationToken ct) =>
        db.DictionarySenses.AsNoTracking().Where(x => ids.Contains(x.Id)).ToListAsync(ct);

    public async Task<Guid?> EnsureSavedWord(Guid senseId, CancellationToken ct)
    {
        var sense = await db.DictionarySenses.AsNoTracking().SingleOrDefaultAsync(x => x.Id == senseId && x.Active, ct);
        if (sense is null) return null;
        var existing = await db.Words.AsNoTracking().SingleOrDefaultAsync(x => x.DictionarySenseId == senseId, ct);
        if (existing is not null) return existing.Id;
        var word = new WordEntry
        {
            Ossetian = sense.Ossetian, Russian = sense.Russian, DictionaryNote = sense.Note,
            DictionarySenseId = sense.Id, Published = true
        };
        db.Words.Add(word);
        try { await db.SaveChangesAsync(ct); return word.Id; }
        catch (DbUpdateException)
        {
            db.Entry(word).State = EntityState.Detached;
            return (await db.Words.AsNoTracking().SingleOrDefaultAsync(x => x.DictionarySenseId == senseId, ct))?.Id;
        }
    }

    public static string Key(string text)
    {
        var value = text.Trim().Trim('\uFEFF').Replace('æ', 'ӕ').Replace('Æ', 'Ӕ')
            .Replace("\u0301", "").Normalize(NormalizationForm.FormC).ToLowerInvariant();
        var first = 0;
        while (first < value.Length && !char.IsLetter(value[first])) first++;
        var last = value.Length - 1;
        while (last >= first && !char.IsLetter(value[last])) last--;
        return last < first ? "" : value[first..(last + 1)];
    }

    public async Task<BookMaterial> Prepare(BookMaterial book, CancellationToken ct)
    {
        var forms = await db.DictionaryForms.AsNoTracking().Join(db.DictionarySenses.AsNoTracking().Where(x => x.Active),
            f => f.SenseId, s => s.Id, (f, s) => new { f.SearchKey, f.SenseId }).ToListAsync(ct);
        var byKey = forms.GroupBy(x => x.SearchKey).ToDictionary(x => x.Key, x => x.Select(y => y.SenseId).Distinct().ToArray());
        var keys = book.Chapters.SelectMany(x => x.Tokens).Select(x => Key(x.Text)).Where(x => x.Length > 0).Distinct().ToArray();
        var matches = new Dictionary<string, DictionaryMatch[]>();
        foreach (var key in keys)
        {
            if (byKey.TryGetValue(key, out var exact))
            {
                matches[key] = exact.Select(id => new DictionaryMatch(id, false)).ToArray();
                continue;
            }
            if (key.Length < 5) { matches[key] = []; continue; }
            matches[key] = byKey.Keys.Where(candidate => IsSimilar(key, candidate))
                .OrderByDescending(candidate => CommonPrefix(key, candidate))
                .ThenBy(candidate => Math.Abs(candidate.Length - key.Length))
                .ThenBy(candidate => candidate, StringComparer.Ordinal)
                .SelectMany(candidate => byKey[candidate]).Distinct().Take(5)
                .Select(id => new DictionaryMatch(id, true)).ToArray();
        }
        return book with { Chapters = book.Chapters.Select(chapter => chapter with
        {
            Tokens = chapter.Tokens.Select(token => token with
            {
                Matches = matches.GetValueOrDefault(Key(token.Text), [])
            }).ToArray()
        }).ToArray() };
    }

    private static int CommonPrefix(string a, string b)
    {
        var i = 0;
        while (i < a.Length && i < b.Length && a[i] == b[i]) i++;
        return i;
    }

    private static bool IsSimilar(string a, string b)
    {
        if (b.Contains(' ')) return false;
        var prefix = CommonPrefix(a, b);
        return prefix >= 4 && prefix >= Math.Ceiling(.7 * Math.Min(a.Length, b.Length))
            && a.Length - prefix <= 4 && b.Length - prefix <= 4;
    }

    public async Task<int> ImportAndRebuild(string path, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        using var parser = new TextFieldParser(path, Encoding.UTF8) { TextFieldType = FieldType.Delimited, HasFieldsEnclosedInQuotes = true };
        parser.SetDelimiters(",");
        parser.ReadFields(); parser.ReadFields();
        var existing = await db.DictionarySenses.ToListAsync(ct);
        var byContent = existing.GroupBy(x => (x.RussianHeadword, x.Ossetian, x.SourceColumn))
            .ToDictionary(x => x.Key, x => new Queue<DictionarySense>(x.OrderBy(y => y.SourceRow)));
        foreach (var sense in existing) sense.Active = false;
        var sourceRow = 2;
        var headword = "";
        var headnote = "";
        var count = 0;
        while (!parser.EndOfData)
        {
            var cells = parser.ReadFields() ?? [];
            sourceRow++;
            if (cells.Length < 5) continue;
            if (!string.IsNullOrWhiteSpace(cells[0])) { headword = cells[0].Trim().Trim('\uFEFF'); headnote = cells.ElementAtOrDefault(1)?.Trim() ?? ""; }
            if (headword.Length == 0) continue;
            for (var column = 4; column <= 7 && column < cells.Length; column++)
            {
                var ossetian = cells[column].Trim();
                if (ossetian.Length == 0) continue;
                var rowNote = cells.ElementAtOrDefault(1)?.Trim() ?? "";
                var senseLabel = cells.ElementAtOrDefault(3)?.Trim() ?? "";
                var note = string.Join(" · ", new[] { headnote, rowNote == headnote ? "" : rowNote, senseLabel }
                    .Where(x => x.Length > 0));
                var identity = (headword, ossetian, column);
                DictionarySense sense;
                if (byContent.TryGetValue(identity, out var old) && old.Count > 0) sense = old.Dequeue();
                else
                {
                    sense = new DictionarySense();
                    db.DictionarySenses.Add(sense);
                }
                sense.SourceRow = sourceRow;
                sense.SourceColumn = column;
                sense.Ossetian = ossetian;
                sense.RussianHeadword = headword;
                sense.Russian = RussianAnswer(headword);
                sense.Note = note;
                sense.Active = true;
                count++;
            }
        }
        await db.SaveChangesAsync(ct);
        await db.DictionaryForms.ExecuteDeleteAsync(ct);
        var active = await db.DictionarySenses.Where(x => x.Active).ToListAsync(ct);
        foreach (var sense in active)
        {
            var parts = sense.Ossetian.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            var forms = parts.Length > 1 && parts.All(part => part.All(ch => char.IsLetter(ch) || char.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark))
                ? parts : [sense.Ossetian];
            foreach (var form in forms.Select(Key).Where(x => x.Length > 0).Distinct())
                db.DictionaryForms.Add(new DictionaryForm { SenseId = sense.Id, SearchKey = form });
        }
        await db.SaveChangesAsync(ct);
        var savedDictionaryWords = await db.Words.Where(x => x.DictionarySenseId != null).ToListAsync(ct);
        foreach (var word in savedDictionaryWords)
        {
            var sense = active.SingleOrDefault(x => x.Id == word.DictionarySenseId);
            if (sense is null) continue;
            word.Ossetian = sense.Ossetian;
            word.Russian = sense.Russian;
            word.DictionaryNote = sense.Note;
        }
        var books = await db.Books.Include(x => x.Chapters).ToListAsync(ct);
        foreach (var book in books)
        {
            var material = new BookMaterial(book.Title, book.Description, book.Chapters.Select(chapter =>
                new MaterialChapter(chapter.Id, chapter.Number, chapter.Title,
                    System.Text.Json.JsonSerializer.Deserialize<MaterialToken[]>(chapter.TokensJson,
                        new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)) ?? [])).ToArray(),
                book.LiteraryTranslation, book.Authors, book.Difficulty, book.CoverImagePath);
            var prepared = await Prepare(material, ct);
            foreach (var chapter in book.Chapters)
                chapter.TokensJson = System.Text.Json.JsonSerializer.Serialize(prepared.Chapters.Single(x => x.Id == chapter.Id).Tokens,
                    new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        }
        var jsonOptions = new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web);
        var pending = await db.ContentRevisions.Where(x => x.Kind == "book" && !x.Published).ToListAsync(ct);
        foreach (var revision in pending)
        {
            var draft = System.Text.Json.JsonSerializer.Deserialize<BookMaterial>(revision.PayloadJson, jsonOptions);
            if (draft is not null)
                revision.PayloadJson = System.Text.Json.JsonSerializer.Serialize(await Prepare(draft, ct), jsonOptions);
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return count;
    }

    private static string RussianAnswer(string headword)
    {
        var baseForm = headword.Split(',')[0].Trim().Replace("\u0301", "");
        return baseForm.TrimEnd('0', '1', '2', '3', '4', '5', '6', '7', '8', '9');
    }
}
