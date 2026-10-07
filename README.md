# ChatGPT Speech Saver

Save ChatGPT's **Read aloud** audio from the first playback request. Start Read aloud, stop listening whenever you like, and let the extension finish downloading the speech in the background.

A lightweight Chrome extension built with Manifest V3 and plain JavaScript. No build step, dependencies, API keys, or backend service.

## Features

- **Capture on the first request:** saves the audio returned by ChatGPT's synthesis endpoint.
- **Stop playback and keep downloading:** capture continues until the server finishes sending the audio.
- **Cached playback support:** also captures audio created through `URL.createObjectURL`.
- **Automatic or manual downloads:** save immediately or choose a clip from the popup.
- **Duplicate detection:** SHA-256 comparison prevents identical captured audio from being listed twice.
- **Format detection:** recognizes AAC, MP3, WAV, OGG, WebM, M4A, and FLAC using MIME types, synthesis format parameters, or file headers.
- **Tab badge:** shows the number of retained clips in the current tab.

## Install

Requires desktop Chrome 111 or later.

1. Clone this repository or download and extract its ZIP.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Pin **ChatGPT Speech Saver** from Chrome's Extensions menu.
6. Refresh any ChatGPT tabs that were already open.

To update, replace the extension files or pull the latest changes, click **Reload** on its extension card, and refresh ChatGPT.

## Use

1. Open a conversation on [ChatGPT](https://chatgpt.com).
2. Click **Read aloud** on a response.
3. Keep the tab open while the extension receives the audio. You can stop playback immediately.
4. The file downloads when the complete response has arrived. Open the extension popup to download a captured clip again.

While capture is running, the popup displays **Fetching speech… playback can be stopped**. Download timing depends on how quickly the server generates and sends the audio, rather than on how long you listen.

Files use the name `chatgpt-audio-TIMESTAMP-ID.ext`. Unrecognized binary data is saved with a `.bin` extension. A **download requested** label confirms that the browser was asked to save the file; Chrome's Downloads panel shows completion.

### Settings

| Setting | Default | Behavior |
| --- | --- | --- |
| Capture audio | On | Captures synthesis responses and audio blobs. |
| Download automatically | On | Requests a download as soon as a complete clip is captured. |
| Include binary blobs | On | Also captures blobs declared as `application/octet-stream`. Direct synthesis capture works with this setting off. |

**Clear** removes retained clips and discards captures already in progress. Settings apply across ChatGPT tabs and persist across browser restarts.

## Privacy and permissions

The extension runs only on `https://chatgpt.com/*` and `https://chat.openai.com/*`.

- Its only API permission is **storage**, used to save the three boolean settings.
- Synthesis capture uses ChatGPT's existing authenticated request with its existing headers and cookie behavior. It sends one request per intercepted synthesis.
- It does not save authentication tokens, cookies, request headers, conversation IDs, or message IDs in extension storage.
- Captured audio stays in the tab's memory until downloaded. Refreshing or closing the tab removes retained clips; downloaded files stay on your device.
- There is no telemetry, remote script loading, or additional upload service.

The extension retains up to **30 clips** and **128 MB of audio** per tab. Oldest clips are removed when either limit is reached. Individual synthesis captures exceeding 128 MB are discarded.

## How it works

The page hook runs in the **MAIN** JavaScript world at `document_start` and intercepts same-origin GET requests to `/backend-api/synthesize`. It reads a cloned response immediately while preserving a separate response stream for ChatGPT's playback. Playback follows the original AbortSignal; the network request continues for the capture branch when playback is stopped.

The `URL.createObjectURL` hook handles cached audio blobs. Downloads use a fresh temporary object URL, so revoking ChatGPT's playback URL does not remove an already captured clip.

An isolated content script connects the page hook to the popup and synchronizes settings. The background service worker updates the tab's badge.

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension metadata, permissions, and script registration. |
| `capture.js` | Fetch and Blob hooks, format detection, retention, and downloads. |
| `bridge.js` | Page/popup communication and settings synchronization. |
| `background.js` | Captured-clip badge. |
| `popup.html`, `popup.css`, `popup.js` | Popup interface and controls. |

## Troubleshooting

**Nothing appears in the popup:** reload the extension, refresh ChatGPT, and start Read aloud again. The hooks must be installed before the request begins.

**Chrome blocks automatic downloads:** allow multiple downloads for ChatGPT, or turn off **Download automatically** and use the individual **Download** buttons.

**Capture shows an HTTP error:** retry Read aloud after the underlying ChatGPT request succeeds. Error responses are not saved as audio.

Direct capture handles Fetch requests made in the main page to the synthesis endpoint. Requests made exclusively in a worker, through XMLHttpRequest, or through a different endpoint need a separate hook.

## Development and validation

Edit the source files directly, reload the unpacked extension, and refresh the ChatGPT tab. With Node.js installed, check JavaScript syntax from the repository root:

```sh
for file in *.js; do
  node --check "$file" || exit 1
done
```

The capture implementation has been verified in Chromium with a local streaming audio fixture: complete downloads without playback consuming the stream, cancellation before headers and after the first chunk, one network request per synthesis, preserved playback data and response metadata, HTTP errors, replay deduplication, popup controls, and Blob capture.

Before sharing changes, check the files being committed. `.gitignore` excludes local browser profiles, recordings, credential files, network captures, and generated archives.

## References

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts)
- [Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)
- [Response cloning](https://developer.mozilla.org/en-US/docs/Web/API/Response/clone)
- [Request construction](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request)
