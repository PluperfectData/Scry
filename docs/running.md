# Running Scry

[Documentation](README.md) › Running Scry

## Starting the API and the client

Start the API and the client, then open `http://localhost:6160/install`.

```bash
dotnet run --project Server/src/Scry.Api
```

```bash
npm --prefix Client install
```

```bash
npm --prefix Client run dev
```

The API listens on `http://localhost:6161`. The client listens on `http://localhost:6160` and reads the API's address from
`VITE_API_URL`, set in `Client/.env.development`.

## The installer

An instance starts with nothing set. Until it has a database, both addresses, and an admin, every route but
`/install` and `/health` answers 503, and the client sends its visitors to `/install`. The installer asks, in turn:

1. **The database:** a MySQL 8.4 server's host, port, database, user, and password. Scry makes the database if it is
   missing and the user may, applies its migrations, and keeps the settings only once that works. A database Scry
   used before is adopted with its dashboards, sources, and keys.
2. **The addresses:** the client's, where people open Scry and the one origin CORS allows, and the API's, which
   Scry gives Nexus for its push API and its pairing callback. The page fills in its own address and the API
   address it was built with.
3. **Mail:** Postmark's server token and the sender, with a test mail to an address you name. Mail may stay off.
   A Debug build running as Development writes mail to `data/mail`, and the step says so.
4. **The first admin:** an email, signed in at once. Once mail works the password is optional, and an admin without
   one signs in with mailed links. With mail off, a password is required. A database that already has an admin skips
   this step, which is how an existing instance is adopted.

Admins change all of it later on the Settings page. A new database is opened and brought up to date before Scry moves
to it. The sources' rows stay in `data/workspaces` whichever database Scry uses.

A page on the machine the API runs on uses the installer as it is. Any other page needs the install code, which the
API writes to its log, with a link to `/install` that carries it, at each start while it is not set up. The code is
sent as `Authorization: Bearer scryi_...`, and five wrong codes lock the installer for 15 minutes. A page counts as
on the machine when it reaches the API over loopback with no proxy's forwarding headers, at a loopback name, from a
page at a loopback name. With [`Scry:Proxied`](configuration.md) set, as behind Caddy, the address the proxy forwards
is the one checked, so a page on any other machine still needs the code.

When a wrong client address keeps the Settings page from reaching the API, `/install` on an instance already set up
changes the addresses. Someone locked out uses its Make an admin, which makes an address an admin with a new password
and signs it out everywhere else. On another machine, either asks the API to write a code to its log, good for an
hour. A database that stops opening at a start sends the instance back to step 1, with the stored settings filled in.

The settings are kept in `data/instance.json`, with the database password, the Postmark token, and the session signing
key encrypted by the Data Protection keys in `data/keys`. The API makes the signing key on its first start. On a box,
`data/` must persist across releases.

A Debug build has one more command, `reset`, which sets `data/instance.json` aside under a dated name, so the next
start opens the installer at its first step. The database, `data/keys`, and `data/workspaces` stay: entering the same
database in the installer adopts it again, and a new name starts empty. It refuses outside Development, and a Release
build has no such command. Stop the API before running it.

```bash
dotnet run --project Server/src/Scry.Api -- reset
```
