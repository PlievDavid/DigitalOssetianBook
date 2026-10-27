using System.Text.Json;
using System.Text.RegularExpressions;

namespace IronLanguage.Db;

public sealed partial record BookCoverDesign(string Background, string TextColor, string Accent, string Font, string Pattern)
{
    private static readonly BookCoverDesign[] Presets =
    [
        new("#E6EDDC", "#173F31", "#7D9568", "onest", "none"),
        new("#F6E8CC", "#503820", "#B88C43", "onest", "lines"),
        new("#25394B", "#FCFAF1", "#B2C8CA", "onest", "arches"),
        new("#914832", "#FFF8ED", "#E8C094", "onest", "dots"),
        new("#EAE4EF", "#42364C", "#9A86AB", "onest", "lines"),
        new("#DCEAE8", "#184B45", "#7CA69E", "onest", "arches")
    ];

    public static BookCoverDesign ForTitle(string title)
    {
        var hash = 0u;
        foreach (var character in title) hash = unchecked(hash * 31 + character);
        return Presets[hash % Presets.Length];
    }

    public static BookCoverDesign Read(string? json, string title)
    {
        try
        {
            var design = string.IsNullOrEmpty(json) ? null
                : JsonSerializer.Deserialize<BookCoverDesign>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            return IsValid(design) ? design! : ForTitle(title);
        }
        catch (JsonException) { return ForTitle(title); }
    }

    public static bool IsValid(BookCoverDesign? design) => design is not null
        && IsColor(design.Background) && IsColor(design.TextColor) && IsColor(design.Accent)
        && design.Font is "onest" or "golos" or "serif"
        && design.Pattern is "none" or "lines" or "dots" or "arches"
        && Contrast(design.Background, design.TextColor) >= 4.5;

    public static double Contrast(string background, string textColor)
    {
        if (!IsColor(background) || !IsColor(textColor)) return 0;
        var first = Luminance(background);
        var second = Luminance(textColor);
        return (Math.Max(first, second) + .05) / (Math.Min(first, second) + .05);
    }

    private static bool IsColor(string? value) => value is not null && ColorPattern().IsMatch(value);

    private static double Luminance(string color)
    {
        var channels = new[] { 1, 3, 5 }.Select(offset => Convert.ToInt32(color.Substring(offset, 2), 16) / 255d)
            .Select(channel => channel <= .04045 ? channel / 12.92 : Math.Pow((channel + .055) / 1.055, 2.4)).ToArray();
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    }

    [GeneratedRegex(@"\A#[0-9a-fA-F]{6}\z", RegexOptions.CultureInvariant)]
    private static partial Regex ColorPattern();
}
