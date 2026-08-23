# Release notes

## v1.4.0 — 2026-08-23

- Add **Compose follow-up** to awaiting-reply dashboard items.
- Open a plain-text draft with the tracked recipients and configurable default
  follow-up text.
- Respect the existing CC and BCC recipient preferences for those drafts.
- Add the minimum `compose` permission required to open and prefill drafts.
- No email is sent by the extension; users must review and send a draft from
  Thunderbird themselves.

## v1.3.0 — 2026-08-23

First public preview release.

- Track and untrack sent messages with due dates.
- Dashboard for tracked, overdue, and due-today messages.
- Automatic reply detection using `In-Reply-To` and `References` headers.
- Configurable daily local reminders for overdue replies.
- Local-only storage and no automatic email sending.

### Known limitations

- This preview XPI is unsigned; use temporary installation when Thunderbird
  requires signed add-ons.
- Reply detection requires standard reply headers.
- Native calendar integration is not included.
