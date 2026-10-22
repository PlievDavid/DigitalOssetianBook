using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record ListeningCard(Guid Id, string Question, string? AudioPath, string[] Options);
public sealed record ListeningAnswerResult(bool Correct, int CorrectOption, string CorrectAnswer, string Transcript, string Explanation, bool AlreadySubmitted);

// Аудирование: одна запись, вопрос и четыре варианта ответа. Правильный вариант хранится в снимке попытки,
// поэтому публикация новой версии не меняет условия уже начатого задания.
public sealed class ListeningService(ICatalogRepository catalog, IProgressRepository progress, GuestLearningStore guests)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<(ListeningCard Card, ExerciseAttempt Attempt)?> Start(Guid? userId, Guid exerciseId, CancellationToken ct)
    {
        var exercise = await catalog.Exercise(exerciseId, ct: ct);
        if (exercise is null || !IsListening(exercise)) return null;
        var options = ParseOptions(exercise.OptionsJson);
        if (!IsValidOptions(options) || exercise.CorrectOption is < 0 or > 3) return null;

        ExerciseAttempt? attempt = null;
        if (userId is Guid id)
        {
            attempt = await progress.ActiveAttempt(id, exerciseId, ct);
            if (attempt is null)
            {
                attempt = Snapshot(exercise);
                attempt.UserId = id;
                await progress.CreateAttempt(attempt, ct);
            }
        }
        if (attempt is null) return null;
        if (!IsValidOptions(ParseOptions(attempt.OptionsJson)) || attempt.CorrectOption is < 0 or > 3) return null;
        return (Card(attempt), attempt);
    }

    public async Task<(ListeningCard Card, ExerciseAttempt Attempt)?> StartGuest(Guid owner, Guid exerciseId, CancellationToken ct)
    {
        var exercise = await catalog.Exercise(exerciseId, ct: ct);
        if (exercise is null || !IsListening(exercise) || exercise.CorrectOption is < 0 or > 3) return null;
        var options = ParseOptions(exercise.OptionsJson);
        if (!IsValidOptions(options)) return null;
        var attempt = Snapshot(exercise);
        var card = Card(attempt);
        guests.Add(owner, attempt.Id, attempt);
        return (card, attempt);
    }

    public async Task<ListeningAnswerResult?> Answer(Guid userId, Guid attemptId, int optionIndex, CancellationToken ct)
    {
        var attempt = await progress.Attempt(userId, attemptId, ct);
        if (attempt is null) return null;
        return await Complete(attempt, optionIndex, ct);
    }

    public async Task<ListeningAnswerResult?> AnswerGuest(Guid owner, Guid attemptId, int optionIndex, CancellationToken ct)
    {
        var entry = guests.Find<ExerciseAttempt>(owner, attemptId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var attempt = entry.Value;
            var options = ParseOptions(attempt.OptionsJson);
            if (!IsValidOptions(options)) return null;
            var result = Result(attempt, true);
            if (result is not null) return result;
            ValidateIndex(optionIndex, options.Length);
            attempt.SubmittedAnswer = options[optionIndex];
            attempt.Correct = optionIndex == attempt.CorrectOption;
            attempt.CompletedAt = DateTimeOffset.UtcNow;
            return Result(attempt);
        }
        finally { entry.Gate.Release(); }
    }

    private async Task<ListeningAnswerResult?> Complete(ExerciseAttempt attempt, int optionIndex, CancellationToken ct)
    {
        var options = ParseOptions(attempt.OptionsJson);
        if (!IsValidOptions(options)) return null;
        var completed = Result(attempt, true);
        if (completed is not null) return completed;
        ValidateIndex(optionIndex, options.Length);
        var saved = await progress.CompleteAttempt(attempt.UserId, attempt.Id, options[optionIndex], optionIndex == attempt.CorrectOption, ct);
        if (!saved)
        {
            var latest = await progress.Attempt(attempt.UserId, attempt.Id, ct);
            return latest is null ? null : Result(latest, true) ?? Result(attempt, true);
        }
        attempt.SubmittedAnswer = options[optionIndex];
        attempt.Correct = optionIndex == attempt.CorrectOption;
        attempt.CompletedAt = DateTimeOffset.UtcNow;
        return Result(attempt);
    }

    private static ListeningAnswerResult? Result(ExerciseAttempt attempt, bool alreadySubmitted = false)
    {
        if (attempt.CompletedAt is null || attempt.Correct is null) return null;
        var options = ParseOptions(attempt.OptionsJson);
        if (!IsValidOptions(options) || attempt.CorrectOption is < 0 or > 3) return null;
        return new ListeningAnswerResult(attempt.Correct.Value, attempt.CorrectOption, options[attempt.CorrectOption],
            attempt.Transcript, attempt.Explanation, alreadySubmitted);
    }

    private static ListeningCard Card(ExerciseAttempt attempt) =>
        new(attempt.ExerciseId, attempt.RussianPrompt, attempt.AudioPath, ParseOptions(attempt.OptionsJson));

    private static ExerciseAttempt Snapshot(Exercise exercise)
    {
        var options = ParseOptions(exercise.OptionsJson);
        return new ExerciseAttempt
        {
            ExerciseId = exercise.Id, ExerciseVersion = exercise.Version,
            RussianPrompt = exercise.RussianPrompt, AudioPath = exercise.AudioPath,
            OptionsJson = exercise.OptionsJson, CorrectOption = exercise.CorrectOption, Transcript = exercise.Transcript,
            Explanation = exercise.Explanation, ExpectedAnswer = options[exercise.CorrectOption]
        };
    }

    private static bool IsListening(Exercise exercise) => exercise.Kind == "listening" && !string.IsNullOrWhiteSpace(exercise.AudioPath);

    private static string[] ParseOptions(string json) => JsonSerializer.Deserialize<string[]>(json, JsonOptions) ?? [];

    private static bool IsValidOptions(string[] options) =>
        options.Length == 4 && options.All(x => !string.IsNullOrWhiteSpace(x));

    private static void ValidateIndex(int optionIndex, int length)
    {
        if (optionIndex < 0 || optionIndex >= length) throw new ArgumentException("Выберите один из четырёх вариантов ответа.");
    }
}
