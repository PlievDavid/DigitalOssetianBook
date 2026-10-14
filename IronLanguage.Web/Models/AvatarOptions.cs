using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace IronLanguage.Web.Models;

public record AvatarOptions : IValidatableObject
{
    public string Face { get; set; } = "oval";
    public string Skin { get; set; } = "warm";
    public string Eyes { get; set; } = "almond";
    public string Brows { get; set; } = "soft";
    public string Hair { get; set; } = "waves";
    public string HairColor { get; set; } = "chestnut";
    public string Top { get; set; } = "sweatshirt";
    public string TopColor { get; set; } = "forest";
    public string Accessory { get; set; } = "none";
    public string Background { get; set; } = "mountains";

    public string Get(string property) => property switch
    {
        nameof(Face) => Face, nameof(Skin) => Skin, nameof(Eyes) => Eyes, nameof(Brows) => Brows,
        nameof(Hair) => Hair, nameof(HairColor) => HairColor, nameof(Top) => Top,
        nameof(TopColor) => TopColor, nameof(Accessory) => Accessory, nameof(Background) => Background,
        _ => throw new ArgumentOutOfRangeException(nameof(property))
    };

    public AvatarOptions With(string property, string value) => property switch
    {
        nameof(Face) => this with { Face = value }, nameof(Skin) => this with { Skin = value },
        nameof(Eyes) => this with { Eyes = value }, nameof(Brows) => this with { Brows = value },
        nameof(Hair) => this with { Hair = value }, nameof(HairColor) => this with { HairColor = value },
        nameof(Top) => this with { Top = value }, nameof(TopColor) => this with { TopColor = value },
        nameof(Accessory) => this with { Accessory = value }, nameof(Background) => this with { Background = value },
        _ => throw new ArgumentOutOfRangeException(nameof(property))
    };

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        foreach (var group in AvatarCatalog.Groups)
            if (!group.Choices.Any(x => x.Id == Get(group.Property)))
                yield return new ValidationResult("Выберите доступный вариант.", [group.Property]);
    }

    [System.Text.Json.Serialization.JsonIgnore]
    public bool IsValid => !Validate(new ValidationContext(this)).Any();

    public AvatarOptions Sanitize()
    {
        var safe = new AvatarOptions();
        foreach (var group in AvatarCatalog.Groups)
            if (group.Choices.Any(x => x.Id == Get(group.Property)))
                safe = safe.With(group.Property, Get(group.Property));
        return safe;
    }

    public static AvatarOptions Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            var options = JsonSerializer.Deserialize<AvatarOptions>(json);
            return options is { IsValid: true } ? options : new();
        }
        catch (JsonException) { return new(); }
    }
}

public sealed class AvatarEditorModel
{
    [Required] public AvatarOptions Options { get; set; } = new();
    public bool Onboarding { get; set; }
}

public enum AvatarEmotion { Neutral, Happy, Thinking, Surprised, Sad, Supportive }
public record AvatarDisplayModel(AvatarOptions Options, bool Portrait = false, AvatarEmotion Emotion = AvatarEmotion.Neutral);
public record AvatarChoice(string Id, string Label, string? Color = null);
public record AvatarGroup(string Property, string Label, AvatarChoice[] Choices)
{
    public bool IsColor => Choices[0].Color is not null;
}
public record AvatarSection(string Id, string Label, AvatarGroup[] Groups);

public static class AvatarCatalog
{
    public static readonly AvatarSection[] Sections =
    [
        new("face", "Лицо",
        [
            new(nameof(AvatarOptions.Face), "Форма лица", [new("oval", "Овальное"), new("round", "Круглое"), new("angular", "Выраженные скулы")]),
            new(nameof(AvatarOptions.Skin), "Оттенок кожи", [new("light", "Светлый", "#f9dcc4"), new("warm", "Тёплый", "#eec19b"), new("golden", "Золотистый", "#dba475"), new("tan", "Смуглый", "#bd8059"), new("brown", "Коричневый", "#925c40"), new("deep", "Тёмный", "#694331")]),
            new(nameof(AvatarOptions.Eyes), "Глаза", [new("almond", "Миндалевидные"), new("round", "Круглые"), new("relaxed", "Мягкий взгляд")]),
            new(nameof(AvatarOptions.Brows), "Брови", [new("soft", "Мягкие"), new("bold", "Густые"), new("straight", "Прямые")])
        ]),
        new("hair", "Волосы",
        [
            new(nameof(AvatarOptions.Hair), "Причёска", [new("short", "Короткая"), new("waves", "Волнистая"), new("curls", "Кудри"), new("long", "Длинная"), new("bob", "Каре"), new("ponytail", "Хвост")]),
            new(nameof(AvatarOptions.HairColor), "Цвет волос", [new("black", "Чёрный", "#292723"), new("brown", "Тёмно-коричневый", "#493022"), new("chestnut", "Каштановый", "#784d30"), new("copper", "Рыжий", "#b56538"), new("blond", "Светлый", "#d6b470"), new("silver", "Седой", "#92999c")])
        ]),
        new("clothes", "Одежда",
        [
            new(nameof(AvatarOptions.Top), "Верхняя одежда", [new("sweatshirt", "Свитшот"), new("hoodie", "Худи"), new("tee", "Футболка"), new("shirt", "Рубашка"), new("jacket", "Куртка"), new("knit", "Джемпер")]),
            new(nameof(AvatarOptions.TopColor), "Цвет одежды", [new("forest", "Зелёный", "#315744"), new("blue", "Синий", "#496e91"), new("cream", "Кремовый", "#d6c49e"), new("berry", "Бордовый", "#92545b"), new("ochre", "Охра", "#c69a4d"), new("slate", "Серый", "#647078")])
        ]),
        new("accessories", "Аксессуары",
        [
            new(nameof(AvatarOptions.Accessory), "Детали образа", [new("none", "Без аксессуаров"), new("glasses", "Очки"), new("roundglasses", "Круглые очки"), new("earrings", "Серьги"), new("scarf", "Шарф")])
        ]),
        new("background", "Фон",
        [
            new(nameof(AvatarOptions.Background), "Фон аватара", [new("mountains", "Осетинские горы"), new("sage", "Шалфей", "#eff2e8"), new("sky", "Небо", "#ecf4fc"), new("sand", "Песок", "#fcf5e9"), new("plain", "Без фона", "#ffffff")])
        ])
    ];

    public static IEnumerable<AvatarGroup> Groups => Sections.SelectMany(x => x.Groups);
    public static string Color(string property, string id) => Groups.Single(x => x.Property == property).Choices.Single(x => x.Id == id).Color!;
}
