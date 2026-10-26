using System.Text.Json;
using IronLanguage.Db;
using IronLanguage.Web.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;

await ListeningChecks.Run();

static class ListeningChecks
{
    public static async Task Run()
    {
        var userId = Guid.NewGuid();
        await TestStartWithSnapshot(userId);
        await TestAnswerOnce(userId);
        await TestAlreadySubmitted(userId);
        await TestRepeatDoesNotScoreTwice(userId);
        await TestGuestFlow();
        await TestInvalidOptionsRejected();
        await TestValidationRules();

        Console.WriteLine("Listening checks passed.");
    }

    static async Task TestStartWithSnapshot(Guid userId)
    {
        var services = new TestEnvironment();
        var listening = new ListeningService(services.Catalog, services.Progress, services.Guests);
        var ex = CreateListening("q1", ["a","b","c","d"], 1, audioPath: "/media/audio/1.mp3");
        services.Catalog.Add(ex);
        var result = Started(await listening.Start(userId, ex.Id, CancellationToken.None));
        Require(result.Attempt.ExerciseVersion == ex.Version);
        Require(result.Attempt.OptionsJson == ex.OptionsJson);
        Require(result.Attempt.CorrectOption == 1);
        Require(result.Attempt.Transcript == ex.Transcript);
        Require(result.Attempt.Explanation == ex.Explanation);
        Require(result.Attempt.AudioPath == ex.AudioPath);
        Require(result.Card.Options.Length == 4);
        Require(result.Attempt.SubmittedAnswer == null && result.Attempt.CompletedAt == null);
    }

    static async Task TestAnswerOnce(Guid userId)
    {
        var services = new TestEnvironment();
        var listening = new ListeningService(services.Catalog, services.Progress, services.Guests);
        var ex = CreateListening("q2", ["first","second","third","fourth"], 2, audioPath: "/media/audio/2.mp3", transcript: "транскрипт", explanation: "пояснение");
        services.Catalog.Add(ex);
        var start = Started(await listening.Start(userId, ex.Id, CancellationToken.None));
        var res = Answered(await listening.Answer(userId, start.Attempt.Id, 2, CancellationToken.None));
        Require(res.Correct);
        Require(res.CorrectOption == 2);
        Require(res.CorrectAnswer == "third");
        Require(res.Transcript == "транскрипт");
        Require(res.Explanation == "пояснение");
        Require(!res.AlreadySubmitted);
        Require(services.Progress.CompleteCalls >= 1);
    }

    static async Task TestAlreadySubmitted(Guid userId)
    {
        var services = new TestEnvironment();
        var listening = new ListeningService(services.Catalog, services.Progress, services.Guests);
        var ex = CreateListening("q3", ["1","2","3","4"], 0, audioPath: "/media/audio/3.mp3");
        services.Catalog.Add(ex);
        var start = Started(await listening.Start(userId, ex.Id, CancellationToken.None));
        var attemptId = start.Attempt.Id;
        var first = Answered(await listening.Answer(userId, attemptId, 0, CancellationToken.None));
        Require(first.Correct && !first.AlreadySubmitted);
        var second = Answered(await listening.Answer(userId, attemptId, 1, CancellationToken.None));
        Require(second.AlreadySubmitted);
        Require(second.Correct);
        Require(second.CorrectOption == 0);
        Require(second.CorrectAnswer == "1");
    }

