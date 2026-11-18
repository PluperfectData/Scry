using Microsoft.AspNetCore.DataProtection;

namespace Scry.Api;

/// <summary>Encrypts a secret Scry keeps in its database, such as the Nexus link's app key, with ASP.NET Data Protection.</summary>
public sealed class Secrets(IDataProtectionProvider provider)
{
    // Changing the purpose makes the stored app keys unreadable.
    private readonly IDataProtector _protector = provider.CreateProtector("Scry.Connections");

    public string ProtectText(string text) => _protector.Protect(text);

    public string UnprotectText(string stored) => _protector.Unprotect(stored);
}
