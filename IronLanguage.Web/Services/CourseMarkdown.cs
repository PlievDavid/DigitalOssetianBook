using System.Net;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Html;

namespace IronLanguage.Web.Services;

// Небольшое подмножество Markdown: пользовательский HTML всегда кодируется.
public static partial class CourseMarkdown
{
    private static string Inline(string text)
    {
        var encoded = HtmlEncoder.Default.Encode(text);
        encoded = Bold().Replace(encoded, "<strong>$1</strong>");
        return Italic().Replace(encoded, "<em>$1</em>");
    }

    public static IHtmlContent Render(string? text)
    {
        var result = new StringBuilder();
        var paragraph = new List<string>();
        var inList = false;
        void FlushParagraph() { if (paragraph.Count > 0) { result.Append("<p>").Append(string.Join("<br>", paragraph.Select(Inline))).Append("</p>"); paragraph.Clear(); } }
        void CloseList() { if (inList) { result.Append("</ul>"); inList = false; } }
        foreach (var line in (text ?? "").Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
        {
            var trimmed = line.Trim();
            if (trimmed.Length == 0) { FlushParagraph(); CloseList(); continue; }
            var item = ListItem().Match(trimmed);
            if (item.Success) { FlushParagraph(); if (!inList) { result.Append("<ul>"); inList = true; } result.Append("<li>").Append(Inline(item.Groups[1].Value)).Append("</li>"); continue; }
            CloseList();
            var heading = Heading().Match(trimmed);
            if (heading.Success) { FlushParagraph(); result.Append("<h3>").Append(Inline(heading.Groups[1].Value)).Append("</h3>"); }
            else paragraph.Add(trimmed);
        }
        FlushParagraph(); CloseList();
        return new HtmlString(result.ToString());
    }

    public static string Excerpt(string? text)
    {
        var rendered = Render(text).ToString() ?? "";
        return WebUtility.HtmlDecode(Tags().Replace(rendered.Replace("</p>", " ").Replace("</li>", " ").Replace("</h3>", " ").Replace("<br>", " "), "")).Trim();
    }

    [GeneratedRegex(@"\*\*(.+?)\*\*")] private static partial Regex Bold();
    [GeneratedRegex(@"(?<!\*)\*([^*]+)\*(?!\*)")] private static partial Regex Italic();
    [GeneratedRegex(@"^[-*] +(.+)$")] private static partial Regex ListItem();
    [GeneratedRegex(@"^#{1,3} +(.+)$")] private static partial Regex Heading();
    [GeneratedRegex(@"<[^>]+>")] private static partial Regex Tags();
}