    static async Task TestRepeatDoesNotScoreTwice(Guid userId)
    {
        var services = new TestEnvironment();
        var listening = new ListeningService(services.Catalog, services.Progress, services.Guests);
        var ex = CreateListening("q4", ["one","two","three","four"], 3, audioPath: "/media/audio/4.mp3");
        services.Catalog.Add(ex);
        var start = Started(await listening.Start(userId, ex.Id, CancellationToken.None));
        var attemptId = start.Attempt.Id;
        var before = services.Progress.CompleteCalls;
        var r1 = Answered(await listening.Answer(userId, attemptId, 0, CancellationToken.None));
        Require(!r1.Correct && !r1.AlreadySubmitted);
        var r2 = Answered(await listening.Answer(userId, attemptId, 2, CancellationToken.None));
        var r3 = Answered(await listening.Answer(userId, attemptId, 3, CancellationToken.None));
        Require(r2.AlreadySubmitted && !r2.Correct);
        Require(r3.AlreadySubmitted && !r3.Correct);
        Require(r3.CorrectOption == 3);
        Require(services.Progress.CompleteCalls == before + 1);
    }

    static async Task TestGuestFlow()
    {
        var services = new TestEnvironment();
        var listening = new ListeningService(services.Catalog, services.Progress, services.Guests);
        var ex = CreateListening("q5", ["а","ә","б","в"], 1, audioPath: "/media/audio/5.mp3");
        services.Catalog.Add(ex);
        var owner = Guid.NewGuid();
        var started = Started(await listening.StartGuest(owner, ex.Id, CancellationToken.None));
        var res = Answered(await listening.AnswerGuest(owner, started.Attempt.Id, 1, CancellationToken.None));
        Require(res.Correct && !res.AlreadySubmitted);
        Require(res.Transcript == ex.Transcript);
        var again = Answered(await listening.AnswerGuest(owner, started.Attempt.Id, 0, CancellationToken.None));
        Require(again.AlreadySubmitted);
        Require(services.Progress.CreateCalls == 0 && services.Progress.CompleteCalls == 0);
    }

    static async Task TestInvalidOptionsRejected()
    {
        var services = new TestEnvironment();
        var listening = new ListeningService(services.Catalog, services.Progress, services.Guests);
        var bad1 = CreateListening("bad1", ["a","b","c"], 0, audioPath: "/media/audio/b1.mp3");
        var bad2 = CreateListening("bad2", ["a","b","c",""], 0, audioPath: "/media/audio/b2.mp3");
        var bad3 = CreateListening("bad3", ["a","a","c","d"], 0, audioPath: "/media/audio/b3.mp3");
        services.Catalog.Add(bad1); services.Catalog.Add(bad2); services.Catalog.Add(bad3);
        Require((await listening.Start(Guid.NewGuid(), bad1.Id, CancellationToken.None)) == null);
        Require((await listening.Start(Guid.NewGuid(), bad2.Id, CancellationToken.None)) == null);
        Require((await listening.Start(Guid.NewGuid(), bad3.Id, CancellationToken.None)) == null);
    }

    static async Task TestValidationRules()
    {
        var services = new TestEnvironment();
        var listening = new ListeningService(services.Catalog, services.Progress, services.Guests);
        var ex = CreateListening("q6", ["x","y","z","w"], 0, audioPath: "/media/audio/6.mp3");
        services.Catalog.Add(ex);
        var owner = Guid.NewGuid();
        var started = Started(await listening.StartGuest(owner, ex.Id, CancellationToken.None));
        foreach (var index in new[] { -1, 4, 5 })
        {
            try
            {
                await listening.AnswerGuest(owner, started.Attempt.Id, index, CancellationToken.None);
                Require(false, $"index {index} must be rejected");
            }
            catch (ArgumentException) { }
        }
    }

    static Exercise CreateListening(string q, string[] options, int correct, string audioPath = "/media/audio/x.mp3", string transcript = "", string explanation = "")
    {
        return new Exercise
        {
            Id = Guid.NewGuid(),
            Kind = "listening",
            Version = 1,
            Published = true,
            RussianPrompt = q,
            OptionsJson = JsonSerializer.Serialize(options),
            CorrectOption = correct,
            AudioPath = audioPath,
            Transcript = transcript,
            Explanation = explanation
        };
    }

    static (ListeningCard Card, ExerciseAttempt Attempt) Started((ListeningCard Card, ExerciseAttempt Attempt)? value) =>
        value ?? throw new Exception("Ожидалось начало задания аудирования.");

