using System.Text.RegularExpressions;

namespace IronLanguage.Web.Services;

public sealed record CourseTheoryMedia(string File, string Caption = "", string Alt = "");

public sealed partial class CourseTheoryMediaStore(IWebHostEnvironment environment, IConfiguration configuration)
{
    public const long ImageLimit = 5 * 1024 * 1024;
    public const long VideoLimit = 80 * 1024 * 1024;
    public const long RequestLimit = VideoLimit + 65_536;
    private readonly string root = MediaRoot(environment, configuration);

    [GeneratedRegex(@"\A[a-f0-9]{32}\.(?:png|jpg|webp|mp4|webm)\z")]
    private static partial Regex FileName();

    public static bool ValidName(string? file) => file is not null && FileName().IsMatch(file);
    public static bool IsVideo(string file) => Path.GetExtension(file) is ".mp4" or ".webm";
    public static string ContentType(string file) => Path.GetExtension(file) switch
    {
        ".png" => "image/png", ".jpg" => "image/jpeg", ".webp" => "image/webp",
        ".mp4" => "video/mp4", ".webm" => "video/webm",
        _ => throw new ArgumentException("Формат вложения не поддерживается.")
    };

    private static string MediaRoot(IWebHostEnvironment environment, IConfiguration configuration)
    {
        var folder = Path.GetFullPath(configuration["CourseTheoryMedia:Root"] ?? ".course-theory-media", environment.ContentRootPath);
        var relative = Path.GetRelativePath(environment.WebRootPath, folder);
        if (!Path.IsPathRooted(relative) && relative != ".." && !relative.StartsWith(".." + Path.DirectorySeparatorChar, StringComparison.Ordinal))
            throw new InvalidOperationException("Хранилище медиа теории должно быть вне публичного каталога.");
        return folder;
    }

    private string Folder(Guid owner) => Path.Combine(root, owner.ToString("N"));

    public bool Exists(Guid owner, string file) => ValidName(file) && File.Exists(Path.Combine(Folder(owner), file));

    public FileStream? Open(Guid owner, string file)
    {
        if (!ValidName(file)) return null;
        try { return new FileStream(Path.Combine(Folder(owner), file), FileMode.Open, FileAccess.Read, FileShare.Read, 65_536, useAsync: true); }
        catch (FileNotFoundException) { return null; }
        catch (DirectoryNotFoundException) { return null; }
    }

    public async Task<string> Upload(Guid owner, IFormFile file, CancellationToken ct)
    {
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (extension == ".jpeg") extension = ".jpg";
        if (extension is not (".jpg" or ".png" or ".webp" or ".mp4" or ".webm"))
            throw new ArgumentException("Выберите JPEG, PNG, WebP, MP4 или WebM.");
        var video = extension is ".mp4" or ".webm";
        if (file.Length == 0 || file.Length > (video ? VideoLimit : ImageLimit))
            throw new ArgumentException(video ? "Выберите видео размером до 80 МБ." : "Выберите фото размером до 5 МБ.");

        await using var source = file.OpenReadStream();
        var prefix = new byte[(int)Math.Min(file.Length, 4096)];
        await source.ReadExactlyAsync(prefix, ct);
        if (!Matches(extension, prefix)) throw new ArgumentException("Содержимое файла не соответствует выбранному формату.");

        var folder = Folder(owner);
        Directory.CreateDirectory(folder);
        var name = Guid.NewGuid().ToString("N") + extension;
        var target = Path.Combine(folder, name);
        var created = false;
        try
        {
            await using var destination = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65_536, useAsync: true);
            created = true;
            await destination.WriteAsync(prefix, ct);
            await source.CopyToAsync(destination, ct);
        }
        catch
        {
            if (created) File.Delete(target);
            throw;
        }
        return name;
    }

    private static bool Matches(string extension, ReadOnlySpan<byte> bytes) => extension switch
    {
        ".png" => bytes.StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) && bytes.Length >= 33 && bytes.Slice(12, 4).SequenceEqual("IHDR"u8),
        ".jpg" => bytes.StartsWith(new byte[] { 255, 216, 255 }) && bytes.Length >= 12,
        ".webp" => bytes.Length >= 20 && bytes.StartsWith("RIFF"u8) && bytes.Slice(8, 4).SequenceEqual("WEBP"u8),
        ".mp4" => bytes.Length >= 24 && bytes.Slice(4, 4).SequenceEqual("ftyp"u8) &&
            System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes) is >= 16 and <= 4096 &&
            bytes.Slice(8, 4).IndexOfAnyExceptInRange((byte)32, (byte)126) < 0,
        ".webm" => bytes.StartsWith(new byte[] { 0x1a, 0x45, 0xdf, 0xa3 }) && bytes.IndexOf(new byte[] { 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d }) >= 0,
        _ => false
    };
}
