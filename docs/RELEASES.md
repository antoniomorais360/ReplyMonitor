# Release notes

## v1.5.20 — 2026-10-06

- Recover original messages page by page, stopping at the first match.
- Show popup action progress, prevent duplicate submissions, and report failures.
- Test dashboard removal progress, duplicate clicks, storage failures, and stale refreshes.

## v1.5.19 — 2026-10-06

- Add an automatic-scan preference and a five-minute cooldown after completed scans.
- Update dashboard cards after background changes and discard stale refreshes.
- Report preference-save failures and clean up tracking state for closed compose tabs.
- Verify every packaged file against its source and stop packaging on errors.

## v1.5.18 — 2026-10-06

- Process reply scans in batches, yield between batches, and stop further reads
  when no pending tracking records remain. An in-flight Thunderbird call must
  still finish before scanning can stop.
- Skip unreadable messages and avoid unchanged storage writes.
- Show removal progress, prevent duplicate clicks, and update the removed card
  and counters without rebuilding the dashboard.
- Log scan counts and duration without message content.

## v1.5.17 — 2026-09-15

- Add a **Preferences** setting for the recent-reply scan window, from 1 to 15
  days, with a default of 2 days.

## v1.5.16 — 2026-09-15

- Reduce automatic and manual recent-reply scans from 7 days to 2 days to
  reduce dashboard startup work.

## v1.5.15 — 2026-08-28

- Show the ReplyMonitor toolbar button in the Tasks and Address Book spaces,
  in addition to Mail and Calendar.

## v1.5.14 — 2026-08-28

- Keep the ReplyMonitor toolbar button visible in both the Mail and Calendar
  spaces of Thunderbird.

## v1.5.13 — 2026-08-27

- Correct the Thunderbird Add-ons homepage URL to the public `replymonitor`
  listing.

## v1.5.12 — 2026-08-27

- Show Antonio Morais and Lin Han as the extension authors in Thunderbird.
- Add the Reply Monitor Thunderbird Add-ons page as the extension homepage.
- Expand the Add-ons Manager description with reply detection, due dates,
  follow-ups, local-only operation, and the no-data-collection commitment.

## v1.5.11 — 2026-08-27

- Reduce the maximum recent-reply scan window from 30 days to 7 days for faster
  automatic and manual checks.
- Avoid Thunderbird's `fromMe` query filter, which can fail when an account has
  no identities, and exclude sent messages using the identities API instead.

## v1.5.10 — 2026-08-27

- Make recent-reply scans query only the subjects and time ranges of messages
  that are still awaiting a reply, instead of reading every message received in
  the last 30 days.
- Check for missed replies automatically when Thunderbird starts and when the
  Reply Monitor dashboard opens.

## v1.5.9 — 2026-08-27

- Add a **Track reply** action to the message compose window, with a due-date
  picker and an option to cancel tracking before sending.
- Create the tracking record only after Thunderbird confirms the message was
  sent.
- Use a dedicated Reply Monitor tracking icon for message and compose actions.

## v1.5.8 — 2026-08-27

- Start follow-ups with Thunderbird's reply composer instead of creating an
  unrelated new message, preserving the original thread and quoted content.
- Resolve the original message's current local identifier before composing a
  follow-up.

## v1.5.7 — 2026-08-27

- Pass RFC `Message-ID` values to Thunderbird without the surrounding angle
  brackets required in the raw email header.
- Continue to metadata recovery if Thunderbird rejects a header lookup, and
  show the underlying error in the dashboard when all recovery methods fail.

## v1.5.6 — 2026-08-27

- Recover older original messages by exact subject and sent-recipient matching
  when both local and `Message-ID` references are unavailable.

## v1.5.5 — 2026-08-27

- Search all locally indexed mail folders by `Message-ID` when the saved local
  identifier can no longer open the original message or received reply.

## v1.5.4 — 2026-08-27

- Add dashboard actions to open the original tracked message and its received
  reply.
- Preserve the received reply's `Message-ID` as a fallback when a local message
  identifier is no longer valid.

## v1.5.3 — 2026-08-24

- Declare that Reply Monitor does not collect or transmit data, as required by
  the add-on validator.

## v1.5.2 — 2026-08-24

- Rename the toolbar action to **ReplyMonitor** and display the extension icon.
- Add a dedicated **Replies received** dashboard section.
- Highlight reply-received cards and their dashboard section for quicker review.

## v1.5.1 — 2026-08-23

- Prevent concurrent tracking operations from overwriting each other.
- Add stable Reply Monitor record identifiers and migrate existing local data.
- Complete the local-date fix in the message toolbar popup.
- Prevent messages without a `Message-ID` header from colliding.
- Respect plain-text and HTML identity signatures in follow-up drafts.
- Continue reply correlation after a follow-up draft is sent by recording its
  outgoing `Message-ID`; Reply Monitor still never sends automatically.
- Prevent duplicate recent-reply scans from running at the same time.
- Derive the XPI name from the manifest version and include the MPL-2.0 license.
- Add CI for syntax checks, tests, and XPI packaging.

## v1.5.0 — 2026-08-23

- Open the dashboard when an overdue-reply notification is clicked.
- Calculate due dates in local time, avoiding a date shift near midnight.
- Add **Scan recent replies**, an on-demand local scan of received messages
  from the last 30 days for replies received while the extension was inactive.

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
