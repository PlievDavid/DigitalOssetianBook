using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record PictureWord(Guid Id, string Ossetian, string Russian);
public sealed record PictureSessionState(Guid SessionId, Guid MaterialId, int Version, string Title,
    string PicturePath, string Mode, string[] Options, bool Answered, bool Correct, string? CorrectWord, PictureWord[] Words);
public sealed record PictureCheckResult(bool Correct, string CorrectWord, bool Finished, string[]? Options, PictureWord[] Words);

public sealed class PictureService(ICatalogRepository catalog, GuestLearningStore guests)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<PictureSessionState?> Start(Guid owner, Guid sessionId, Guid materialId, CancellationToken ct)
    {
        var material = await catalog.Picture(materialId, ct);
        if (material is null) return null;
        var payload = JsonSerializer.Deserialize<PictureMaterial>(material.ScriptJson, JsonOptions)
            ?? throw new InvalidOperationException("Некорректный материал «картинка и слово».");
        var options = payload.Mode == PictureScript.ChoiceMode
            ? Shuffle([payload.Word, .. payload.Distractors])
            : [];
        var state = new PictureState
        {
            MaterialId = material.Id, Version = material.Version, Title = material.Title,
            PicturePath = payload.PicturePath, Mode = payload.Mode,
            CorrectWord = payload.Word, Options = options,
            WordIds = payload.WordIds
        };
        guests.Add(owner, sessionId, state);
        return await Board(owner, sessionId, ct);
    }

    public async Task<PictureCheckResult?> Check(Guid owner, Guid sessionId, int? optionIndex, string? answer, CancellationToken ct)
    {
        var entry = guests.Find<PictureState>(owner, sessionId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var state = entry.Value;
            if (state.Answered)
                return new PictureCheckResult(state.Correct, state.CorrectWord, true, null, await Words(state.WordIds, ct));
            var correct = state.Mode == PictureScript.ChoiceMode
                ? CheckChoice(state, optionIndex)
                : CheckFree(state, answer);
            state.Answered = true;
            state.Correct = correct;
            return new PictureCheckResult(correct, state.CorrectWord, true, null, await Words(state.WordIds, ct));
        }
        finally { entry.Gate.Release(); }
    }

    public async Task<PictureSessionState?> Board(Guid owner, Guid sessionId, CancellationToken ct)
    {
        var entry = guests.Find<PictureState>(owner, sessionId);
        if (entry is null) return null;
        await entry.Gate.WaitAsync(ct);
        try
        {
            var state = entry.Value;
            // Связанные слова грузим только после ответа, чтобы правильный ответ не утекал в JSON запуска.
            var words = state.Answered ? await Words(state.WordIds, ct) : [];
            // Варианты скрываются после ответа, чтобы клиент не знал правильный до проверки.
            var options = state.Answered || state.Mode != PictureScript.ChoiceMode ? [] : state.Options;
            return new PictureSessionState(sessionId, state.MaterialId, state.Version, state.Title,
                state.PicturePath, state.Mode, options, state.Answered, state.Correct,
                state.Answered ? state.CorrectWord : null, words);
        }
        finally { entry.Gate.Release(); }
    }

    private static bool CheckChoice(PictureState state, int? optionIndex)
    {
        if (optionIndex is not int index || index < 0 || index >= state.Options.Length)
            throw new ArgumentException("Выберите вариант ответа.");
        var selected = state.Options[index];
        return PictureScript.Normalize(selected) == PictureScript.Normalize(state.CorrectWord);
    }

    private static bool CheckFree(PictureState state, string? answer)
    {
        var value = (answer ?? "").Trim();
        if (value.Length == 0)
            throw new ArgumentException("Введите слово.");
        if (value.Length > 200)
            throw new ArgumentException("Слишком длинный ответ.");
        return PictureScript.Normalize(value) == PictureScript.Normalize(state.CorrectWord);
    }

    private async Task<PictureWord[]> Words(Guid[] wordIds, CancellationToken ct)
    {
        var words = new List<PictureWord>();
        foreach (var wordId in wordIds)
        {
            var word = await catalog.Word(wordId, ct);
            if (word is not null) words.Add(new PictureWord(word.Id, word.Ossetian, word.Russian));
        }
        return [.. words];
    }

    private static string[] Shuffle(string[] values)
    {
        var list = values.ToList();
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = Random.Shared.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
        return [.. list];
    }

    public sealed class PictureState
    {
        public Guid MaterialId { get; init; }
        public int Version { get; init; }
        public string Title { get; init; } = "";
        public string PicturePath { get; init; } = "";
        public string Mode { get; init; } = PictureScript.ChoiceMode;
        public string CorrectWord { get; init; } = "";
        public string[] Options { get; init; } = [];
        public Guid[] WordIds { get; init; } = [];
        public bool Answered { get; set; }
        public bool Correct { get; set; }
    }
}
