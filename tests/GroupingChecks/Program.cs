using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Services;

await GroupingChecks.Run();

static class GroupingChecks
{
    const string Groups = "Существительные\nПрилагательные";
    const string Words = "фӕндыр | 1\nкъӕбиц | 1\nрӕсугъд | 2\nхъӕздыг | 2\nбӕлас | 1";

    public static async Task Run()
    {
        TestParseValid();
        TestParseRejectsBrokenMarkup();
        await TestStartSnapshot();
        await TestStartRejectsInvalidMaterial();
        await TestWrongThenCorrect();
        await TestRepeatDoesNotCountTwice();
        await TestInvalidIndices();
        await TestAnotherOwnerCannotContinue();
        await TestMissingMaterial();

        Console.WriteLine("Grouping checks passed.");
    }

    static void TestParseValid()
    {
        var (material, errors) = GroupingScript.Parse("Части речи", Groups, Words);
        Require(errors.Length == 0, string.Join("; ", errors));
        Require(material is not null);
        var parsed = material!;
        Require(parsed.Title == "Части речи");
        Require(parsed.Groups.Length == 2);
        Require(parsed.Groups[0] == "Существительные" && parsed.Groups[1] == "Прилагательные");
        Require(parsed.Words.Length == 5);
        Require(parsed.Words[0] == new GroupingWord("фӕндыр", 0));
        Require(parsed.Words[2] == new GroupingWord("рӕсугъд", 1));
    }

    static void TestParseRejectsBrokenMarkup()
    {
        Reject("", Groups, Words);
        Reject("Title", "Одна группа", "слово | 1\nвторое | 1\nтретье | 1\nчетвёртое | 1");
        Reject("Title", "Одна\nОдна", Words);
        Reject("Title", "Одна\nДве", "слово | 1\nслово | 2\nтретье | 1\nчетвёртое | 2");
        Reject("Title", "Одна\nДве", "слово | 1\nвторое | 2\nтретье | 3\nчетвёртое | 2");
        Reject("Title", "Одна\nДве", "слово | 1\nвторое\nтретье | 1\nчетвёртое | 2");
        Reject("Title", "Одна\nДве", "слово | 1\nвторое | 1\nтретье | 1\nчетвёртое | 2\nпятое | 2");
        Reject("Title", "Одна\nДве", "word | 1\nвторое | 1\nтретье | 2\nчетвёртое | 2");
        Reject("Title", "Одна группа без слов\nВторая", "слово | 2\nвторое | 2\nтретье | 2\nчетвёртое | 2");
        Reject("Заголовок Latin", Groups, Words);
        Reject("Title", "Одна\nДве", "один | 1\nдва | 1\nтри | 1");
        Reject("Title", "Одна\nДве", Words.Replace("фӕндыр | 1", "фӕндыр"));
        Reject("Title", "Одна\nДве", Words.Replace("фӕндыр | 1", "фӕндыр | 01"));
        Reject("Title", "Одна\nДве", Words.Replace("фӕндыр | 1", "фӕндыр | +1"));

        static void Reject(string title, string groups, string words)
        {
            var (material, errors) = GroupingScript.Parse(title, groups, words);
            Require(material is null);
            Require(errors.Length > 0);
        }
    }

