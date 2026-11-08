using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace IronLanguage.Web.Services;

// Accept text-only Quill documents, never HTML, URLs, embeds or arbitrary CSS.
public static class CourseRichText
{
    public static string PlainText(CourseDraftBlock block)
    {
        if (block.RichText is not JsonElement doc) return block.Text;
        void Invalid() => throw new ArgumentException("Неподдерживаемое оформление текста. Используйте инструменты редактора.");
        if (block.Kind != "theory" || doc.ValueKind != JsonValueKind.Object || doc.GetRawText().Length > 200_000 ||
            !doc.TryGetProperty("ops", out var ops) || ops.ValueKind != JsonValueKind.Array || ops.GetArrayLength() > 4000) { Invalid(); return ""; }
        if (doc.EnumerateObject().Any(p => p.Name != "ops")) Invalid();
        var text = new StringBuilder();
        foreach (var op in ops.EnumerateArray())
        {
            if (op.ValueKind != JsonValueKind.Object || !op.TryGetProperty("insert", out var insert) || insert.ValueKind != JsonValueKind.String) { Invalid(); return ""; }
            if (op.EnumerateObject().Any(p => p.Name is not ("insert" or "attributes"))) Invalid();
            text.Append(insert.GetString());
            if (text.Length > 20_001) Invalid();
            if (!op.TryGetProperty("attributes", out var attrs)) continue;
            if (attrs.ValueKind != JsonValueKind.Object) { Invalid(); return ""; }
            foreach (var attr in attrs.EnumerateObject())
            {
                var value = attr.Value.ValueKind == JsonValueKind.String ? attr.Value.GetString() : null;
                var valid = attr.Name switch
                {
                    "bold" or "italic" or "underline" or "strike" => attr.Value.ValueKind is JsonValueKind.True or JsonValueKind.False,
                    "font" => value is "onest" or "golos" or "serif",
                    "size" => value is "16px" or "18px" or "22px" or "28px",
                    "color" or "background" => value is not null && Regex.IsMatch(value, "^#[0-9a-fA-F]{6}$"),
                    _ => false
                };
                if (!valid) Invalid();
            }
        }
        // Quill's terminal newline is structural; preserve every other whitespace character.
        if (text.Length > 0 && text[^1] == '\n') text.Length--;
        return text.ToString();
    }
}
