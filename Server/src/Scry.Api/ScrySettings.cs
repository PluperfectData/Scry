namespace Scry.Api;

/// <summary>
/// The <c>Scry</c> configuration section. The two addresses are an operator's way around the installer: either one set
/// here wins over the one the installer stored, and the pages cannot change it.
/// </summary>
public sealed class ScrySettings
{
    public const string Section = "Scry";

    /// <summary>Where uploads and DuckDB files live, relative to the content root unless absolute.</summary>
    public string DataDirectory { get; set; } = "data";

    /// <summary>The one origin CORS allows: the client's.</summary>
    public string? ClientOrigin { get; set; }

    /// <summary>This API's own origin, which Scry gives Nexus for its push API and its pairing callback.</summary>
    public string? ApiOrigin { get; set; }
}
