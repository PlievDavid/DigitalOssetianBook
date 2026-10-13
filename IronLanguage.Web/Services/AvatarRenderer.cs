using System.Text;
using IronLanguage.Web.Models;

namespace IronLanguage.Web.Services;

/// <summary>Shared, versioned SVG renderer. Expressions and poses do not modify saved appearance.</summary>
public static class AvatarRenderer
{
    public static string Url(AvatarOptions options, AvatarEmotion emotion = AvatarEmotion.Neutral, bool portrait = false) =>
        "/avatars/render?v=1&" + string.Join("&", AvatarCatalog.Groups.Select(g => $"{g.Property}={Uri.EscapeDataString(options.Get(g.Property))}"))
        + $"&emotion={emotion}&portrait={portrait.ToString().ToLowerInvariant()}";

    public static string Svg(AvatarOptions o, AvatarEmotion emotion = AvatarEmotion.Neutral, bool portrait = false)
    {
        if (!o.IsValid || !Enum.IsDefined(emotion)) throw new ArgumentException("Unknown avatar option.");
        var skin = AvatarCatalog.Color(nameof(o.Skin), o.Skin);
        var hair = AvatarCatalog.Color(nameof(o.HairColor), o.HairColor);
        var top = AvatarCatalog.Color(nameof(o.TopColor), o.TopColor);
        var s = new StringBuilder();
        void Add(string svg) => s.Append(svg);
        Add($$"""
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="{{(portrait ? "40 35 240 240" : "0 0 320 520")}}" fill="none">
        <defs>
          <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{{skin}}"/><stop offset=".6" stop-color="{{skin}}"/><stop offset="1" stop-color="#8d4935" stop-opacity=".55"/></linearGradient>
          <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{{hair}}"/><stop offset=".6" stop-color="{{hair}}"/><stop offset="1" stop-color="#171c1c"/></linearGradient>
          <linearGradient id="top" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="{{top}}"/><stop offset=".65" stop-color="{{top}}"/><stop offset="1" stop-color="#1c302e" stop-opacity=".8"/></linearGradient>
          <linearGradient id="pants" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eadbc1"/><stop offset="1" stop-color="#c3ad8e"/></linearGradient>
          <radialGradient id="blush"><stop stop-color="#c47562" stop-opacity=".28"/><stop offset="1" stop-color="#c47562" stop-opacity="0"/></radialGradient>
          <pattern id="knit" width="6" height="6" patternUnits="userSpaceOnUse"><path d="m0 0 3 3 3-3" stroke="#fff" opacity=".055"/></pattern>
        </defs>
        """);
        var bg = o.Background switch { "sky" => "#ecf4fc", "sand" => "#fcf5e9", "plain" => "none", _ => "#eff2e8" };
        Add($"<rect width=\"320\" height=\"520\" rx=\"20\" fill=\"{bg}\"/>");
        if (o.Background == "mountains")
            Add("""
            <g opacity=".68">
              <path d="m0 277 48-96 30 44 58-105 55 99 29-52 100 114v177H0Z" fill="#cddcdb"/>
              <path d="m18 240 30-59 30 44 58-105 29 53-31-18-17 29-11-12-28 65-26-27Z" fill="#fff" opacity=".88"/>
              <path d="m183 251 37-84 24 34-17-10-10 24-9-4Z" fill="#fff"/>
              <path d="m0 336 58-64 56 24 91-40 115 85v134H0Z" fill="#b6c8b8"/>
              <path d="m0 421 70-57 86 41 56-43 108 28v130H0Z" fill="#dce1c7"/>
              <path d="m242 351 6-102 31-3 6 105Z" fill="#b4ab92"/>
              <path d="m248 249 17-6 14 3-14 6v98l-23 1Z" fill="#d2c8ae"/>
              <path d="m265 252 14-6 6 105-20-1Z" fill="#9e9987"/>
              <g stroke="#8c897b" stroke-width="1" opacity=".5"><path d="m247 273 17-3m-18 24 18-3m-19 24 19-3m-21 25 22-3m4-58 9 3m-9 19 10 4m-9 19 10 4"/></g>
              <path d="M255 268h3v8h-3Zm-1 26h3v8h-3Zm-1 28h4v12h-4Zm18-43h3v8h-3Zm1 25h3v8h-3Z" fill="#5b6258"/>
              <path d="m228 355 19-11 25 4 22-3 15 21Z" fill="#b6b7a2"/>
              <g stroke="#9baa87" stroke-width="2"><path d="m28 455 2-38m0 21-12-10m12 2 13-15m245 56 3-38m-2 21-11-9m12 0 12-13"/></g>
            </g>
            """);
        Add("<ellipse cx=\"160\" cy=\"495\" rx=\"76\" ry=\"9\" fill=\"#536347\" opacity=\".14\"/>");
        // Long hair sits behind the face and shoulders.
        if (o.Hair is "long" or "bob")
            Add($"<path d=\"M102 94Q96 48 158 48q69-2 65 62l{(o.Hair == "long" ? "9 157q-37 13-53-15-34 28-85 7Z" : "0 95q-18 14-29 0-19 15-51 0Z")}\" fill=\"url(#hair)\"/>");
        if (o.Hair == "ponytail")
            Add("<path d=\"M211 79q42-9 32 53l-10 62q-19-5-17-38l-5-54Z\" fill=\"url(#hair)\"/><path d=\"m217 91 19 4\" stroke=\"#d6b470\" stroke-width=\"6\"/>");
        // Fixed lower outfit.
        Add("""
        <path d="M116 331h89l-7 72-10 72h-31l-2-104-10 103h-33l-5-65Z" fill="url(#pants)" stroke="#bda98d" stroke-width="1.2"/>
        <path d="m155 348 1 24m-37-29-7 20m84-20 4 19m-67 33-10 69m57-71-6 70" stroke="#b5a086" stroke-width="2" opacity=".65"/>
        <path d="M112 469h30l1 16q-9 12-39 7-5-10 8-23ZM158 469h29l13 14q7 9-2 11h-42q-5-11 2-25Z" fill="#fafaf3" stroke="#c5c8bf" stroke-width="1.5"/>
        <path d="m106 490 33 1m17 0h42m-85-13 19 1m30-1 21 1m-69-5 17 2m32-2 15 2" stroke="#b5bdb7" stroke-width="2"/>
        """);
        // Neck and body.
        Add("""
        <path d="M143 190h34v38q-14 20-34 0Z" fill="url(#skin)"/>
        <path d="M143 192h34v16q-15 8-34-1Z" fill="#894c37" opacity=".18"/>
        """);
        Add("<path d=\"M139 220q-19 0-29 14l-2 90 8 16q43 12 89 0l7-18-5-83q-7-17-29-19-19 13-39 0Z\" fill=\"url(#top)\" stroke=\"#263e36\" stroke-opacity=\".25\" stroke-width=\"1.4\"/>");
        if (o.Top == "tee")
            Add("<path d=\"M111 237 98 257l22 8m83-26 17 18-17 10\" fill=\"url(#top)\" stroke=\"#223932\" stroke-opacity=\".2\"/>");
        if (o.Top == "hoodie")
            Add("<path d=\"M133 219q-17-30 28-25 39-3 28 25l-11 15-17-9-16 10Z\" fill=\"url(#top)\" stroke=\"#253e34\" stroke-opacity=\".45\"/><path d=\"m150 231 1 30m20-30-1 30m-36 42 12-11h29l11 11v15h-52Z\" stroke=\"#fff\" stroke-opacity=\".27\" stroke-width=\"2\"/>");
        else if (o.Top == "shirt")
            Add("<path d=\"m140 218 20 12-14 14-12-21m45-5-19 12 13 14 14-20M160 230v109m-35-72h21v21h-21Z\" stroke=\"#ecf0e5\" stroke-opacity=\".6\" stroke-width=\"2\"/>");
        else
            Add("<path d=\"M139 221q20 22 41-1m-62 111q39 9 83 0\" stroke=\"#ecf0e5\" stroke-opacity=\".28\" stroke-width=\"3\"/>");
        if (o.Top == "jacket")
            Add("""
            <path d="M149 225h23l5 114h-33Z" fill="#e9e3d3"/>
            <path d="m141 220 11 9-6 37-14-23Zm36 0-10 9 8 37 15-23Z" fill="url(#top)" stroke="#e9e3d3" stroke-opacity=".35" stroke-width="2"/>
            <path d="m143 265-1 66m34-66 2 66m-57-52 13-5m50 5 13-5" stroke="#182e27" stroke-opacity=".4" stroke-width="2"/>
            """);
        if (o.Top == "shirt")
            Add("<g fill=\"#eee8db\"><circle cx=\"160\" cy=\"255\" r=\"2\"/><circle cx=\"160\" cy=\"277\" r=\"2\"/><circle cx=\"160\" cy=\"299\" r=\"2\"/><circle cx=\"160\" cy=\"321\" r=\"2\"/></g>");
        if (o.Top == "knit") Add("<path d=\"m119 241 81-1 4 86q-38 11-89 0Z\" fill=\"url(#knit)\"/>");
        Add("<path d=\"m129 264-5 47m64-47 4 48m-61 9 17 3m25-3 13-4\" stroke=\"#152d27\" opacity=\".15\" stroke-width=\"2\"/>");
        // Pose-specific arms share the selected sleeve and skin colors.
        var sleeve = o.Top == "tee" ? "url(#skin)" : "url(#top)";
        if (emotion == AvatarEmotion.Happy)
        {
            Add($"<path d=\"M119 239Q93 229 82 199L65 171l-15 11q14 68 48 89Z\" fill=\"{sleeve}\"/><path d=\"M200 239q27-10 38-40l17-28 15 11q-13 67-48 89Z\" fill=\"{sleeve}\"/>");
            Add("<path d=\"M49 183q-10-10-9-24l4-7 7 9 3-16 6-2 1 14 7-8 6 4-10 21-3 8ZM256 181q-3-7-9-14l-3-14 6-3 7 9 2-14 7 1 2 13 6-7 6 7q3 13-12 23Z\" fill=\"url(#skin)\"/>");
        }
        else if (emotion == AvatarEmotion.Surprised)
        {
            Add($"<path d=\"M115 238q-14 5-22 36l-24-40-16 11 31 57q16 18 35-6ZM204 238q14 5 22 36l24-40 16 11-31 57q-16 18-35-6Z\" fill=\"{sleeve}\"/>");
            Add("<path d=\"M52 246q-15-12-11-28l6-2 4 11-1-20 6-2 4 21 4-17 6 1-3 24 9-8 6 3-14 18ZM266 246q15-12 11-28l-6-2-4 11 1-20-6-2-4 21-4-17-6 1 3 24-9-8-6 3 14 18Z\" fill=\"url(#skin)\"/>");
        }
        else if (emotion == AvatarEmotion.Thinking)
        {
            Add($"<path d=\"M111 240q-12 7-12 51 1 18 25 18l35-100-19-5-18 65Z\" fill=\"{sleeve}\"/><path d=\"M204 239q22 27 11 62l-79 5-3-19 59-5-8-26Z\" fill=\"{sleeve}\"/>");
            Add("<path d=\"M140 208q-1-14 9-21l11-3 3 5-12 9 9 5-1 8ZM131 286l-17 3q-9 6 0 14l22 2Z\" fill=\"url(#skin)\"/>");
        }
        else if (emotion == AvatarEmotion.Supportive)
        {
            Add($"<path d=\"M114 238q-10 24-5 57l18 23-11 15q-38-20-33-54l12-40Z\" fill=\"{sleeve}\"/><path d=\"M204 239q21 8 28 37l-24 16-4-59-17 13Z\" fill=\"{sleeve}\"/>");
            Add("<path d=\"M115 313q12 0 13 12l-11 10-11-9ZM208 278l-1-20q0-9 7-10l2 16 12-2q13 4 9 15l-4 11h-20Z\" fill=\"url(#skin)\"/>");
        }
        else
        {
            Add($"<path d=\"M113 237q-10-9-19 11l-14 51q-1 17 23 31l11-19-15-14 17-37ZM205 237q10-9 19 11l14 51q1 17-23 31l-11-19 15-14-17-37Z\" fill=\"{sleeve}\"/>");
            Add("<path d=\"M105 309q9 3 16 15l-9 10-14-14ZM214 309q-9 3-16 15l9 10 14-14Z\" fill=\"url(#skin)\"/>");
        }
        if (o.Accessory == "scarf")
            Add("<path d=\"M134 216q27 19 53-1l3 16q-20 20-59 1ZM153 232h20l-2 51-19-3Z\" fill=\"#bb8c5b\"/><path d=\"m156 250 15 2m-16 9 16 2\" stroke=\"#ebd6b9\" stroke-width=\"2\"/>");
        // Ears, face and highlights.
        Add("<ellipse cx=\"107\" cy=\"139\" rx=\"13\" ry=\"22\" fill=\"url(#skin)\"/><ellipse cx=\"213\" cy=\"139\" rx=\"13\" ry=\"22\" fill=\"url(#skin)\"/><path d=\"M104 130q-8 7 3 18m109-18q8 7-3 18\" stroke=\"#92553d\" stroke-opacity=\".4\" stroke-width=\"2\"/>");
        var face = o.Face switch
        {
            "round" => "M108 105q3-47 52-47t52 47v42q0 61-52 61t-52-61Z",
            "angular" => "M109 104q0-45 51-45t51 45l-3 62-24 31-24 11-24-11-24-31Z",
            _ => "M111 104q0-46 49-46t49 46v43q-4 47-49 62-45-15-49-62Z"
        };
        Add($"<path d=\"{face}\" fill=\"url(#skin)\"/>");
        Add("<ellipse cx=\"127\" cy=\"159\" rx=\"19\" ry=\"14\" fill=\"url(#blush)\"/><ellipse cx=\"193\" cy=\"159\" rx=\"19\" ry=\"14\" fill=\"url(#blush)\"/>");
        Add("<path d=\"M161 137l-6 22q4 5 10 0\" stroke=\"#92553d\" stroke-opacity=\".45\" stroke-width=\"2\" stroke-linecap=\"round\"/>");
        var eyeY = emotion == AvatarEmotion.Sad ? 139 : 134;
        if (emotion == AvatarEmotion.Happy)
            Add("<path d=\"M121 135q10-13 20 0m38 0q10-13 20 0\" stroke=\"#352a24\" stroke-width=\"3\" stroke-linecap=\"round\"/>");
        else
        {
            var eyeHeight = emotion == AvatarEmotion.Surprised || o.Eyes == "round" ? 12 : o.Eyes == "relaxed" ? 7 : 9;
            foreach (var x in new[] { 131, 189 })
            {
                Add($"<ellipse cx=\"{x}\" cy=\"{eyeY}\" rx=\"12\" ry=\"{eyeHeight}\" fill=\"#fffcf3\"/><ellipse cx=\"{x + (emotion == AvatarEmotion.Thinking ? 3 : 0)}\" cy=\"{eyeY}\" rx=\"6.5\" ry=\"{eyeHeight - 1}\" fill=\"#574536\"/><ellipse cx=\"{x + (emotion == AvatarEmotion.Thinking ? 3 : 0)}\" cy=\"{eyeY + 1}\" rx=\"3.8\" ry=\"{eyeHeight - 2}\" fill=\"#242b27\"/><circle cx=\"{x - 2}\" cy=\"{eyeY - 3}\" r=\"2.3\" fill=\"#fff\"/>");
                Add($"<path d=\"M{x - 12} {eyeY - 3}q12 {-eyeHeight} 24 0\" stroke=\"#553b2b\" stroke-width=\"2\" stroke-linecap=\"round\"/>");
            }
        }
        var browsY = emotion == AvatarEmotion.Surprised ? 110 : emotion == AvatarEmotion.Sad ? 123 : 117;
        var browCurve = o.Brows == "straight" ? -1 : -5;
        Add($"<g stroke=\"{hair}\" stroke-width=\"{(o.Brows == "bold" ? 6 : 4)}\" stroke-linecap=\"round\"><path d=\"M120 {browsY}q10 {browCurve} 21 {(emotion == AvatarEmotion.Sad ? -7 : -1)}M179 {(emotion == AvatarEmotion.Thinking ? browsY - 6 : browsY)}q11 {browCurve} 21 {(emotion == AvatarEmotion.Sad ? 7 : 1)}\"/></g>");
        Add(emotion switch
        {
            AvatarEmotion.Happy => "<path d=\"M140 174q20 7 40 0-3 23-20 23t-20-23Z\" fill=\"#643e34\"/><path d=\"M144 177q16 6 32 0l-3 6h-26Z\" fill=\"#fffcf3\"/>",
            AvatarEmotion.Surprised => "<ellipse cx=\"160\" cy=\"182\" rx=\"9\" ry=\"13\" fill=\"#643e34\"/>",
            AvatarEmotion.Sad => "<path d=\"M147 184q13-9 26 0\" stroke=\"#854c3e\" stroke-width=\"2.6\" stroke-linecap=\"round\"/>",
            AvatarEmotion.Thinking => "<path d=\"M151 179q11 5 21-2\" stroke=\"#854c3e\" stroke-width=\"2.6\" stroke-linecap=\"round\"/>",
            _ => "<path d=\"M142 177q18 17 36 0\" stroke=\"#854c3e\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path d=\"M150 186q10 3 20-1\" stroke=\"#fff\" stroke-opacity=\".35\" stroke-width=\"2\" stroke-linecap=\"round\"/>"
        });
        // Six modular hair silhouettes; shared highlights keep all color choices consistent.
        Add(o.Hair switch
        {
            "short" => "<path d=\"M104 117 101 82q-3-28 20-27l-1-8 16 4q17-17 29-6 25-10 34 6 23-1 25 25l-9 42-11-24-3-9q-48 21-83 3l-4 29Z\" fill=\"url(#hair)\"/>",
            "waves" => "<path d=\"m103 126-5-26-8-5 11-12q-13-15 3-23l-3-10 17 1q-2-17 17-12 11-15 27-7 23-9 31 7 21-4 23 16 19 4 10 22 13 11 0 26l-12 23-6-33-10-17q-16 25-48 19l15-19q-23 28-42 23l-5 32Z\" fill=\"url(#hair)\"/>",
            "curls" => "<path d=\"M103 126 96 109q-19-7-9-23-11-17 8-26-4-22 17-23 8-19 26-9 17-16 32-2 22-9 29 11 23-5 27 17 21 7 9 24 12 18-5 29l-13 20-9-30q-14-12-24-5-14-13-28-3-15-9-27 5Z\" fill=\"url(#hair)\"/><g stroke=\"#fff\" opacity=\".13\" stroke-width=\"3\"><path d=\"M112 51q-13 7 0 18m28-29q-12 7 0 18m30-17q-12 7 0 18m31-4q-12 7 0 18m-74 1q-12 7 0 18m31-16q-12 7 0 18m31-8q-12 7 0 18\"/></g>",
            "long" => "<path d=\"M105 128q-18-64 23-77 59-21 91 38l-9 44-10-34-21-24q-16 23-47 30l-10 29 1-42Z\" fill=\"url(#hair)\"/><path d=\"M104 150q-9 40-4 83m111-77q8 45 4 78\" stroke=\"#fff\" stroke-opacity=\".1\" stroke-width=\"3\"/>",
            "bob" => "<path d=\"M103 136q-17-76 20-82 56-20 94 21l1 63-11-26-8-32q-42 18-78 10l-6 33-1 57-14-6Z\" fill=\"url(#hair)\"/>",
            _ => "<path d=\"M103 126q-18-76 36-75 54-11 78 22l1 51-12-28-24-28q-24 31-61 28l-6 31Z\" fill=\"url(#hair)\"/>"
        });
        Add("<path d=\"M120 67q18-15 42-13m18 3q15 4 23 18\" stroke=\"#fff\" stroke-opacity=\".14\" stroke-width=\"3\" stroke-linecap=\"round\"/>");
        if (o.Accessory is "glasses" or "roundglasses")
        {
            var rx = o.Accessory == "glasses" ? 8 : 19;
            Add($"<g stroke=\"#35453e\" stroke-width=\"3\" fill=\"#fff\" fill-opacity=\".09\"><rect x=\"111\" y=\"121\" width=\"40\" height=\"29\" rx=\"{rx}\"/><rect x=\"169\" y=\"121\" width=\"40\" height=\"29\" rx=\"{rx}\"/><path d=\"M151 132q9-5 18 0m-58-2-7-3m105 3 7-3\"/></g>");
        }
        if (o.Accessory == "earrings") Add("<circle cx=\"106\" cy=\"158\" r=\"5\" stroke=\"#d6ad55\" stroke-width=\"3\"/><circle cx=\"214\" cy=\"158\" r=\"5\" stroke=\"#d6ad55\" stroke-width=\"3\"/>");
        Add("</svg>");
        return s.ToString();
    }
}
