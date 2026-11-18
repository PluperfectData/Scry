# Logs

[Documentation](README.md) › Logs

Scry keeps two logs.

**The Log page**, `/log` on the client, lists what happened, newest first, each in a sentence that names what it
happened to:

- a workspace, a member, a dashboard, a chart added, edited, or removed, a source, and a push key, made, changed, or
  removed, with who did it. Moving or resizing a chart writes nothing.
- the push API's sources made, columns added, replacements, and commits with their row counts, by the key, and each
  write it refused, as a warning. A batch on its own writes nothing.
- the Nexus link made, refused, or removed, and a Nexus sync run from the Sources page
- each Schwab sign-in and sync, with its rows or its error
- users, settings, and the installer, which belong to the whole instance

An admin sees every entry. Anyone else sees the entries of the workspaces they edit, and a viewer sees none. Each
source on the Sources page links to its own entries. A removed workspace's entries stay, as entries about the whole
instance.

Entries are kept in the database for 30 days, a number an admin changes on the Settings page, from 1 to 365. Signing
in or out, reading anything, a chart's query, and the install code write no entry.

**The developer log** goes to the console and to a file a day in `data/logs`, `scry-<date>.log`, keeping 14. It has
every Log page entry, under `Scry.Operator`, one line for each request, and the framework's detail and the stack
traces the Log page leaves out. Its levels come from `Serilog:MinimumLevel`: Information, with `Microsoft.AspNetCore`
and `Microsoft.EntityFrameworkCore` at Warning. For more detail, set `Serilog__MinimumLevel__Default` to `Debug`.
