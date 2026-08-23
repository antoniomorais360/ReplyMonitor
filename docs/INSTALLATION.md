# Installing Reply Monitor

## Before you start

Reply Monitor requires Thunderbird 140 ESR or later. The current GitHub release
is an unsigned preview build. Thunderbird installations that require signed
add-ons may reject direct XPI installation.

## Recommended: temporary installation for testing

This is the supported workflow for the current preview. The extension stays
installed until Thunderbird is restarted.

1. Download the source code from the repository: **Code** > **Download ZIP**.
2. Extract the ZIP file to a local folder.
3. In Thunderbird, open the application menu and select **Tools** >
   **Developer Tools** > **Debug Add-ons**.
4. Open **This Thunderbird**.
5. Select **Load Temporary Add-on…**.
6. Choose `manifest.json` from the extracted Reply Monitor folder.

To update a temporary installation after downloading a newer version, return to
the Debug Add-ons page and choose **Reload**.

## XPI installation

1. Download `reply-monitor-<version>.xpi` from the [Releases page](https://github.com/antoniomorais360/ReplyMonitor/releases).
2. In Thunderbird, open the Add-ons Manager.
3. Use the gear menu and select **Install Add-on From File…**.
4. Select the downloaded XPI file.

If Thunderbird reports that the add-on is unsigned, use the temporary
installation workflow above. Do not disable Thunderbird security settings.

## First use

1. Open a sent message.
2. Select **Track reply**, then choose a due date.
3. Open the Reply Monitor toolbar button to view the dashboard.
4. Open **Preferences** to enable reminders, select the reminder hour, and use
   **Test notification** to verify system notifications.

## Troubleshooting

### The toolbar button is missing

Confirm that Reply Monitor is listed and enabled in the Add-ons Manager. For a
temporary installation, reload it from the Debug Add-ons page.

### A reply was not detected

Reply detection depends on standard `In-Reply-To` or `References` email
headers. A newly received message without either header is not treated as a
reply. Confirm that the original sent message was tracked after installation.

### Notifications do not appear

Use **Test notification** in Preferences. If no notification appears, allow
notifications for Thunderbird in your operating system settings.
