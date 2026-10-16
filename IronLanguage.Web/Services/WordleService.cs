using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record WordleWord(int Id, string Word, string Russian);
public sealed record WordleData(int Version, DateOnly StartDate, WordleWord[] Answers, string[] Allowed);
public sealed record WordleRow(string Word, string[] Marks);
public sealed record WordleState(DateOnly Day, DateTimeOffset NextDay, int Revision, WordleRow[] Rows, bool Won, bool Finished, string? Answer, string? Russian, bool CountedInStreak);
public sealed class WordleConflictException(string message) : Exception(message);

public sealed class WordleCatalog
{
    public WordleData Data { get; }
    private readonly HashSet<string> allowed;
    public WordleCatalog(IWebHostEnvironment environment)
    {
        Data = JsonSerializer.Deserialize<WordleData>(File.ReadAllText(Path.Combine(environment.ContentRootPath, "Data/wordle/words.json")), new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new InvalidOperationException("Не удалось загрузить слова Пять букв.");
        if (Data.Answers.Length != 300 || Data.Answers.Select(x => x.Word).Distinct().Count() != 300 || Data.Answers.Any(x => !ValidWord(x.Word)))
            throw new InvalidOperationException("В наборе Пять букв должно быть 300 разных слов из пяти букв.");
        allowed = Data.Allowed.ToHashSet(StringComparer.Ordinal);
        if (Data.Answers.Any(x => !allowed.Contains(x.Word))) throw new InvalidOperationException("Ответ отсутствует в словаре Пять букв.");
    }
    public WordleWord ForDay(DateOnly day) => Data.Answers[((day.DayNumber - Data.StartDate.DayNumber) % 300 + 300) % 300];
    public bool Accepts(string word) => allowed.Contains(word);
    public static string Normalize(string text) => text.Trim().Replace('æ', 'ӕ').Replace('Æ', 'Ӕ').Replace("\u0301", "").ToLowerInvariant();
    public static bool ValidWord(string word) => word.Length == 5 && word.All(c => c is >= 'а' and <= 'я' or 'ӕ' or 'ё');
}

public sealed class WordleService(WordleCatalog catalog, IWordleRepository repository, IProgressRepository progress, GuestLearningStore guests, TimeProvider clock)
{
    public DateOnly Today => DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    private WordleGame Initial(Guid owner, DateOnly day)
    {
        var word = catalog.ForDay(day);
        return new() { UserId = owner, Day = day, ExpectedWord = word.Word, Russian = word.Russian };
    }
    private static Guid DayId(DateOnly day) => new($"00000000-0000-0000-0000-{day.DayNumber:x12}");
    private GuestLearningStore.Entry<WordleGame> Guest(Guid owner, DateOnly day) =>
        guests.GetOrAdd(owner, DayId(day), () => Initial(owner, day));

    public async Task<WordleState> Open(Guid? userId, Guid guestOwner, CancellationToken ct)
    {
        var day = Today;
        if (userId is Guid uid) return State(await repository.Find(uid, day, ct) ?? Initial(uid, day), true);
        var entry = guests.Find<WordleGame>(guestOwner, DayId(day));
        if (entry is null) return State(Initial(guestOwner, day), false);
        await entry.Gate.WaitAsync(ct);
        try { return State(entry.Value, false); }
        finally { entry.Gate.Release(); }
    }

    public async Task<WordleState> Guess(Guid? userId, Guid guestOwner, DateOnly day, int revision, string input, CancellationToken ct)
    {
        if (day != Today) throw new WordleConflictException("Слово дня сменилось. Обновите игру.");
        var guess = WordleCatalog.Normalize(input);
        if (!WordleCatalog.ValidWord(guess)) throw new ArgumentException("Введите пять осетинских букв.");
        if (!catalog.Accepts(guess)) throw new ArgumentException("Этого слова нет в нашем словаре. Попытка не потрачена.");
        if (revision is < 0 or > 6) throw new ArgumentException("Некорректный номер попытки.");
        if (userId is Guid uid)
        {
            var game = await repository.Open(Initial(uid, day), ct);
            var updated = Advance(game, revision, guess);
            if (updated && !await repository.Save(uid, day, revision, game.GuessesJson, game.Won, clock.GetUtcNow(), ct))
            {
                game = await repository.Open(Initial(uid, day), ct);
                AdvanceForRetry(game, revision, guess);
            }
            return State(game, true);
        }
        var entry = Guest(guestOwner, day);
        await entry.Gate.WaitAsync(ct);
        try { Advance(entry.Value, revision, guess); return State(entry.Value, false); }
        finally { entry.Gate.Release(); }
    }

    private static void AdvanceForRetry(WordleGame game, int revision, string guess)
    {
        var history = JsonSerializer.Deserialize<string[]>(game.GuessesJson)!;
        if (revision < history.Length && history[revision] == guess) return;
        throw new WordleConflictException("Игра изменилась в другой вкладке. Загружаем актуальные попытки.");
    }
    private static bool Advance(WordleGame game, int revision, string guess)
    {
        var history = JsonSerializer.Deserialize<string[]>(game.GuessesJson)!;
        if (revision != game.Revision) { AdvanceForRetry(game, revision, guess); return false; }
        if (game.Won || history.Length >= 6) return false;
        if (history.Contains(guess)) throw new ArgumentException("Это слово уже пробовали. Выберите другое.");
        game.GuessesJson = JsonSerializer.Serialize(history.Append(guess));
        game.Revision++;
        game.Won = guess == game.ExpectedWord;
        return true;
    }

    public static string[] Evaluate(string answer, string guess)
    {
        var marks = Enumerable.Repeat("absent", 5).ToArray();
        var remaining = new Dictionary<char, int>();
        for (var i = 0; i < 5; i++)
            if (guess[i] == answer[i]) marks[i] = "correct";
            else remaining[answer[i]] = remaining.GetValueOrDefault(answer[i]) + 1;
        for (var i = 0; i < 5; i++)
            if (marks[i] != "correct" && remaining.GetValueOrDefault(guess[i]) > 0) { marks[i] = "present"; remaining[guess[i]]--; }
        return marks;
    }
    public static WordleState State(WordleGame game, bool authenticated)
    {
        var guesses = JsonSerializer.Deserialize<string[]>(game.GuessesJson)!;
        var finished = game.Won || guesses.Length >= 6;
        return new(game.Day, new DateTimeOffset(game.Day.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero), game.Revision,
            guesses.Select(x => new WordleRow(x, Evaluate(game.ExpectedWord, x))).ToArray(), game.Won, finished,
            finished ? game.ExpectedWord : null, finished ? game.Russian : null, authenticated && game.Won);
    }

    public async Task<object> Statistics(Guid userId, CancellationToken ct)
    {
        var games = (await repository.History(userId, ct)).Where(x => x.Won || x.Revision == 6).ToArray();
        var wins = games.Where(x => x.Won).ToArray();
        var streak = LearningService.Summarize(await progress.Activities(userId, ct), []).Streak;
        return new { played = games.Length, won = wins.Length, winRate = games.Length == 0 ? 0 : (int)Math.Round(100d * wins.Length / games.Length), streak,
            distribution = Enumerable.Range(1, 6).Select(i => wins.Count(x => x.Revision == i)).ToArray() };
    }
}
