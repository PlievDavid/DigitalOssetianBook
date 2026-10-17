using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.VisualBasic.FileIO;

var directory = new DirectoryInfo(AppContext.BaseDirectory);
while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "IronLanguage.slnx"))) directory = directory.Parent;
var root = directory!.FullName;
var catalog = new WordleCatalog(new TestEnvironment { ContentRootPath = Path.Combine(root, "IronLanguage.Web") });
var clock = new TestClock(new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero));
using var guests = new GuestLearningStore();
var memory = new MemoryRepository();
var service = new WordleService(catalog, memory, null!, guests, clock);
void Check(bool value, string name) { if (!value) throw new Exception(name); }
async Task Fails<T>(Func<Task> action) where T : Exception { try { await action(); } catch (T) { return; } throw new Exception($"Expected {typeof(T).Name}"); }

// Verify every answer and every permitted guess against the supplied dictionary, not another generated fixture.
using var parser = new TextFieldParser(Path.Combine(root, "IronLanguage.Web/Data/ossetian-russian-dictionary.csv"), Encoding.UTF8);
parser.SetDelimiters(","); parser.HasFieldsEnclosedInQuotes = true;
var rows = new List<string[]>();
while (!parser.EndOfData) rows.Add(parser.ReadFields()!);
using var data = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "IronLanguage.Web/Data/wordle/words.json")));
foreach (var word in data.RootElement.GetProperty("answers").EnumerateArray())
    Check(DictionaryService.Key(rows[word.GetProperty("sourceRow").GetInt32() - 1][word.GetProperty("sourceColumn").GetInt32()]) == word.GetProperty("word").GetString(), "Answer source");
