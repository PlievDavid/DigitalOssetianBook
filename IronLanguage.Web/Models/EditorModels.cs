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
    public List<ContentRevision> History { get; init; } = [];
    public Dictionary<Guid, WordEntry> Words { get; init; } = [];
}
