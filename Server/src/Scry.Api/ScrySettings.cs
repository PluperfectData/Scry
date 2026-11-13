namespace Scry.Api;

/// <summary>The <c>Scry</c> configuration section.</summary>
public sealed class ScrySettings
{
    public const string Section = "Scry";

    /// <summary>Where uploads and DuckDB files live, relative to the content root unless absolute.</summary>
    public string DataDirectory { get; set; } = "data";

    /// <summary>The one origin CORS allows: the client's.</summary>
    public string ClientOrigin { get; set; } = "http://localhost:5173";
}
