/* global messenger */

const STORAGE_KEY = "settings";
const defaults = {
  enabled: true,
  reminderTemplate: "",
  includeCc: true,
  includeBcc: false,
  remindersEnabled: true,
  reminderHour: 9,
};

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");

function populateForm(settings) {
  form.enabled.checked = settings.enabled;
  form.includeCc.checked = settings.includeCc;
  form.includeBcc.checked = settings.includeBcc;
  form.remindersEnabled.checked = settings.remindersEnabled;
  form.reminderHour.value = settings.reminderHour;
  form.reminderTemplate.value = settings.reminderTemplate;
}

async function loadSettings() {
  const { [STORAGE_KEY]: stored } = await messenger.storage.local.get(STORAGE_KEY);
  populateForm({ ...defaults, ...stored });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const settings = {
    enabled: form.enabled.checked,
    includeCc: form.includeCc.checked,
    includeBcc: form.includeBcc.checked,
    remindersEnabled: form.remindersEnabled.checked,
    reminderHour: Number(form.reminderHour.value),
    reminderTemplate: form.reminderTemplate.value.trim(),
  };

  await messenger.storage.local.set({ [STORAGE_KEY]: settings });
  status.value = "Preferences saved.";
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