    static async Task TestStartSnapshot()
    {
        var env = new TestEnvironment();
        var linked = new WordEntry { Ossetian = "фӕндыр", Russian = "желание", Published = true };
        env.Catalog.WordsList.Add(linked);
        var material = Create(env, out var entity);
        var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        entity.ScriptJson = JsonSerializer.Serialize(material with { WordIds = [linked.Id] }, jsonOptions);
        var owner = Guid.NewGuid();
        var sessionId = Guid.NewGuid();
        var service = new GroupingService(env.Catalog, env.Guests);
        var board = await service.Start(owner, sessionId, entity.Id, CancellationToken.None)
            ?? throw new Exception("Ожидалось начало задания.");
        Require(board.SessionId == sessionId && board.MaterialId == entity.Id);
        Require(board.Title == material.Title && board.Version == 1);
        Require(board.Groups.SequenceEqual(material.Groups));
        Require(board.Tiles.Length == material.Words.Length);
        Require(board.Total == material.Words.Length && board.Placed == 0 && !board.Finished);
        Require(board.Tiles.All(tile => !tile.Solved && tile.Group is null));
        Require(board.Tiles.Select(tile => tile.Text).OrderBy(x => x, StringComparer.Ordinal)
            .SequenceEqual(material.Words.Select(word => word.Text).OrderBy(x => x, StringComparer.Ordinal)));
        Require(board.Words.Length == 1 && board.Words[0].Id == linked.Id);

        // Материал изменился после старта — занятие продолжает использовать снимок.
        entity.ScriptJson = JsonSerializer.Serialize(new GroupingMaterial("Другое", ["А", "Б"],
            [new GroupingWord("иное", 0), new GroupingWord("слово", 0), new GroupingWord("ещё", 0), new GroupingWord("одно", 1)], []),
            jsonOptions);
        var restored = await service.Board(owner, sessionId, CancellationToken.None)
            ?? throw new Exception("Ожидалось восстановление занятия.");
        Require(restored.Title == material.Title);
        Require(restored.Words.Length == 1 && restored.Words[0].Id == linked.Id);
        Require(restored.Tiles.Select(tile => tile.Text).OrderBy(x => x, StringComparer.Ordinal)
            .SequenceEqual(material.Words.Select(word => word.Text).OrderBy(x => x, StringComparer.Ordinal)));
    }

    static async Task TestStartRejectsInvalidMaterial()
    {
        var env = new TestEnvironment();
        var service = new GroupingService(env.Catalog, env.Guests);
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var payloads = new[]
        {
            new GroupingMaterial("Одна группа", ["Одна"], Four(0), []),
            new GroupingMaterial("Слишком много групп", [.. Enumerable.Range(1, 7).Select(index => $"Группа {index}")], Four(0), []),
            new GroupingMaterial("Мало слов", ["А", "Б"], [new("один", 0), new("два", 0), new("три", 1)], []),
            new GroupingMaterial("Много слов", ["А", "Б"],
                [.. Enumerable.Range(1, 31).Select(index => new GroupingWord($"слово {index}", index % 2))], []),
            new GroupingMaterial("Неверная группа", ["А", "Б"], Four(2), [])
        };
        foreach (var payload in payloads)
        {
            var entity = new Grouping
            {
                Title = payload.Title,
                Published = true,
                ScriptJson = JsonSerializer.Serialize(payload, options)
            };
            env.Catalog.GroupingsList.Add(entity);
            try
            {
                await service.Start(Guid.NewGuid(), Guid.NewGuid(), entity.Id, CancellationToken.None);
                Require(false, $"Материал «{payload.Title}» должен быть отклонён.");
            }
            catch (InvalidOperationException) { }
        }

        static GroupingWord[] Four(int group) =>
            [new("один", group), new("два", group), new("три", group), new("четыре", group)];
    }

    static async Task TestWrongThenCorrect()
    {
        var env = new TestEnvironment();
        Create(env, out var entity);
        var owner = Guid.NewGuid();
        var service = new GroupingService(env.Catalog, env.Guests);
        var board = await service.Start(owner, Guid.NewGuid(), entity.Id, CancellationToken.None)
            ?? throw new Exception("Ожидалось начало задания.");
        var tile = board.Tiles[0];
        var first = await service.Check(owner, board.SessionId, tile.Index, 0, CancellationToken.None)
            ?? throw new Exception("Ожидался результат проверки.");
        if (first.Correct)
        {
            Require(first.Placed == 1);
            Require(first.Tiles.Single(x => x.Index == tile.Index) is { Solved: true, Group: 0 });
        }
        else
        {
            Require(first.Placed == 0);
            Require(first.Tiles.Single(x => x.Index == tile.Index) is { Solved: false, Group: null });
            var second = await service.Check(owner, board.SessionId, tile.Index, 1, CancellationToken.None)
                ?? throw new Exception("Ожидался результат проверки.");
            Require(second.Correct && second.Placed == 1);
            Require(second.Tiles.Single(x => x.Index == tile.Index) is { Solved: true, Group: 1 });
        }

        var placed = 1;
        foreach (var next in board.Tiles.Where(x => x.Index != tile.Index))
        {
            var attempt = await service.Check(owner, board.SessionId, next.Index, 0, CancellationToken.None)
                ?? throw new Exception("Ожидался результат проверки.");
            if (!attempt.Correct)
            {
                attempt = await service.Check(owner, board.SessionId, next.Index, 1, CancellationToken.None)
                    ?? throw new Exception("Ожидался результат проверки.");
                Require(attempt.Correct);
            }
            placed++;
            Require(attempt.Placed == placed);
            Require(attempt.Finished == (placed == board.Total));
        }
        Require(placed == board.Total);
    }

