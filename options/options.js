/* global messenger */

const STORAGE_KEY = "settings";
const defaults = {
  reminderTemplate: "",
  includeCc: true,
  includeBcc: false,
  remindersEnabled: true,
  reminderHour: 9,
  recentReplyScanDays: 2,
  autoScanOnOpen: true,
};

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");

function populateForm(settings) {
  form.includeCc.checked = settings.includeCc;
  form.includeBcc.checked = settings.includeBcc;
  form.remindersEnabled.checked = settings.remindersEnabled;
  form.reminderHour.value = settings.reminderHour;
  form.recentReplyScanDays.value = settings.recentReplyScanDays;
  form.autoScanOnOpen.checked = settings.autoScanOnOpen;
  form.reminderTemplate.value = settings.reminderTemplate;
}

async function loadSettings() {
  const { [STORAGE_KEY]: stored } = await messenger.storage.local.get(STORAGE_KEY);
  populateForm({ ...defaults, ...stored });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const settings = {
    includeCc: form.includeCc.checked,
    includeBcc: form.includeBcc.checked,
    remindersEnabled: form.remindersEnabled.checked,
    reminderHour: Number(form.reminderHour.value),
    recentReplyScanDays: Number(form.recentReplyScanDays.value),
    autoScanOnOpen: form.autoScanOnOpen.checked,
    reminderTemplate: form.reminderTemplate.value.trim(),
  };

  try {
    await messenger.storage.local.set({ [STORAGE_KEY]: settings });
    status.value = "Preferences saved.";
  } catch (error) {
    console.error(error);
    status.value = "Could not save preferences. Please try again.";
  }
});

document.querySelector("#test-reminder").addEventListener("click", async () => {
  try {
    await messenger.runtime.sendMessage({ type: "test-reminder" });
    status.value = "Test notification sent.";
  } catch (error) {
    console.error(error);
    status.value = "Could not show the test notification.";
  }
});

loadSettings().catch(error => {
  console.error(error);
  status.value = "Could not load preferences.";
});
