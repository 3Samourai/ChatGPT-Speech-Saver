(() => {
  "use strict";
  const CHANNEL = "chatgpt-speech-saver-v1";
  const defaults = { enabled: true, autoDownload: true, includeBinary: true };
  const pending = new Map();

  function request(command, args = {}) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("Capture listener is unavailable. Refresh the ChatGPT tab."));
      }, 3000);
      pending.set(requestId, { resolve, reject, timer });
      window.postMessage({ channel: CHANNEL, direction: "to-page", requestId, command, ...args }, location.origin);
    });
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.channel !== CHANNEL || message.direction !== "from-page") return;
    const entry = pending.get(message.requestId);
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(message.requestId);
      if (message.error) entry.reject(new Error(message.error));
      else entry.resolve(message.data);
    }
    if (message.event === "status" && Array.isArray(message.data?.clips)) {
      chrome.runtime.sendMessage({ kind: "badge", count: Math.min(message.data.clips.length, 30) }).catch(() => {});
    }
  });

  const initialized = chrome.storage.local.get(defaults)
    .then((options) => request("configure", { options }));
  // Handle a removed/reloaded extension without unhandled rejections.
  initialized.catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const options = {};
    for (const key of Object.keys(defaults)) if (changes[key]) options[key] = changes[key].newValue ?? defaults[key];
    if (Object.keys(options).length) request("configure", { options }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.kind !== "speech-saver") return;
    if (!["status", "download", "clear"].includes(message.command)) return;
    initialized.then(() => request(message.command, { id: message.id }))
      .then((data) => respond({ ok: true, data }))
      .catch((error) => respond({ ok: false, error: error.message }));
    return true;
  });
})();