var sourceWords = rows.Skip(2).Where(r => r.Length > 4).Select(r => WordleCatalog.Normalize(r[4])).ToHashSet();
Check(catalog.Data.Allowed.All(sourceWords.Contains), "Guess sources");
Check(catalog.Data.Answers.Length == 300 && catalog.Data.Answers.Select(x => x.Word).Distinct().Count() == 300, "300 unique answers");
Check(Enumerable.Range(0, 300).Select(i => catalog.ForDay(service.Today.AddDays(i)).Word).Distinct().Count() == 300, "No repeats in 300 days");
Check(catalog.ForDay(service.Today) == catalog.ForDay(service.Today.AddDays(300)), "Stable cycle");
Check(WordleService.Evaluate("хӕдон", "ннннн").SequenceEqual(new[] { "absent", "absent", "absent", "absent", "correct" }), "Repeated letters reserve exact matches");
Check(WordleService.Evaluate("ӕӕбвг", "бӕӕбб").SequenceEqual(new[] { "present", "correct", "present", "absent", "absent" }), "Repeated letters consume remaining counts");
var owner = Guid.NewGuid();
var day = service.Today;
var answer = catalog.ForDay(day).Word;
var wrong = catalog.Data.Allowed.Where(x => x != answer).Take(6).ToArray();
var state = await service.Open(null, owner, default);
Check(state.Answer is null && state.Rows.Length == 0 && memory.Calls == 0, "Guest open hides answer and avoids DB");
await Fails<ArgumentException>(() => service.Guess(null, owner, day, 0, "ааааа", default));
await Fails<ArgumentException>(() => service.Guess(null, owner, day, 0, "word!", default));
state = await service.Guess(null, owner, day, 0, wrong[0], default);
Check(state.Revision == 1 && state.Answer is null, "Unsolved response hides answer");
Check((await service.Guess(null, owner, day, 0, wrong[0], default)).Revision == 1, "Guest retry idempotence");
await Fails<ArgumentException>(() => service.Guess(null, owner, day, 1, wrong[0], default));
await Fails<WordleConflictException>(() => service.Guess(null, owner, day, 0, wrong[1], default));
Check((await service.Open(null, Guid.NewGuid(), default)).Revision == 0, "Guest isolation");
for (var i = 1; i < 6; i++) state = await service.Guess(null, owner, day, i, wrong[i], default);
Check(state.Finished && !state.Won && state.Answer == answer && state.Revision == 6, "Six attempts then answer disclosure");
Check((await service.Guess(null, owner, day, 6, answer, default)).Revision == 6, "No seventh attempt");
var winner = Guid.NewGuid();
state = await service.Guess(null, winner, day, 0, answer.ToUpperInvariant().Replace('Ӕ', 'Æ'), default);
Check(state.Won && !state.CountedInStreak && memory.Calls == 0, "Guest win normalizes ӕ, no DB or streak");
Check((await service.Open(null, winner, default)).Won, "Guest reload resumes state");
clock.Now = new DateTimeOffset(2026, 10, 16, 23, 59, 59, TimeSpan.Zero);
Check(service.Today == day, "UTC day before midnight");
clock.Now = clock.Now.AddSeconds(1);
await Fails<WordleConflictException>(() => service.Guess(null, winner, day, 1, answer, default));
Check((await service.Open(null, winner, default)).Revision == 0 && service.Today == day.AddDays(1), "UTC rollover starts next word");
clock.Now = clock.Now.AddDays(-1);
var uid = Guid.NewGuid();
await service.Open(uid, Guid.Empty, default);
Check(memory.Calls == 1 && memory.Games.Count == 0, "Authenticated GET does not write");
Check(await service.AnswerForVocabulary(uid, day, default) is null, "Unplayed game cannot supply a vocabulary answer");
state = await service.Guess(uid, Guid.Empty, day, 0, answer, default);
Check(state.Won && state.CountedInStreak && memory.Saves == 1, "Authenticated win");
await service.Guess(uid, Guid.Empty, day, 0, answer, default);
Check(memory.Saves == 1, "Winning retry does not save twice");
var vocabularyAnswer = await service.AnswerForVocabulary(uid, day, default);
Check(vocabularyAnswer?.Word == answer && vocabularyAnswer.SourceRow > 2 && vocabularyAnswer.SourceColumn == 4, "Completed answer retains dictionary provenance");
Check(await service.AnswerForVocabulary(Guid.NewGuid(), day, default) is null, "Another account cannot save the winner's answer");
Check(await service.AnswerForVocabulary(uid, day.AddDays(1), default) is null, "A different day cannot save an unrevealed answer");
var unfinishedUser = Guid.NewGuid();
await service.Guess(unfinishedUser, Guid.Empty, day, 0, wrong[0], default);
Check(await service.AnswerForVocabulary(unfinishedUser, day, default) is null, "Unfinished game cannot supply a vocabulary answer");
for (var guessIndex = 1; guessIndex < 6; guessIndex++) await service.Guess(unfinishedUser, Guid.Empty, day, guessIndex, wrong[guessIndex], default);
Check((await service.AnswerForVocabulary(unfinishedUser, day, default))?.Word == answer, "Lost game can save the revealed answer");
clock.Now = clock.Now.AddDays(1);
Check((await service.AnswerForVocabulary(uid, day, default))?.Word == answer, "Saving an already revealed answer survives UTC rollover");
clock.Now = clock.Now.AddDays(-1);
Console.WriteLine("Wordle rules passed: 300 sources, 300-day schedule, repeated letters, six attempts, normalization, retries, conflicts, guests, user isolation and UTC rollover.");

