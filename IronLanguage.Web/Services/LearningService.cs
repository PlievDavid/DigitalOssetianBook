using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record ExerciseWord(Guid Id, string Ossetian, string Russian);
public sealed record ExerciseCard(Guid Id, string Kind, string RussianPrompt, string? AudioPath, string[] Tokens, ExerciseWord[] Words, string[][] Steps);
public sealed record AnswerResult(bool Correct, string ExpectedAnswer, string Explanation, bool AlreadySubmitted);
public sealed record ProgressSummary(int Points, int Streak, string[] Achievements);

public sealed class LearningService(ICatalogRepository catalog, IProgressRepository progress, GuestLearningStore guests)
{
    public static string[] ParseTokens(string json) => JsonSerializer.Deserialize<string[]>(json) ?? [];
    public static string Normalize(string value) => string.Join(' ', value.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();

    public async Task<(ExerciseCard Card, ExerciseAttempt? Attempt)?> Start(Guid? userId, Guid exerciseId, CancellationToken ct)
    {
        var exercise = await catalog.Exercise(exerciseId, ct: ct);
        if (exercise is null) return null;
        ExerciseAttempt? attempt = null;
        if (userId is Guid id)
        {
            attempt = await progress.ActiveAttempt(id, exerciseId, ct);
            if (attempt is null)
            {
                attempt = new ExerciseAttempt { UserId = id, ExerciseId = exerciseId, ExerciseVersion = exercise.Version,
                    ExpectedAnswer = exercise.OssetianAnswer, AlternativesJson = exercise.AlternativesJson,
                    TokensJson = exercise.TokensJson, DistractorsJson = exercise.DistractorsJson, WordIdsJson = exercise.WordIdsJson,
                    RussianPrompt = exercise.RussianPrompt, Explanation = exercise.Explanation, AudioPath = exercise.AudioPath };
                await progress.CreateAttempt(attempt, ct);
            }
        }
        return (await Card(exercise, attempt, ct), attempt);
    }

    private async Task<ExerciseCard> Card(Exercise exercise, ExerciseAttempt? attempt, CancellationToken ct)
    {
        var tokensJson = attempt?.TokensJson is { Length: > 2 } ? attempt.TokensJson : exercise.TokensJson;
        var wordIdsJson = attempt?.WordIdsJson ?? exercise.WordIdsJson;
        var wordIds = JsonSerializer.Deserialize<Guid[]>(wordIdsJson) ?? [];
        var words = new List<ExerciseWord>();
        foreach (var wordId in wordIds)
        {
            var word = await catalog.Word(wordId, ct);
            if (word is not null) words.Add(new ExerciseWord(word.Id, word.Ossetian, word.Russian));
        }
        var tokens = ParseTokens(tokensJson);
        return new ExerciseCard(exercise.Id, exercise.Kind, attempt?.RussianPrompt is { Length: > 0 } ? attempt.RussianPrompt : exercise.RussianPrompt,
            attempt is null ? exercise.AudioPath : attempt.AudioPath, tokens, words.ToArray(), BuildSteps(exercise, attempt, tokens));
    }

    // Для аудиопазла: на каждый шаг — три варианта (правильное слово и два отвлекающих), порядок перемешивается.
    private static string[][] BuildSteps(Exercise exercise, ExerciseAttempt? attempt, string[] tokens)
    {
        if (exercise.Kind != "audio") return [];
        var distractorsJson = attempt?.DistractorsJson is { Length: > 2 } ? attempt.DistractorsJson : exercise.DistractorsJson;
        var distractors = JsonSerializer.Deserialize<string[][]>(distractorsJson) ?? [];
        var steps = new string[tokens.Length][];
        for (var i = 0; i < tokens.Length; i++)
        {
            var options = new List<string> { tokens[i] };
            if (i < distractors.Length) options.AddRange(distractors[i] ?? []);
            for (var j = options.Count - 1; j > 0; j--)
            {
                var swap = Random.Shared.Next(j + 1);
                (options[j], options[swap]) = (options[swap], options[j]);
            }
            steps[i] = [.. options];
        }
        return steps;
    }

    public async Task<AnswerResult?> Answer(Guid userId, Guid attemptId, int[] tokenIndices, CancellationToken ct)
    {
        var attempt = await progress.Attempt(userId, attemptId, ct);
        if (attempt is null) return null;
        if (attempt.CompletedAt is not null)
            return new AnswerResult(attempt.Correct ?? false, attempt.ExpectedAnswer, attempt.Explanation, true);
        var tokens = ParseTokens(attempt.TokensJson);
        ValidateIndices(tokenIndices, tokens.Length);
        var answer = string.Join(' ', tokenIndices.Select(i => tokens[i]));
        var correct = IsCorrect(attempt, answer);
        var saved = await progress.CompleteAttempt(userId, attemptId, answer, correct, ct);
        if (!saved)
        {
            var completed = await progress.Attempt(userId, attemptId, ct);
            return new AnswerResult(completed?.Correct ?? false, attempt.ExpectedAnswer, attempt.Explanation, true);
        }
        return new AnswerResult(correct, attempt.ExpectedAnswer, attempt.Explanation, false);
    }

    public async Task<(ExerciseCard Card, ExerciseAttempt Attempt)?> StartGuest(Guid owner, Guid exerciseId, CancellationToken ct)
    {
        var exercise = await catalog.Exercise(exerciseId, ct: ct);
        if (exercise is null) return null;
        var attempt = new ExerciseAttempt
        {
            ExerciseId = exerciseId, ExerciseVersion = exercise.Version,
            ExpectedAnswer = exercise.OssetianAnswer, AlternativesJson = exercise.AlternativesJson,
            TokensJson = exercise.TokensJson, DistractorsJson = exercise.DistractorsJson, WordIdsJson = exercise.WordIdsJson,
            RussianPrompt = exercise.RussianPrompt, Explanation = exercise.Explanation, AudioPath = exercise.AudioPath
        };
        var card = await Card(exercise, attempt, ct);
        guests.Add(owner, attempt.Id, attempt);
        return (card, attempt);
    }

    public async Task<AnswerResult?> AnswerGuest(Guid owner, Guid attemptId, int[] tokenIndices, CancellationToken ct)
    {
        var entry = guests.Find<ExerciseAttempt>(owner, attemptId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var attempt = entry.Value;
            if (attempt.CompletedAt is not null)
                return new AnswerResult(attempt.Correct ?? false, attempt.ExpectedAnswer, attempt.Explanation, true);
            var tokens = ParseTokens(attempt.TokensJson);
            ValidateIndices(tokenIndices, tokens.Length);
            var answer = string.Join(' ', tokenIndices.Select(i => tokens[i]));
            attempt.Correct = IsCorrect(attempt, answer);
            attempt.CompletedAt = DateTimeOffset.UtcNow;
            return new AnswerResult(attempt.Correct.Value, attempt.ExpectedAnswer, attempt.Explanation, false);
        }
        finally { entry.Gate.Release(); }
    }

    private static void ValidateIndices(int[] indices, int length)
    {
        if (indices.Length == 0 || indices.Length > length || indices.Distinct().Count() != indices.Length || indices.Any(i => i < 0 || i >= length))
            throw new ArgumentException("Неверный набор слов.");
    }

    private static bool IsCorrect(ExerciseAttempt attempt, string answer) =>
        Normalize(answer) == Normalize(attempt.ExpectedAnswer)
        || ParseTokens(attempt.AlternativesJson).Any(x => Normalize(x) == Normalize(answer));

    public async Task<bool?> SaveDraft(Guid userId, Guid attemptId, int[] tokenIndices, CancellationToken ct)
    {
        var attempt = await progress.Attempt(userId, attemptId, ct);
        if (attempt is null) return null;
        if (attempt.CompletedAt is not null) return false;
        var length = ParseTokens(attempt.TokensJson).Length;
        if (tokenIndices.Length > length || tokenIndices.Distinct().Count() != tokenIndices.Length || tokenIndices.Any(i => i < 0 || i >= length))
            throw new ArgumentException("Неверный набор слов.");
        return await progress.SaveDraft(userId, attemptId, JsonSerializer.Serialize(tokenIndices), ct);
    }

    public static bool IsWordAnswerCorrect(WordEntry word, string translation)
    {
        var answer = word.DictionarySenseId is null ? translation : translation.Replace("\u0301", "");
        var expected = word.DictionarySenseId is null ? word.Russian : word.Russian.Replace("\u0301", "");
        return Normalize(answer) == Normalize(expected);
    }

    public static ProgressSummary Summarize(List<DailyActivity> activities, List<Achievement> achievements)
    {
        var days = activities.Select(x => x.Day).ToHashSet();
        var cursor = DateOnly.FromDateTime(DateTime.UtcNow);
        if (!days.Contains(cursor)) cursor = cursor.AddDays(-1);
        var streak = 0;
        while (days.Contains(cursor)) { streak++; cursor = cursor.AddDays(-1); }
        return new ProgressSummary(activities.Sum(x => x.Points), streak, achievements.Select(x => x.Code).ToArray());
    }
}
