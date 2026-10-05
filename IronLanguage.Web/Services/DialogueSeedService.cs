using System.Text.Json;
using IronLanguage.Db;

namespace IronLanguage.Web.Services;

public sealed record DialogueSeed(string Title, string Dialect, int Level, string Characters, string Lines, string Turns);

public sealed record DialogueSeedResult(string Title, string Action, string? Error);

/// <summary>
/// Импортирует диалоги из файлов в папке Data/dialogues через обычный редакторский путь:
/// новый диалог создаётся черновиком и публикуется, изменившийся публикованный — новой ревизией.
/// </summary>
public sealed class DialogueSeedService(IEditorRepository editor, IAccountRepository accounts)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<DialogueSeed> Read(string path)
    {
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<List<DialogueSeed>>(json, Json) ?? [];
    }

    public static DialogueMaterial? Material(DialogueSeed seed) =>
        DialogueScript.Parse(seed.Title, seed.Dialect, seed.Level, seed.Characters, seed.Lines, seed.Turns).Material;

    public static bool SameContent(string payloadJson, DialogueMaterial material) =>
        string.Equals(Canonical(payloadJson), Canonical(JsonSerializer.Serialize(material, Json)), StringComparison.Ordinal);

    private static string Canonical(string payloadJson) =>
        JsonSerializer.Serialize(JsonSerializer.Deserialize<DialogueMaterial>(payloadJson, Json), Json);

    /// <summary>
    /// Создаёт отсутствующие диалоги и обновляет изменившиеся; ничего не удаляет и не архивирует.
    /// </summary>
    public async Task<List<DialogueSeedResult>> ImportAsync(IReadOnlyList<DialogueSeed> seeds, string? editorEmail,
        bool dryRun, CancellationToken ct = default)
    {
        var results = new List<DialogueSeedResult>();
        var items = await editor.Items(ct);
        Guid? editorId = null;
        async Task<Guid> EditorAsync() => editorId ??= await ResolveEditorAsync(editorEmail, ct);

        foreach (var seed in seeds)
        {
            var parsed = DialogueScript.Parse(seed.Title, seed.Dialect, seed.Level, seed.Characters, seed.Lines, seed.Turns);
            if (parsed.Errors.Length > 0)
            {
                results.Add(new(seed.Title, "ошибка", string.Join(" ", parsed.Errors)));
                continue;
            }

            var payloadJson = JsonSerializer.Serialize(parsed.Material!, Json);
            var existing = items.FirstOrDefault(x => x.Kind == "dialogue"
                && string.Equals(x.Title, seed.Title, StringComparison.OrdinalIgnoreCase));

            if (existing is null)
            {
                results.Add(new(seed.Title, dryRun ? "создать" : "создан", null));
                if (dryRun) continue;
                var id = await editor.Create("dialogue", payloadJson, ct);
                if (!await editor.PublishDraft("dialogue", id, await EditorAsync(), ct))
                {
                    results[^1] = new(seed.Title, "ошибка", "черновик не опубликован");
                    continue;
                }
                items.Add(new("dialogue", id, seed.Title, true, 1, null, false));
                continue;
            }

            var current = await editor.Material("dialogue", existing.Id, ct);
            if (current is null)
            {
                results.Add(new(seed.Title, "ошибка", "диалог не найден"));
                continue;
            }
            if (SameContent(current.PayloadJson, parsed.Material!))
            {
                results.Add(new(seed.Title, "без изменений", null));
                continue;
            }

            results.Add(new(seed.Title, current.Published ? (dryRun ? "обновить" : "обновлён") : (dryRun ? "дополнить" : "дополнен"), null));
            if (dryRun) continue;

            if (!current.Published)
            {
                if (!await editor.UpdateDraft("dialogue", existing.Id, payloadJson, ct))
                {
                    results[^1] = new(seed.Title, "ошибка", "черновик не обновлён");
                    continue;
                }
                await editor.PublishDraft("dialogue", existing.Id, await EditorAsync(), ct);
                continue;
            }

            var revisionId = await editor.StartRevision("dialogue", existing.Id, await EditorAsync(), ct);
            if (revisionId is null
                || !await editor.UpdateRevision(revisionId.Value, payloadJson, ct)
                || !await editor.PublishRevision(revisionId.Value, ct))
            {
                results[^1] = new(seed.Title, "ошибка", "ревизия не опубликована");
                continue;
            }
            items = await editor.Items(ct);
        }

        return results;
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