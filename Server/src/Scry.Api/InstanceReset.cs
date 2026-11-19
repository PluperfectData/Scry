#if DEBUG
using System.Globalization;

namespace Scry.Api;

/// <summary>
/// The <c>reset</c> command, compiled into Debug builds alone and refused outside Development. It sets aside what the
/// installer and the Settings page stored, so the next start opens the installer at its first step. The database, the
/// encryption keys in <c>data/keys</c>, and the sources' rows in <c>data/workspaces</c> stay.
/// </summary>
public static class InstanceReset
{
    private static readonly (string Key, string Effect)[] Configured =
    [
        ("ConnectionStrings:Scry", "the installer skips its database step"),
        ("Scry:ClientOrigin", "the client's address is fixed"),
        ("Scry:ApiOrigin", "the API's address is fixed"),
        ("Mail:ServerToken", "Postmark's token is fixed"),
        ("Mail:MailpitUrl", "Mailpit's address is fixed"),
        ("Scry:MailFrom", "the sender is fixed"),
        ("Scry:MailFromName", "the sender's name is fixed"),
        ("Jwt:SigningKey", "the signing key is fixed"),
    ];

    /// <summary>Answers the exit code, having said what it did.</summary>
    public static int Run(bool development, string dataDirectory, IConfiguration configuration, TextWriter output, TimeProvider time)
    {
        if (!development)
        {
            output.WriteLine("reset runs only in Development, so an instance in use cannot be reset.");
            return 1;
        }

        var stored = Path.Combine(dataDirectory, InstanceFile.FileName);
        if (File.Exists(stored))
        {
            var stamp = time.GetUtcNow().ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
            var aside = Path.Combine(dataDirectory, $"instance-before-reset-{stamp}.json");
            File.Move(stored, aside);
            output.WriteLine($"Set aside the stored settings in {aside}. Move it back to {stored} to undo the reset.");
        }
        else
        {
            output.WriteLine("Scry has no stored settings to set aside.");
        }

        foreach (var (key, effect) in Configured)
        {
            if (!string.IsNullOrWhiteSpace(configuration[key]))
            {
                output.WriteLine($"{key} is set in this machine's configuration, so {effect}.");
            }
        }

        output.WriteLine("The database, data/keys, and data/workspaces are kept. Start the API, then open /install on its client.");
        return 0;
    }
}
#endif