    static async Task TestRepeatDoesNotCountTwice()
    {
        var env = new TestEnvironment();
        Create(env, out var entity);
        var owner = Guid.NewGuid();
        var service = new GroupingService(env.Catalog, env.Guests);
        var board = await service.Start(owner, Guid.NewGuid(), entity.Id, CancellationToken.None)
            ?? throw new Exception("Ожидалось начало задания.");
        var tile = board.Tiles[0];
        var first = await service.Check(owner, board.SessionId, tile.Index, 0, CancellationToken.None)
            ?? throw new Exception("Ожидался результат проверки.");
        var correctGroup = first.Correct ? 0 : 1;
        if (!first.Correct)
        {
            first = await service.Check(owner, board.SessionId, tile.Index, 1, CancellationToken.None)
                ?? throw new Exception("Ожидался результат проверки.");
            Require(first.Correct);
        }
        var repeat = await service.Check(owner, board.SessionId, tile.Index, correctGroup, CancellationToken.None)
            ?? throw new Exception("Ожидался результат проверки.");
        Require(repeat.Correct && repeat.Placed == first.Placed);
        var wrongGroupRepeat = await service.Check(owner, board.SessionId, tile.Index, 1 - correctGroup, CancellationToken.None)
            ?? throw new Exception("Ожидался результат проверки.");
        Require(wrongGroupRepeat.Correct && wrongGroupRepeat.Placed == first.Placed);
        Require(wrongGroupRepeat.Tiles.Single(x => x.Index == tile.Index).Group == correctGroup);
    }

    static async Task TestInvalidIndices()
    {
        var env = new TestEnvironment();
        Create(env, out var entity);
        var owner = Guid.NewGuid();
        var service = new GroupingService(env.Catalog, env.Guests);
        var board = await service.Start(owner, Guid.NewGuid(), entity.Id, CancellationToken.None)
            ?? throw new Exception("Ожидалось начало задания.");
        foreach (var (word, group) in new[] { (-1, 0), (0, -1), (board.Total, 0), (0, 2), (99, 99) })
        {
            try
            {
                await service.Check(owner, board.SessionId, word, group, CancellationToken.None);
                Require(false, $"word {word}, group {group} must be rejected");
            }
            catch (ArgumentException) { }
        }
    }

    static async Task TestAnotherOwnerCannotContinue()
    {
        var env = new TestEnvironment();
        Create(env, out var entity);
        var owner = Guid.NewGuid();
        var service = new GroupingService(env.Catalog, env.Guests);
        var board = await service.Start(owner, Guid.NewGuid(), entity.Id, CancellationToken.None)
            ?? throw new Exception("Ожидалось начало задания.");
        var other = Guid.NewGuid();
        Require(await service.Board(other, board.SessionId, CancellationToken.None) is null);
        Require(await service.Check(other, board.SessionId, 0, 0, CancellationToken.None) is null);
    }

    static async Task TestMissingMaterial()
    {
        var service = new GroupingService(new MemoryCatalog(), new GuestLearningStore());
        Require(await service.Start(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None) is null);
    }

    static GroupingMaterial Create(TestEnvironment env, out Grouping entity)
    {
        var (material, errors) = GroupingScript.Parse("Части речи", Groups, Words);
        Require(errors.Length == 0, string.Join("; ", errors));
        Require(material is not null);
        var parsed = material!;
        entity = new Grouping
        {
            Id = Guid.NewGuid(),
            Title = parsed.Title,
            Published = true,
            ScriptJson = JsonSerializer.Serialize(parsed, new JsonSerializerOptions(JsonSerializerDefaults.Web))
        };
        env.Catalog.GroupingsList.Add(entity);
        return parsed;
    }