    static ListeningAnswerResult Answered(ListeningAnswerResult? value) =>
        value ?? throw new Exception("Ожидался результат ответа на аудирование.");

    static void Require(bool condition, string? message = null)
    {
        if (!condition) throw new Exception(message ?? "Listening check failed");
    }
}

sealed class MemoryCatalog : ICatalogRepository
{
    public List<Exercise> ExercisesList = [];
    public Task<List<Exercise>> Exercises(string? kind = null, CancellationToken ct = default) =>
        Task.FromResult(ExercisesList.Where(x => x.Published && (kind == null || x.Kind == kind)).ToList());
    public Task<Exercise?> Exercise(Guid id, bool includeDraft = false, CancellationToken ct = default) =>
        Task.FromResult(ExercisesList.FirstOrDefault(x => x.Id == id && (x.Published || includeDraft)));
    public Task<List<WordEntry>> Words(CancellationToken ct = default) => Task.FromResult(new List<WordEntry>());
    public Task<WordEntry?> Word(Guid id, CancellationToken ct = default) => Task.FromResult<WordEntry?>(null);
    public Task<List<Book>> Books(CancellationToken ct = default) => Task.FromResult(new List<Book>());
    public Task<Book?> Book(Guid id, CancellationToken ct = default) => Task.FromResult<Book?>(null);
    public Task<List<Dialogue>> Dialogues(CancellationToken ct = default) => Task.FromResult(new List<Dialogue>());
    public Task<Dialogue?> Dialogue(Guid id, CancellationToken ct = default) => Task.FromResult<Dialogue?>(null);
    public Task<List<Matching>> Matchings(CancellationToken ct = default) => Task.FromResult(new List<Matching>());
    public Task<Matching?> Matching(Guid id, CancellationToken ct = default) => Task.FromResult<Matching?>(null);
    public Task<List<PictureMatching>> Pictures(CancellationToken ct = default) => Task.FromResult(new List<PictureMatching>());
    public Task<PictureMatching?> Picture(Guid id, CancellationToken ct = default) => Task.FromResult<PictureMatching?>(null);
    public Task<List<Exercise>> DraftExercises(CancellationToken ct = default) => Task.FromResult(ExercisesList.Where(x => !x.Published).ToList());
    public Task<List<Book>> DraftBooks(CancellationToken ct = default) => Task.FromResult(new List<Book>());
    public Task<List<WordEntry>> DraftWords(CancellationToken ct = default) => Task.FromResult(new List<WordEntry>());
    public Task AddExercise(Exercise exercise, CancellationToken ct = default) { ExercisesList.Add(exercise); return Task.CompletedTask; }
    public Task AddBook(Book book, CancellationToken ct = default) => Task.CompletedTask;
    public Task<bool> AddChapter(BookChapter chapter, CancellationToken ct = default) => Task.FromResult(false);
    public Task AddWord(WordEntry word, CancellationToken ct = default) => Task.CompletedTask;
    public Task<bool> PublishExercise(Guid id, CancellationToken ct = default)
    {
        var exercise = ExercisesList.FirstOrDefault(x => x.Id == id);
        if (exercise is null || exercise.Published) return Task.FromResult(false);
        exercise.Published = true;
        return Task.FromResult(true);
    }
    public Task<bool> PublishBook(Guid id, CancellationToken ct = default) => Task.FromResult(false);
    public Task<bool> PublishWord(Guid id, CancellationToken ct = default) => Task.FromResult(false);
    public void Add(Exercise e) => ExercisesList.Add(e);
}

