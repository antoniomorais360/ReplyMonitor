# Reply Monitor

Reply Monitor is a Thunderbird MailExtension that helps you keep track of sent
messages that need a reply.

> **Preview release:** Reply Monitor is currently distributed as an unsigned
> development build. Use the temporary-install workflow for reliable testing.
> Permanent installation from an `.xpi` may require a Mozilla-signed package,
> depending on your Thunderbird configuration.

## Features

- Track one or more sent messages with a due date.
- See tracked messages in a dashboard with overdue and due-today counts.
- Update a due date or stop tracking a message.
- Detect incoming replies through standard email reply headers.
- Receive a daily local notification for overdue replies.
- Open a prefilled follow-up draft from an awaiting-reply dashboard item; Reply
  Monitor never sends the message automatically.
- Keep all tracking data in Thunderbird local storage; no message data is sent
  to a third-party service.

## Compatibility

- Thunderbird 140 ESR or later.
- Desktop Thunderbird on Windows, macOS, or Linux.

## Get Reply Monitor

Download the latest `.xpi` from the [GitHub Releases page](https://github.com/antoniomorais360/ReplyMonitor/releases).

For installation instructions, testing steps, and troubleshooting, see the
[Installation guide](docs/INSTALLATION.md).

## Quick start

1. Open a sent message in Thunderbird.
2. Click the **Track reply** button in the message toolbar, choose a due date,
   and save.
3. Open the Reply Monitor toolbar button to see the dashboard.
4. When the recipient replies, the item is marked **Reply received**.
5. Use **Compose follow-up** to open a draft, then review and send it yourself.
6. Open **Preferences** from the dashboard to configure daily reminders and
   the default follow-up text.

## Privacy

Reply Monitor stores tracking records only in Thunderbird's local extension
storage. It does not send email contents, recipients, or tracking data to any
external service.

## License

Reply Monitor is licensed under the [Mozilla Public License 2.0](LICENSE).

## For contributors

```powershell
node .\tests\background.test.cjs
.\scripts\package.ps1
```

The generated XPI is written to `dist/`.

## Status

The MVP stages are complete: foundation, tracking, dashboard, reply detection,
local reminders, and release checks. See [release notes](docs/RELEASES.md) for
version details.
