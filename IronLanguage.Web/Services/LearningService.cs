using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record ExerciseWord(Guid Id, string Ossetian, string Russian);
public sealed record ExerciseCard(Guid Id, string Kind, string RussianPrompt, string? AudioPath, string[] Tokens, ExerciseWord[] Words);
public sealed record AnswerResult(bool Correct, string ExpectedAnswer, string Explanation, bool AlreadySubmitted);
public sealed record ProgressSummary(int Points, int Streak, string[] Achievements);

public sealed class LearningService(ICatalogRepository catalog, IProgressRepository progress)
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
                    TokensJson = exercise.TokensJson, WordIdsJson = exercise.WordIdsJson,
                    RussianPrompt = exercise.RussianPrompt, Explanation = exercise.Explanation, AudioPath = exercise.AudioPath };
                await progress.CreateAttempt(attempt, ct);
            }
        }
        var tokensJson = attempt?.TokensJson is { Length: > 2 } ? attempt.TokensJson : exercise.TokensJson;
        var wordIdsJson = attempt?.WordIdsJson ?? exercise.WordIdsJson;
        var wordIds = JsonSerializer.Deserialize<Guid[]>(wordIdsJson) ?? [];
        var words = new List<ExerciseWord>();
        foreach (var wordId in wordIds)
        {
            var word = await catalog.Word(wordId, ct);
            if (word is not null) words.Add(new ExerciseWord(word.Id, word.Ossetian, word.Russian));
        }
        return (new ExerciseCard(exercise.Id, exercise.Kind, attempt?.RussianPrompt is { Length: > 0 } ? attempt.RussianPrompt : exercise.RussianPrompt,
            attempt is null ? exercise.AudioPath : attempt.AudioPath, ParseTokens(tokensJson), words.ToArray()), attempt);
    }

    public async Task<AnswerResult?> Answer(Guid userId, Guid attemptId, int[] tokenIndices, CancellationToken ct)
    {
        var attempt = await progress.Attempt(userId, attemptId, ct);
        if (attempt is null) return null;
        if (attempt.CompletedAt is not null)
            return new AnswerResult(attempt.Correct ?? false, attempt.ExpectedAnswer, attempt.Explanation, true);
        var tokens = ParseTokens(attempt.TokensJson);
        if (tokenIndices.Length == 0 || tokenIndices.Length > tokens.Length || tokenIndices.Distinct().Count() != tokenIndices.Length || tokenIndices.Any(i => i < 0 || i >= tokens.Length))
            throw new ArgumentException("Неверный набор слов.");
        var answer = string.Join(' ', tokenIndices.Select(i => tokens[i]));
        var expected = Normalize(attempt.ExpectedAnswer);
        var alternatives = JsonSerializer.Deserialize<string[]>(attempt.AlternativesJson) ?? [];
        var correct = Normalize(answer) == expected || alternatives.Any(x => Normalize(x) == Normalize(answer));
        var saved = await progress.CompleteAttempt(userId, attemptId, answer, correct, ct);
        if (!saved)
        {
            var completed = await progress.Attempt(userId, attemptId, ct);
            return new AnswerResult(completed?.Correct ?? false, attempt.ExpectedAnswer, attempt.Explanation, true);
        }
        return new AnswerResult(correct, attempt.ExpectedAnswer, attempt.Explanation, false);
    }

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