sealed class MemoryProgress : IProgressRepository
{
    public int CreateCalls;
    public int CompleteCalls;
    public Dictionary<Guid, ExerciseAttempt> Attempts = [];
    public Task<ExerciseAttempt?> ActiveAttempt(Guid userId, Guid exerciseId, CancellationToken ct = default) =>
        Task.FromResult(Attempts.Values.Where(x => x.UserId == userId && x.ExerciseId == exerciseId && x.CompletedAt == null).OrderByDescending(x => x.StartedAt).FirstOrDefault());
    public Task<ExerciseAttempt?> Attempt(Guid userId, Guid attemptId, CancellationToken ct = default) =>
        Task.FromResult(Attempts.TryGetValue(attemptId, out var a) && a.UserId == userId ? a : null);
    public Task CreateAttempt(ExerciseAttempt attempt, CancellationToken ct = default)
    {
        CreateCalls++;
        Attempts[attempt.Id] = attempt;
        return Task.CompletedTask;
    }
    public Task<bool> SaveDraft(Guid userId, Guid attemptId, string indicesJson, CancellationToken ct = default)
    {
        if (!Attempts.TryGetValue(attemptId, out var a) || a.UserId != userId || a.CompletedAt != null) return Task.FromResult(false);
        a.DraftIndicesJson = indicesJson;
        return Task.FromResult(true);
    }
    public Task<bool> CompleteAttempt(Guid userId, Guid attemptId, string answer, bool correct, CancellationToken ct = default)
    {
        if (!Attempts.TryGetValue(attemptId, out var a) || a.UserId != userId || a.CompletedAt != null) return Task.FromResult(false);
        CompleteCalls++;
        a.SubmittedAnswer = answer;
        a.Correct = correct;
        a.CompletedAt = DateTimeOffset.UtcNow;
        return Task.FromResult(true);
    }
    public Task<List<SavedWord>> SavedWords(Guid userId, CancellationToken ct = default) => Task.FromResult(new List<SavedWord>());
    public Task<bool> AddWord(Guid userId, Guid wordId, CancellationToken ct = default) => Task.FromResult(true);
    public Task<bool> RemoveWord(Guid userId, Guid wordId, CancellationToken ct = default) => Task.FromResult(true);
    public Task<bool> ReviewWord(Guid userId, Guid wordId, bool correct, CancellationToken ct = default) => Task.FromResult(true);
    public Task<ReadingPosition?> ReadingPosition(Guid userId, Guid bookId, CancellationToken ct = default) => Task.FromResult<ReadingPosition?>(null);
    public Task SaveReadingPosition(Guid userId, Guid bookId, Guid chapterId, int tokenIndex, CancellationToken ct = default) => Task.CompletedTask;
    public Task<List<DailyActivity>> Activities(Guid userId, CancellationToken ct = default) => Task.FromResult(new List<DailyActivity>());
    public Task<List<Achievement>> Achievements(Guid userId, CancellationToken ct = default) => Task.FromResult(new List<Achievement>());
    public Task<DialogueSession?> ActiveSession(Guid userId, Guid dialogueId, CancellationToken ct = default) => Task.FromResult<DialogueSession?>(null);
    public Task<DialogueSession?> Session(Guid userId, Guid sessionId, CancellationToken ct = default) => Task.FromResult<DialogueSession?>(null);
    public Task CreateSession(DialogueSession session, CancellationToken ct = default) => Task.CompletedTask;
    public Task<bool> SaveSessionState(Guid userId, Guid sessionId, int expectedRevision, string stateJson, int attempts, int errors, int hints, int turnsCompleted, CancellationToken ct = default) => Task.FromResult(true);
    public Task<bool> CompleteSession(Guid userId, Guid sessionId, int expectedRevision, CancellationToken ct = default) => Task.FromResult(true);
    public Task<List<DialogueSession>> SessionHistory(Guid userId, CancellationToken ct = default) => Task.FromResult(new List<DialogueSession>());
}

sealed class TestEnvironment
{
    public MemoryCatalog Catalog { get; } = new();
    public MemoryProgress Progress { get; } = new();
    public GuestLearningStore Guests { get; } = new();
}
