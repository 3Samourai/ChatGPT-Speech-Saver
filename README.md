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