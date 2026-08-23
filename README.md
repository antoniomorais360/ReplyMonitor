# Reply Monitor

A Thunderbird extension for tracking sent messages and expected replies.

## Project status

The historic implementation, which supports Thunderbird 52–54 only, is preserved
in `replymonitor@lin.han/`. The modern implementation is developed on the
`modernize/stage-1` branch.

## Stage 1 — MailExtension foundation

This stage provides:

- a Manifest V3 `manifest.json`, compatible with Thunderbird 140 ESR and later;
- the historic extension ID: `replymanager@lin.han`;
- an HTML, CSS, and JavaScript preferences page;
- local settings persistence;
- a toolbar action that opens the preferences page.

## Stage 2 — Track and untrack messages

This stage adds:

- a message-list context menu to track selected messages with a seven-day due date;
- a message-display toolbar popup to choose a due date;
- local persistence for tracking records, including the RFC `Message-ID` header when available;
- an action to stop tracking a selected message.

Reply detection, reminder sending, and the tracking dashboard are intentionally
out of scope until later stages.

## Build a test package

From the repository root in PowerShell:

```powershell
.\scripts\package.ps1
```

The `.xpi` file is written to `dist/`. To test without signing, open
`about:debugging#/runtime/this-thunderbird` in Thunderbird and temporarily load
the `manifest.json` file.
