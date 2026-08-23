/* global messenger */

const STORAGE_KEY = "settings";
const defaults = {
  enabled: true,
  reminderTemplate: "",
  includeCc: true,
  includeBcc: false,
};

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");

function populateForm(settings) {
  form.enabled.checked = settings.enabled;
  form.includeCc.checked = settings.includeCc;
  form.includeBcc.checked = settings.includeBcc;
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
    reminderTemplate: form.reminderTemplate.value.trim(),
  };

  await messenger.storage.local.set({ [STORAGE_KEY]: settings });
  status.value = "Preferences saved.";
});

loadSettings().catch(error => {
  console.error(error);
  status.value = "Could not load preferences.";
});