if (args.Contains("--database"))
{
    var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Adam") ?? throw new Exception("Load .run-local/connection.ps1.");
    var options = new DbContextOptionsBuilder<AdamDbContext>().UseNpgsql(connection).Options;
    await using var db = new AdamDbContext(options);
    Check(!db.Database.HasPendingModelChanges(), "Model snapshot");
    Check(!(await db.Database.GetPendingMigrationsAsync()).Any(), "Migration applied");
    var accounts = new[] { new UserAccount { Email = $"wordle-{Guid.NewGuid():N}@example.invalid" }, new UserAccount { Email = $"wordle-{Guid.NewGuid():N}@example.invalid" } };
    // Credentials are generated in memory, never printed or saved to files.
    var password = Guid.NewGuid().ToString("N") + "aA!7";
    accounts[0].PasswordHash = new PasswordHasher<UserAccount>().HashPassword(accounts[0], password);
    var ids = accounts.Select(x => x.Id).ToArray();
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    Guid? createdDictionaryWord = null;
    try
    {
        db.Users.AddRange(accounts); await db.SaveChangesAsync();
        var realClock = new TestClock(DateTimeOffset.UtcNow);
        var real = new WordleService(catalog, new EfWordleRepository(db), new EfProgressRepository(db), guests, realClock);
        await real.Open(ids[0], Guid.Empty, default);
        Check(!await db.WordleGames.AnyAsync(x => x.UserId == ids[0]), "No write on GET");
        for (var i = 1; i <= 6; i++) db.DailyActivities.Add(new DailyActivity { UserId = ids[0], Day = today.AddDays(-i), Points = 10 });
        await db.SaveChangesAsync();
        var expected = catalog.ForDay(today).Word;
        var alternate = catalog.Data.Allowed.First(x => x != expected);
        await real.Guess(ids[0], Guid.Empty, today, 0, alternate, default);
        Check(!await db.DailyActivities.AnyAsync(x => x.UserId == ids[0] && x.Day == today), "Wrong guess does not mark activity");
        await using var a = new AdamDbContext(options); await using var b = new AdamDbContext(options);
        var serviceA = new WordleService(catalog, new EfWordleRepository(a), new EfProgressRepository(a), guests, realClock);
        var serviceB = new WordleService(catalog, new EfWordleRepository(b), new EfProgressRepository(b), guests, realClock);
        var parallel = await Task.WhenAll(serviceA.Guess(ids[0], Guid.Empty, today, 1, expected, default), serviceB.Guess(ids[0], Guid.Empty, today, 1, expected, default));
        Check(parallel.All(x => x.Won && x.Revision == 2), "Concurrent winning retry");
        Check(await db.DailyActivities.CountAsync(x => x.UserId == ids[0] && x.Day == today) == 1, "One activity day");
        Check(await db.DailyActivities.Where(x => x.UserId == ids[0] && x.Day == today).Select(x => x.Points).SingleAsync() == 0, "No points for Wordle");
        Check(await db.Achievements.AnyAsync(x => x.UserId == ids[0] && x.Code == "streak-7"), "Existing streak achievement");
        Check((await real.Open(ids[0], Guid.Empty, default)).Won, "DB resume");
        Check((await real.Open(ids[1], Guid.Empty, default)).Revision == 0, "Account isolation");
        var stats = JsonSerializer.SerializeToElement(await real.Statistics(ids[0], default));
        Check(stats.GetProperty("streak").GetInt32() == 7 && stats.GetProperty("won").GetInt32() == 1, "Statistics share activity streak");
        // Existing activity points remain unchanged when Wordle wins that same day.
        db.DailyActivities.Add(new DailyActivity { UserId = ids[1], Day = today, Points = 20 }); await db.SaveChangesAsync();
        await real.Guess(ids[1], Guid.Empty, today, 0, expected, default);
        Check(await db.DailyActivities.Where(x => x.UserId == ids[1] && x.Day == today).Select(x => x.Points).SingleAsync() == 20, "Existing points preserved");
        var attempt = new ExerciseAttempt { UserId = ids[1], ExerciseId = Guid.NewGuid(), ExpectedAnswer = expected };
        db.Attempts.Add(attempt); await db.SaveChangesAsync();
        var learningProgress = new EfProgressRepository(db);
        Check(await learningProgress.CompleteAttempt(ids[1], attempt.Id, expected, true, default), "Existing exercise still completes");
        Check(!await learningProgress.CompleteAttempt(ids[1], attempt.Id, expected, true, default), "Existing exercise retry is idempotent");
        Check(await db.DailyActivities.Where(x => x.UserId == ids[1] && x.Day == today).Select(x => x.Points).SingleAsync() == 30, "Existing exercise still awards ten points exactly once");
        realClock.Now = realClock.Now.AddDays(1);
        var tomorrow = today.AddDays(1);
        var losingWords = catalog.Data.Allowed.Where(x => x != catalog.ForDay(tomorrow).Word).Take(6).ToArray();
        for (var i = 0; i < 6; i++) await real.Guess(ids[1], Guid.Empty, tomorrow, i, losingWords[i], default);
        Check((await real.Open(ids[1], Guid.Empty, default)).Finished, "Six guesses persist in database");
        Check(!await db.DailyActivities.AnyAsync(x => x.UserId == ids[1] && x.Day == tomorrow), "Loss never marks activity");

        if (Environment.GetEnvironmentVariable("ADAM_TEST_URL") is string baseUrl)
        {
            var cookies = new CookieContainer();
            using var client = new HttpClient(new HttpClientHandler { CookieContainer = cookies, AllowAutoRedirect = false }) { BaseAddress = new Uri(baseUrl) };
            string Token(string html) => WebUtility.HtmlDecode(Regex.Match(html, "name=\"__RequestVerificationToken\"[^>]*value=\"([^\"]+)\"").Groups[1].Value);
            var login = await client.GetStringAsync("/account/login");
            var loginResponse = await client.PostAsync("/account/login", new FormUrlEncodedContent(new Dictionary<string, string> { ["Email"] = accounts[0].Email, ["Password"] = password, ["__RequestVerificationToken"] = Token(login) }));
            Check(loginResponse.StatusCode == HttpStatusCode.Redirect, "HTTP login");
            var html = await client.GetStringAsync("/games/wordle");
            var csrf = Token(html);
            var api = await client.GetStringAsync("/api/v1/wordle");
            Check(JsonDocument.Parse(api).RootElement.GetProperty("won").GetBoolean(), "HTTP authenticated resume");
            var body = JsonSerializer.Serialize(new { day = today.ToString("yyyy-MM-dd"), revision = 1, guess = expected });
            var noCsrf = await client.PostAsync("/api/v1/wordle/guess", new StringContent(body, Encoding.UTF8, "application/json"));
            Check(noCsrf.StatusCode == HttpStatusCode.BadRequest, "Authenticated CSRF");
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/wordle/guess") { Content = new StringContent(body, Encoding.UTF8, "application/json") };
            request.Headers.Add("RequestVerificationToken", csrf);
            Check((await client.SendAsync(request)).IsSuccessStatusCode, "HTTP winning retry");
            Check(JsonDocument.Parse(await client.GetStringAsync("/api/v1/wordle/statistics")).RootElement.GetProperty("won").GetInt32() == 1, "HTTP private statistics");
            var answerSource = catalog.ForDay(today);
            var sourceRepository = new EfDictionarySourceRepository(db);
            Check(await sourceRepository.FindSense(answerSource.SourceRow, answerSource.SourceColumn, "несуществующее", default) is null, "Source lookup rejects mismatched spelling");
            var senseId = await sourceRepository.FindSense(answerSource.SourceRow, answerSource.SourceColumn, DictionaryService.Key(answerSource.Word), default);
            Check(senseId is not null, "Prepared database contains the answer's exact dictionary source");
            var existingWord = await db.Words.AsNoTracking().SingleOrDefaultAsync(word => word.DictionarySenseId == senseId);
            var wordId = await new DictionaryService(db).EnsureSavedWord(senseId!.Value, default);
            Check(wordId is not null, "Dictionary source supplies a saved word");
            if (existingWord is null) createdDictionaryWord = wordId;
            var saveBody = JsonSerializer.Serialize(new { day = today });
            Check((await client.PostAsync("/api/v1/wordle/vocabulary", new StringContent(saveBody, Encoding.UTF8, "application/json"))).StatusCode == HttpStatusCode.BadRequest, "Saving answer requires CSRF");
            for (var repeat = 0; repeat < 2; repeat++)
            {
                using var saveRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/wordle/vocabulary") { Content = new StringContent(saveBody, Encoding.UTF8, "application/json") };
                saveRequest.Headers.Add("RequestVerificationToken", csrf);
                Check((await client.SendAsync(saveRequest)).IsSuccessStatusCode, "HTTP answer saved, including retry");
            }
            Check(await db.SavedWords.CountAsync(word => word.UserId == ids[0] && word.WordId == wordId) == 1, "Answer save is idempotent");
            Check(!await db.SavedWords.AnyAsync(word => word.UserId == ids[1]), "Saving answer does not write to another account");
            var vocabulary = JsonDocument.Parse(await client.GetStringAsync("/api/v1/vocabulary"));
            Check(vocabulary.RootElement.EnumerateArray().Any(word => word.GetProperty("wordId").GetGuid() == wordId), "Saved answer appears in personal vocabulary");
            using var unfinishedSave = new HttpRequestMessage(HttpMethod.Post, "/api/v1/wordle/vocabulary") { Content = new StringContent(JsonSerializer.Serialize(new { day = today.AddDays(1) }), Encoding.UTF8, "application/json") };
            unfinishedSave.Headers.Add("RequestVerificationToken", csrf);
            Check((await client.SendAsync(unfinishedSave)).StatusCode == HttpStatusCode.BadRequest, "Unplayed day cannot save a word through HTTP");
        }
        Console.WriteLine("PostgreSQL/HTTP passed: migration, no GET writes, account isolation, resume, concurrent win, zero points, shared streak, badges, statistics, auth and CSRF.");
    }
    finally
    {
        await db.SavedWords.Where(word => ids.Contains(word.UserId)).ExecuteDeleteAsync();
        if (createdDictionaryWord is Guid createdWord)
            await db.Words.Where(word => word.Id == createdWord && !db.SavedWords.Any(saved => saved.WordId == word.Id)).ExecuteDeleteAsync();
        await db.ExerciseRewards.Where(x => ids.Contains(x.UserId)).ExecuteDeleteAsync();
        await db.Attempts.Where(x => ids.Contains(x.UserId)).ExecuteDeleteAsync();
        await db.Achievements.Where(x => ids.Contains(x.UserId)).ExecuteDeleteAsync();
        await db.DailyActivities.Where(x => ids.Contains(x.UserId)).ExecuteDeleteAsync();
        await db.Users.Where(x => ids.Contains(x.Id)).ExecuteDeleteAsync();
    }
}

