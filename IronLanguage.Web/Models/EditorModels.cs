using System.Text.Json;
using IronLanguage.Db;
using Microsoft.AspNetCore.Http;

namespace IronLanguage.Web.Models;

public sealed class EditorFormModel
{
    public string Kind { get; set; } = "";
    public Guid? ContentId { get; set; }
    public Guid? RevisionId { get; set; }
    public string Ossetian { get; set; } = "";
    public string Russian { get; set; } = "";
    public string Example { get; set; } = "";
    public string LiteraryTranslation { get; set; } = "";
    public string Authors { get; set; } = "";
    public string Difficulty { get; set; } = "";
    public string? ExistingCoverImagePath { get; set; }
    public IFormFile? CoverImage { get; set; }
    public string RussianPrompt { get; set; } = "";
    public string OssetianAnswer { get; set; } = "";
    public string TokensText { get; set; } = "";
    public string AlternativesText { get; set; } = "";
    public string Explanation { get; set; } = "";
    public string WordIdsCsv { get; set; } = "";
    public string ChaptersJson { get; set; } = "[]";
    public string DialogueTitle { get; set; } = "";
    public string Dialect { get; set; } = "Iron";
    public int Level { get; set; } = 1;
    public string CharactersText { get; set; } = "";
    public string LinesText { get; set; } = "";
    public string TurnsText { get; set; } = "";
    public string? ExistingAudioPath { get; set; }
    public IFormFile? Audio { get; set; }

    public static EditorFormModel FromPayload(string kind, string json, Guid? contentId = null, Guid? revisionId = null)
    {
        var model = new EditorFormModel { Kind = kind, ContentId = contentId, RevisionId = revisionId };
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        if (kind == "word")
        {
            var p = JsonSerializer.Deserialize<WordMaterial>(json, options)!;
            model.Ossetian = p.Ossetian; model.Russian = p.Russian; model.Example = p.Example; model.ExistingAudioPath = p.AudioPath;
        }
        else if (kind is "audio" or "translation")
        {
            var p = JsonSerializer.Deserialize<ExerciseMaterial>(json, options)!;
            model.RussianPrompt = p.RussianPrompt; model.OssetianAnswer = p.OssetianAnswer;
            model.TokensText = string.Join('\n', p.Tokens); model.AlternativesText = string.Join('\n', p.Alternatives);
            model.Explanation = p.Explanation; model.WordIdsCsv = string.Join(',', p.WordIds); model.ExistingAudioPath = p.AudioPath;
        }
        else if (kind == "book")
        {
            var p = JsonSerializer.Deserialize<BookMaterial>(json, options)!;
            model.Russian = p.Title; model.Example = p.Description;
            model.LiteraryTranslation = p.LiteraryTranslation;
            model.Authors = p.Authors; model.Difficulty = p.Difficulty; model.ExistingCoverImagePath = p.CoverImagePath;
            model.ChaptersJson = JsonSerializer.Serialize(p.Chapters, options);
        }
        else if (kind == "dialogue")
        {
            var p = JsonSerializer.Deserialize<DialogueMaterial>(json, options)!;
            var names = p.Characters.ToDictionary(x => x.Id, x => x.Name);
            model.DialogueTitle = p.Title; model.Dialect = p.Dialect; model.Level = p.Level;
            model.CharactersText = string.Join('\n', p.Characters.Select(x => x.Color.Length > 0 ? $"{x.Name} | {x.Color}" : x.Name));
            model.LinesText = string.Join('\n', p.Lines.Select(x =>
                $"{(x.CharacterId == Services.DialogueScript.StudentId ? Services.DialogueScript.StudentName : names.GetValueOrDefault(x.CharacterId, "?"))}: {x.Text}"));
            model.TurnsText = string.Join('\n', p.Turns.Select(x =>
                $"{x.LineNumber} | {x.Kind} | {string.Join("; ", x.References)} | {string.Join("; ", x.Options)} | {x.HintThreshold} | {(x.Skippable ? "да" : "нет")}"));
        }
        return model;
    }
}

public sealed record EditorIndexModel(List<EditorItem> Items);

public sealed class EditorPreviewModel
{
    public string Kind { get; init; } = "";
    public Guid ContentId { get; init; }
    public Guid? RevisionId { get; init; }
    public int Version { get; init; }
    public bool Published { get; init; }
    public bool Historical { get; init; }
    public string? Error { get; set; }
    public WordMaterial? Word { get; init; }
    public ExerciseMaterial? Exercise { get; init; }
    public BookMaterial? Book { get; init; }
    public DialogueMaterial? Dialogue { get; init; }
    public List<ContentRevision> History { get; init; } = [];
    public Dictionary<Guid, WordEntry> Words { get; init; } = [];
}
