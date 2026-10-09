using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record ExerciseSeed(string RussianPrompt, string[] Tokens, string[][] Distractors, string Explanation, string Audio);

public sealed record ExerciseSeedResult(string Prompt, string Action, string? Error);

/// <summary>
/// Импортирует аудиопазлы из Data/exercises/exercises.json через обычный редакторский путь:
/// новый аудиопазл создаётся черновиком и публикуется, изменившийся публикованный — новой ревизией.
/// Записи берутся из Data/exercises/audio и копируются в wwwroot/media, имя файла становится частью пути /media.
/// </summary>
public sealed class ExerciseSeedService(IEditorRepository editor, IAccountRepository accounts, IWebHostEnvironment environment)
{
    public const string Kind = "audio";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<ExerciseSeed> Read(string path)
    {
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<List<ExerciseSeed>>(json, Json) ?? [];
    }

    /// <summary>
    /// Проверяет сид теми же правилами, что и форма редактора, и собирает материал аудиопазла.
    /// </summary>
    public static (ExerciseMaterial? Material, string[] Errors) Parse(ExerciseSeed seed)
    {
        var errors = new List<string>();
        var prompt = (seed.RussianPrompt ?? "").Trim();
        if (prompt.Length == 0) errors.Add("укажите перевод предложения");

        var tokens = (seed.Tokens ?? []).Select(x => (x ?? "").Trim()).ToArray();
        if (tokens.Length is < 2 or > 30 || tokens.Any(x => x.Length is 0 or > 80))
            errors.Add("предложение: от 2 до 30 слов, каждое до 80 символов");

        var distractors = new List<string[]>();
        var rows = seed.Distractors ?? [];
        if (rows.Length != tokens.Length)
            errors.Add("для каждого слова нужна пара отвлекающих слов");
        else
        {
            for (var i = 0; i < rows.Length; i++)
            {
                var pair = (rows[i] ?? []).Select(x => (x ?? "").Trim()).ToArray();
                if (pair.Length != 2 || pair.Any(x => x.Length is 0 or > 80))
                    errors.Add($"шаг {i + 1}: укажите два варианта, каждый до 80 символов");
                else if (pair.Any(x => LearningService.Normalize(x) == LearningService.Normalize(tokens[i])))
                    errors.Add($"шаг {i + 1}: отвлекающее слово не должно совпадать с правильным «{tokens[i]}»");
                else if (LearningService.Normalize(pair[0]) == LearningService.Normalize(pair[1]))
                    errors.Add($"шаг {i + 1}: два отвлекающих слова не должны совпадать");
                else distractors.Add(pair);
            }
        }

        var audio = (seed.Audio ?? "").Trim();
        if (audio.Length == 0 || audio != Path.GetFileName(audio)
            || Path.GetExtension(audio).ToLowerInvariant() is not (".mp3" or ".ogg" or ".wav"))
            errors.Add("укажите имя файла записи (mp3, ogg или wav)");

        if (errors.Count > 0) return (null, errors.ToArray());
        var material = new ExerciseMaterial(Kind, prompt, string.Join(' ', tokens), tokens, [], (seed.Explanation ?? "").Trim(),
            [], "/media/" + audio, distractors.ToArray());
        return (material, []);
    }

    public static bool SameContent(string payloadJson, ExerciseMaterial material) =>
        string.Equals(Canonical(payloadJson), Canonical(JsonSerializer.Serialize(material, Json)), StringComparison.Ordinal);

    private static string Canonical(string payloadJson) =>
        JsonSerializer.Serialize(JsonSerializer.Deserialize<ExerciseMaterial>(payloadJson, Json), Json);

