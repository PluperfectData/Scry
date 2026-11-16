namespace Scry.Api;

/// <summary>The <c>Scry</c> configuration section.</summary>
public sealed class ScrySettings
{
    public const string Section = "Scry";

    /// <summary>Where uploads and DuckDB files live, relative to the content root unless absolute.</summary>
    public string DataDirectory { get; set; } = "data";

    /// <summary>The one origin CORS allows: the client's.</summary>
    public string ClientOrigin { get; set; } = "http://localhost:6160";

    /// <summary>This API's own origin, which Scry gives Nexus for its push API and its pairing callback.</summary>
    public string ApiOrigin { get; set; } = "http://localhost:6161";
}
