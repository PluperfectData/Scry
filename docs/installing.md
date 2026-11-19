# Installing on Windows

[Documentation](README.md) › Installing on Windows

The installer puts Scry on one Windows computer, with nothing to type in a terminal. To work on Scry's code instead,
see [Running Scry](running.md). To run it in containers, see [Running Scry in Docker](docker.md).

## Running the installer

Put the code at `Pluperfect.Data\Scry`, as the README's [quick start](../README.md#quick-start) says. Then, on
Windows 10 or 11, right-click `install.ps1` in that folder and choose **Run with PowerShell**. It:

1. Installs whatever is missing through winget: the .NET 10 SDK, Node.js, MySQL, and Git. A MySQL 8 or later that is
   already installed is used as it is.
2. Fetches Nexus beside Scry, since Scry builds on its connector library, and Pluperfect.Jwt and Pluperfect.Mail
   beside `Pluperfect.Data`, when they aren't there.
3. Asks whether to install Nexus too. Yes runs Nexus's installer as well, and starts both.
4. Builds the API into `data\app\api`, and the site into `data\app\site`.
5. Trusts the .NET development certificate, which serves both addresses below over HTTPS. Windows asks once. Then it
   copies the certificate into `data`, for the shortcut to serve with.
6. Puts a **Scry** shortcut on the desktop, starts Scry, and opens it.

Running it again rebuilds Scry from the code in the folder, and skips the programs already installed. Close Scry's
window first; the installer stops while anything uses port 6161, including a development copy or Scry in Docker.

The development certificate lasts a year. When it runs out, the shortcut says so, and running the installer again
renews it.

⚠ **MySQL's installer adds MySQL to the computer, but Scry doesn't use that server.** It runs one of its own, in its
data folder, so it never touches another database on the computer.

## The first run

The browser opens `https://localhost:6160`, and the installer page starts at Mail, then the first admin. Scry already
knows its database and its addresses, and a page on this computer needs no install code. Then make a workspace.
[The installer](running.md#the-installer) covers each step.

The first start brings Scry's new database up to date, which takes a minute or two.

With Nexus installed too, link the two from a Scry workspace's Settings page, at `https://localhost:6163`.

## Starting and stopping

The desktop shortcut starts Scry. Its window shows what the API is doing; keep it open while you use Scry.
**Ctrl+C**, or closing the window, stops it.

| Address | What |
|---|---|
| `https://localhost:6160` | Scry |
| `https://localhost:6161` | Its API |

A development copy uses the same ports, so run one or the other, not both. Scry's database server listens on
`127.0.0.1:6166`, for Scry alone.

## Where everything is

Everything an install keeps is in `data` in the Scry folder, which git ignores:

| Path | What |
|---|---|
| `data\app` | The built API, in `api`, and site, in `site` |
| `data\mysql` | Scry's own MySQL server, holding the `scry` database |
| `data\secrets.json` | That server's passwords, made on the first start |
| `data\mysql-client.cnf` | Its root password again, for the MySQL tools the shortcut runs |
| `data\api` | What the API keeps: its settings in `instance.json`, its keys, each workspace's DuckDB file and uploads, and its logs |
| `data\install.json` | Where the installer found .NET and MySQL |
| `data\certificate.pem`, `data\certificate.key` | The development certificate and its key, which the site and the API serve with |
| `data\logs\mysql.log` | The database server's log |

## Removing it

Close Scry, then delete the Scry folder and the desktop shortcut. ⚠ Deleting `data` deletes everything Scry holds,
its dashboards and sources included. The programs the installer added stay installed.