    /// <summary>
    /// Создаёт отсутствующие аудиопазлы и обновляет изменившиеся; ничего не удаляет и не архивирует.
    /// </summary>
    public async Task<List<ExerciseSeedResult>> ImportAsync(IReadOnlyList<ExerciseSeed> seeds, string? editorEmail,
        bool dryRun, CancellationToken ct = default)
    {
        var results = new List<ExerciseSeedResult>();
        var items = await editor.Items(ct);
        Guid? editorId = null;
        async Task<Guid> EditorAsync() => editorId ??= await ResolveEditorAsync(editorEmail, ct);

        foreach (var seed in seeds)
        {
            var (material, errors) = Parse(seed);
            var label = string.IsNullOrWhiteSpace(seed.RussianPrompt) ? seed.Audio ?? "" : seed.RussianPrompt.Trim();
            if (material is null)
            {
                results.Add(new(label, "ошибка", string.Join(" ", errors)));
                continue;
            }

            var audioError = AudioSourceError(seed);
            if (audioError is not null)
            {
                results.Add(new(label, "ошибка", audioError));
                continue;
            }

            var payloadJson = JsonSerializer.Serialize(material, Json);
            var existing = items.FirstOrDefault(x => x.Kind == Kind
                && string.Equals(x.Title, material.RussianPrompt, StringComparison.OrdinalIgnoreCase));

            if (existing is null)
            {
                results.Add(new(label, dryRun ? "создать" : "создан", null));
                if (dryRun) continue;
                await CopyAudioAsync(seed, ct);
                var id = await editor.Create(Kind, payloadJson, ct);
                if (!await editor.PublishDraft(Kind, id, await EditorAsync(), ct))
                {
                    results[^1] = new(label, "ошибка", "черновик не опубликован");
                    continue;
                }
                items.Add(new(Kind, id, material.RussianPrompt, true, 1, null, false));
                continue;
            }

            var current = await editor.Material(Kind, existing.Id, ct);
            if (current is null)
            {
                results.Add(new(label, "ошибка", "аудиопазл не найден"));
                continue;
            }
            if (SameContent(current.PayloadJson, material))
            {
                results.Add(new(label, "без изменений", null));
                continue;
            }

            results.Add(new(label, current.Published ? (dryRun ? "обновить" : "обновлён") : (dryRun ? "дополнить" : "дополнен"), null));
            if (dryRun) continue;
            await CopyAudioAsync(seed, ct);

            if (!current.Published)
            {
                if (!await editor.UpdateDraft(Kind, existing.Id, payloadJson, ct))
                {
                    results[^1] = new(label, "ошибка", "черновик не обновлён");
                    continue;
                }
                await editor.PublishDraft(Kind, existing.Id, await EditorAsync(), ct);
                continue;
            }

            var revisionId = await editor.StartRevision(Kind, existing.Id, await EditorAsync(), ct);
            if (revisionId is null
                || !await editor.UpdateRevision(revisionId.Value, payloadJson, ct)
                || !await editor.PublishRevision(revisionId.Value, ct))
            {
                results[^1] = new(label, "ошибка", "ревизия не опубликована");
                continue;
            }
            items = await editor.Items(ct);
        }

        return results;
    }

    private static string AudioSourcePath(IWebHostEnvironment environment, ExerciseSeed seed) =>
        Path.Combine(environment.ContentRootPath, "Data", "exercises", "audio", Path.GetFileName(seed.Audio));

    private string? AudioSourceError(ExerciseSeed seed) =>
        File.Exists(AudioSourcePath(environment, seed)) ? null : $"{Path.GetFileName(seed.Audio)} не найден в Data/exercises/audio";

    private async Task CopyAudioAsync(ExerciseSeed seed, CancellationToken ct)
    {
        var name = Path.GetFileName(seed.Audio);
        var folder = Path.Combine(environment.WebRootPath, "media");
        Directory.CreateDirectory(folder);
        var target = Path.Combine(folder, name);
        if (File.Exists(target)) return;
        await using var input = File.OpenRead(AudioSourcePath(environment, seed));
        await using var output = File.Create(target);
        await input.CopyToAsync(output, ct);
    }

    private async Task<Guid> ResolveEditorAsync(string? editorEmail, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(editorEmail))
        {
            var user = await accounts.FindByEmail(editorEmail.Trim(), ct);
            if (user is null) throw new InvalidOperationException($"Пользователь «{editorEmail}» не найден.");
            if (!user.IsEditor) throw new InvalidOperationException($"У пользователя «{user.Email}» нет роли редактора.");
            return user.Id;
        }

        var editorUser = await accounts.FirstEditor(ct);
        if (editorUser is null) throw new InvalidOperationException("В базе нет пользователя с ролью редактора: передайте его почту.");
        return editorUser.Id;
    }
}