sealed class TestClock(DateTimeOffset now) : TimeProvider { public DateTimeOffset Now { get; set; } = now; public override DateTimeOffset GetUtcNow() => Now; }
sealed class MemoryRepository : IWordleRepository
{
    public int Calls; public int Saves;
    public Dictionary<(Guid, DateOnly), WordleGame> Games = [];
    private static WordleGame Copy(WordleGame x) => JsonSerializer.Deserialize<WordleGame>(JsonSerializer.Serialize(x))!;
    public Task<WordleGame?> Find(Guid userId, DateOnly day, CancellationToken ct) { Calls++; return Task.FromResult(Games.TryGetValue((userId, day), out var value) ? Copy(value) : null); }
    public Task<WordleGame> Open(WordleGame initial, CancellationToken ct) { Calls++; Games.TryAdd((initial.UserId, initial.Day), Copy(initial)); return Task.FromResult(Copy(Games[(initial.UserId, initial.Day)])); }
    public Task<bool> Save(Guid userId, DateOnly day, int revision, string guessesJson, bool won, DateTimeOffset now, CancellationToken ct) { var game = Games[(userId, day)]; if (game.Revision != revision) return Task.FromResult(false); Saves++; game.GuessesJson = guessesJson; game.Won = won; game.Revision++; return Task.FromResult(true); }
    public Task<List<WordleGame>> History(Guid userId, CancellationToken ct) => Task.FromResult(Games.Values.Where(x => x.UserId == userId).Select(Copy).ToList());
}
sealed class TestEnvironment : IWebHostEnvironment
{
    public string ApplicationName { get; set; } = "WordleChecks";
    public string EnvironmentName { get; set; } = "Development";
    public string ContentRootPath { get; set; } = "";
    public string WebRootPath { get; set; } = "";
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}