    static void Require(bool condition, string? message = null)
    {
        if (!condition) throw new Exception(message ?? "Grouping check failed");
    }
}

sealed class MemoryCatalog : ICatalogRepository
{
    public List<Exercise> ExercisesList = [];
    public List<Grouping> GroupingsList = [];
    public List<WordEntry> WordsList = [];
    public Task<List<Exercise>> Exercises(string? kind = null, CancellationToken ct = default) =>
        Task.FromResult(ExercisesList.Where(x => x.Published && (kind == null || x.Kind == kind)).ToList());
    public Task<Exercise?> Exercise(Guid id, bool includeDraft = false, CancellationToken ct = default) =>
        Task.FromResult(ExercisesList.FirstOrDefault(x => x.Id == id && (x.Published || includeDraft)));
    public Task<List<WordEntry>> Words(CancellationToken ct = default) =>
        Task.FromResult(WordsList.Where(x => x.Published && !x.Archived).ToList());
    public Task<WordEntry?> Word(Guid id, CancellationToken ct = default) =>
        Task.FromResult(WordsList.FirstOrDefault(x => x.Id == id && x.Published && !x.Archived));
    public Task<List<Book>> Books(CancellationToken ct = default) => Task.FromResult(new List<Book>());
    public Task<Book?> Book(Guid id, CancellationToken ct = default) => Task.FromResult<Book?>(null);
    public Task<List<Dialogue>> Dialogues(CancellationToken ct = default) => Task.FromResult(new List<Dialogue>());
    public Task<Dialogue?> Dialogue(Guid id, CancellationToken ct = default) => Task.FromResult<Dialogue?>(null);
    public Task<List<Matching>> Matchings(CancellationToken ct = default) => Task.FromResult(new List<Matching>());
    public Task<Matching?> Matching(Guid id, CancellationToken ct = default) => Task.FromResult<Matching?>(null);
    public Task<List<PictureMatching>> Pictures(CancellationToken ct = default) => Task.FromResult(new List<PictureMatching>());
    public Task<PictureMatching?> Picture(Guid id, CancellationToken ct = default) => Task.FromResult<PictureMatching?>(null);
    public Task<List<Grouping>> Groupings(CancellationToken ct = default) =>
        Task.FromResult(GroupingsList.Where(x => x.Published && !x.Archived).ToList());
    public Task<Grouping?> Grouping(Guid id, CancellationToken ct = default) =>
        Task.FromResult(GroupingsList.FirstOrDefault(x => x.Id == id && x.Published && !x.Archived));
    public Task<List<Exercise>> DraftExercises(CancellationToken ct = default) => Task.FromResult(ExercisesList.Where(x => !x.Published).ToList());
    public Task<List<Book>> DraftBooks(CancellationToken ct = default) => Task.FromResult(new List<Book>());
    public Task<List<WordEntry>> DraftWords(CancellationToken ct = default) => Task.FromResult(WordsList.Where(x => !x.Published).ToList());
    public Task AddExercise(Exercise exercise, CancellationToken ct = default) { ExercisesList.Add(exercise); return Task.CompletedTask; }
    public Task AddBook(Book book, CancellationToken ct = default) => Task.CompletedTask;
    public Task<bool> AddChapter(BookChapter chapter, CancellationToken ct = default) => Task.FromResult(false);
    public Task AddWord(WordEntry word, CancellationToken ct = default) { WordsList.Add(word); return Task.CompletedTask; }
    public Task<bool> PublishExercise(Guid id, CancellationToken ct = default) => Task.FromResult(false);
    public Task<bool> PublishBook(Guid id, CancellationToken ct = default) => Task.FromResult(false);
    public Task<bool> PublishWord(Guid id, CancellationToken ct = default) => Task.FromResult(false);
}

sealed class TestEnvironment
{
    public MemoryCatalog Catalog { get; } = new();
    public GuestLearningStore Guests { get; } = new();
}
