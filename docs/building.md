# Building and testing

[Documentation](README.md) › Building and testing

.NET SDK 10.0.302 or a later feature band (`Server/global.json`), and Node 24.

```bash
dotnet test Server/Scry.slnx
```

```bash
npm --prefix Client test
```

Restores are locked to `packages.lock.json`. After a dependency change, run `dotnet restore --force-evaluate`
and commit the lock files.
