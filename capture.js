(() => {
  "use strict";
  const CHANNEL = "chatgpt-speech-saver-v1";
  const originalCreate = URL.createObjectURL.bind(URL);
  const originalRevoke = URL.revokeObjectURL.bind(URL);
  const originalFetch = window.fetch.bind(window);
  const clips = new Map();
  const seen = new WeakSet();
  const MAX_BYTES = 128 * 1024 * 1024;
  let totalBytes = 0;
  let options = { enabled: true, autoDownload: false, includeBinary: true };
  let configured = false;
  let lastError = "";
  let generation = 0;
  let pendingSynthesis = 0;

  const post = (payload) => window.postMessage({ channel: CHANNEL, direction: "from-page", ...payload }, location.origin);
  const status = () => ({
    ready: configured,
    options,
    clips: [...clips.values()].map(({ blob, digest, ...clip }) => clip).reverse(),
    totalBytes,
    pendingSynthesis,
    lastError
  });
  const notify = () => post({ event: "status", data: status() });

  async function extensionFor(blob) {
    const type = blob.type.toLowerCase().split(";")[0].trim();
    const types = {
      "audio/aac": "aac", "audio/aacp": "aac", "audio/mpeg": "mp3",
      "audio/mp3": "mp3", "audio/wav": "wav", "audio/wave": "wav",
      "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/webm": "webm",
      "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/flac": "flac",
      "audio/x-flac": "flac"
    };
    if (types[type]) return types[type];
    const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const starts = (text, offset = 0) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
    if (starts("RIFF") && starts("WAVE", 8)) return "wav";
    if (starts("OggS")) return "ogg";
    if (starts("fLaC")) return "flac";
    if (starts("ID3") || (bytes[0] === 255 && (bytes[1] & 224) === 224 && (bytes[1] & 6) !== 0)) return "mp3";
    if (bytes[0] === 255 && (bytes[1] & 246) === 240) return "aac";
    if (starts("ftyp", 4)) return "m4a";
    if ([26, 69, 223, 163].every((b, i) => bytes[i] === b)) return "webm";
    return "bin";
  }

  function download(id) {
    const clip = clips.get(id);
    if (!clip) throw new Error("This clip is no longer available. Click Read aloud again.");
    if (!document.body) throw new Error("The page is still loading. Try again in a moment.");
    // A fresh URL keeps downloads independent of ChatGPT's URL revocation.
    const url = originalCreate(clip.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = clip.filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    try {
      anchor.click();
      clip.downloadRequests += 1;
    } finally {
      anchor.remove();
      setTimeout(() => originalRevoke(url), 60_000);
    }
    lastError = "";
    notify();
  }

  function requestAutoDownload(clip) {
    const run = () => {
      if (!clips.has(clip.id) || !options.enabled || !options.autoDownload) return;
      try { download(clip.id); } catch (error) { lastError = error.message; notify(); }
    };
    if (document.body) run();
    else document.addEventListener("DOMContentLoaded", run, { once: true });
  }

  async function capture(blob, source = "blob", ticket = generation) {
    if (!options.enabled || !(blob instanceof Blob) || !blob.size || seen.has(blob)) return;
    const type = blob.type.toLowerCase().split(";")[0].trim();
    if (!type.startsWith("audio/") && !(options.includeBinary && type === "application/octet-stream") && source !== "synthesis") return;
    seen.add(blob);
    if (blob.size > MAX_BYTES) {
      lastError = "This blob exceeds the 128 MB capture limit.";
      notify();
      return;
    }
    const capturedAt = Date.now();
    const extension = await extensionFor(blob);
    const digestBytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const digest = Array.from(new Uint8Array(digestBytes), byte => byte.toString(16).padStart(2, "0")).join("");
    if (ticket !== generation || !options.enabled || (source !== "synthesis" && !options.includeBinary && type === "application/octet-stream")) return;
    // The replay Blob is often a different object containing the same audio.
    if ([...clips.values()].some(clip => clip.digest === digest)) return;
    while (clips.size >= 30 || totalBytes + blob.size > MAX_BYTES) {
      const oldest = clips.keys().next().value;
      totalBytes -= clips.get(oldest).size;
      clips.delete(oldest);
    }
    const id = crypto.randomUUID();
    const clip = { id, blob, digest, source, type: blob.type, size: blob.size, capturedAt,
      extension, filename: `chatgpt-audio-${capturedAt}-${id.slice(0, 6)}.${extension}`, downloadRequests: 0 };
    clips.set(id, clip);
    totalBytes += blob.size;
    lastError = "";
    notify();
    if (configured && options.autoDownload) requestAutoDownload(clip);
  }

  URL.createObjectURL = function (blob) {
    const url = originalCreate(blob);
    // Never let a capture error alter ChatGPT's playback behavior.
    void capture(blob).catch((error) => { lastError = `Capture failed: ${error.message}`; notify(); });
    return url;
  };

  function synthesisURL(input) {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    return url.origin === location.origin && url.pathname === "/backend-api/synthesize" ? url : null;
  }

  async function consumeSynthesis(response, url, ticket) {
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        if (!options.enabled || ticket !== generation) return;
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BYTES) throw new Error("This synthesis exceeds the 128 MB capture limit.");
        chunks.push(chunk.value);
      }
      const mime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const formats = { aac: "audio/aac", mp3: "audio/mpeg", wav: "audio/wav", opus: "audio/ogg", ogg: "audio/ogg", flac: "audio/flac", webm: "audio/webm", mp4: "audio/mp4", m4a: "audio/mp4" };
      const type = mime.startsWith("audio/") ? mime : formats[url.searchParams.get("format")] || "application/octet-stream";
      await capture(new Blob(chunks, { type }), "synthesis", ticket);
    } finally {
      // Cancel only the capture branch; ChatGPT can still read its branch.
      void reader.cancel().catch(() => {});
    }
  }

  function preserveMetadata(copy, original) {
    for (const key of ["url", "redirected", "type"]) {
      Object.defineProperty(copy, key, { value: original[key], configurable: true });
    }
    Object.defineProperty(copy, "clone", { value() {
      return preserveMetadata(Response.prototype.clone.call(this), original);
    } });
    return copy;
  }

  function playbackResponse(response, signal) {
    const reader = response.body.getReader();
    let finished = false;
    let abort;
    const cleanup = () => { finished = true; signal.removeEventListener("abort", abort); };
    const body = new ReadableStream({
      start(controller) {
        abort = () => {
          if (finished) return;
          cleanup();
          controller.error(signal.reason || new DOMException("Playback aborted", "AbortError"));
          void reader.cancel().catch(() => {});
        };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      },
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (finished) return;
          if (done) { cleanup(); controller.close(); }
          else controller.enqueue(value);
        } catch (error) {
          if (!finished) { cleanup(); controller.error(error); }
        }
      },
      cancel(reason) { cleanup(); return reader.cancel(reason); }
    });
    return preserveMetadata(new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }), response);
  }

  window.fetch = function (input, init) {
    let url;
    let request;
    try {
      url = synthesisURL(input);
      if (!url || !options.enabled) return originalFetch(input, init);
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method !== "GET") return originalFetch(input, init);
      request = new Request(input, init);
      if (request.method !== "GET" || request.signal.aborted) return originalFetch(input, init);
    } catch { return originalFetch(input, init); }
    const ticket = generation;
    pendingSynthesis += 1;
    notify();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      pendingSynthesis -= 1;
      notify();
    };
    // One network request, with the same headers/cookies. Its lifetime is
    // independent of playback's AbortSignal so stopping audio still saves it.
    const independent = new Request(request, { signal: new AbortController().signal });
    return new Promise((resolve, reject) => {
      const aborted = () => reject(request.signal.reason || new DOMException("Playback aborted", "AbortError"));
      request.signal.addEventListener("abort", aborted, { once: true });
      originalFetch(independent).then(response => {
        request.signal.removeEventListener("abort", aborted);
        const mime = (response.headers.get("content-type") || "").toLowerCase();
        const audioResponse = response.ok && response.body && (!mime || mime.startsWith("audio/") || mime.startsWith("application/octet-stream"));
        if (audioResponse) {
          const copy = response.clone();
          void consumeSynthesis(copy, url, ticket).catch(error => {
            if (ticket === generation && options.enabled) { lastError = `Speech capture failed: ${error.message}`; notify(); }
          }).finally(finish);
          if (request.signal.aborted) {
            void response.body.cancel().catch(() => {});
            aborted();
          } else resolve(playbackResponse(response, request.signal));
        } else {
          if (!response.ok && ticket === generation && options.enabled) lastError = `Speech request returned HTTP ${response.status}. Try Read aloud again.`;
          finish();
          if (request.signal.aborted) { void response.body?.cancel().catch(() => {}); aborted(); }
          else resolve(response.body ? playbackResponse(response, request.signal) : response);
        }
      }).catch(error => {
        request.signal.removeEventListener("abort", aborted);
        if (ticket === generation && options.enabled) lastError = "Speech request failed. Try Read aloud again.";
        finish();
        reject(error);
      });
    });
  };

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.channel !== CHANNEL || message.direction !== "to-page") return;
    if (typeof message.requestId !== "string") return;
    try {
      switch (message.command) {
        case "configure": {
          const first = !configured;
          const wasEnabled = options.enabled;
          const settings = message.options || {};
          for (const key of ["enabled", "autoDownload", "includeBinary"]) {
            if (typeof settings[key] === "boolean") options[key] = settings[key];
          }
          if (wasEnabled && !options.enabled) generation += 1;
          if (first) {
            // Apply saved filters to anything captured before storage loaded.
            for (const [id, clip] of clips) {
              if (!options.enabled || (clip.source !== "synthesis" && !options.includeBinary && clip.type.split(";")[0].trim().toLowerCase() === "application/octet-stream")) {
                totalBytes -= clip.size;
                clips.delete(id);
              }
            }
          }
          configured = true;
          if (first && options.enabled && options.autoDownload) {
            for (const clip of clips.values()) requestAutoDownload(clip);
          }
          break;
        }
        case "status": break;
        case "download": download(message.id); break;
        case "clear": clips.clear(); totalBytes = 0; generation += 1; lastError = ""; break;
        default: return;
      }
      post({ requestId: message.requestId, data: status() });
      notify();
    } catch (error) {
      post({ requestId: message.requestId, error: error.message });
    }
  });
})();
