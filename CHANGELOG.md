# Changelog

Changes in this fork, starting from upstream [sciamop/pinry-saver-firefox](https://github.com/sciamop/pinry-saver-firefox) at `08a704d` (1.0.1 on addons.mozilla.org).

## 1.1.0 — 2026-10-26

### Added

- **Optional tag window.** With **Add tags before saving** ticked in the settings popup, "Save to Pinry" opens a small window (`tags.html`, `tags.js`, `tags.css`) instead of saving straight away. It shows the image, the page it came from, and the description, with a tag box. The setting is off by default, so images save immediately as in 1.0.1, and it's stored as soon as it's toggled (`showTagWindow` in `storage.sync`).
  - Enter or comma adds a tag. Pasting `ink, landscape, japan` adds three.
  - Existing Pinry tags are suggested as you type. Tab completes the first suggestion, or ↑/↓ then Tab or Enter picks another. Matching ignores case, so typing "Ink" reuses an existing "ink" rather than creating a near-duplicate.
  - The tag list is fetched fresh for every window. Pinry caches it for 5 minutes (server-side and with `Cache-Control: max-age=300`), which hid newly created tags, so the request adds a unique query string and uses `cache: 'no-store'`.
  - The description (prefilled from the image's alt/title text and the site name) can be edited before saving. Ctrl+Enter saves from it.
  - Backspace on an empty box removes the last tag. Enter on an empty box (or Ctrl+Enter) saves. Esc or Cancel discards the save.
  - If a save fails, the window stays open with the error so you can retry.
  - The window is an extension page, so the website you saved from can't see or change it.
- **Shared API helpers** in `pinry-client.js`, used by the background script, the tag window, and the settings popup.

How the tag window works:

- The image metadata (alt and title) is read on the right-click, in `background.js`, because `activeTab` only grants page access for that click, not to the tag window opened afterwards.
- The tag window asks Firefox for server access when you click Save if it's missing. An immediate save can't ask (the request must come straight from a click, and the settings have to be read first), so it shows a notification pointing to the settings popup instead.
- The details are held in `storage.session` (memory only, never written to disk) under `pending:<id>` until the window saves or cancels. Closing the window with its X counts as cancelling, and anything left behind is pruned after an hour.
- Sites that block hotlinking won't show a preview image, but the save still works because Pinry downloads the image itself.

### Security

- **Script injection fixed.** Values placed into code that runs on the page (the image URL, toast messages) are now JSON literals. Upstream pasted the image URL inside `'…'`, so a URL containing a quote could run its own code with the extension's privileges.
- **Access to your Pinry server only.** Upstream asked for access to every `https://` site at install. The add-on now holds no site access until you save your settings, then asks Firefox for access to that one server (an optional permission). Changing servers gives up access to the old one. If access was declined, the tag window asks again when you save, and an immediate save shows a notification pointing to the settings.
  - Firefox match patterns can't include a port, so access covers every port on that host.
  - The permission prompt only appears in direct response to a click or key press, so `saveSettings` (popup) and `save` (tag window) request it before anything else that waits.
- **Less code on web pages.** The content script that ran on every page and was never used is removed, as is the unused `notifications` permission. `activeTab` covers the tab you right-click.
- **Token-only API calls.** Requests to Pinry use `credentials: 'omit'`, so they authenticate with the API key only and never with a logged-in browser session.

### Fixed

- **Source link.** The page an image was saved from is sent as the pin's `referer`, so Pinry links back to it. Pinry also uses it as the `Referer` header when it downloads the image, which some sites require.
- **Default board.** Pinry's pin API ignores a `board` field, so the setting did nothing. The new pin is now added with `PATCH /api/v2/boards/<id>/`.
- **Context menu after a restart.** The menu is created each time the background page starts. Upstream only created it on install, so it could be missing after Firefox restarted.
- **Right image's metadata.** The right-clicked element is found with `menus.getTargetElement`, falling back to matching by URL. Images in cross-origin frames can't be read under `activeTab`, so they're saved without alt or title text.
- **Toasts** appear in the tab you saved from rather than whichever tab is active.
- **Error messages.** A rejected API key (401/403) and a failed image download now get readable messages. Pinry answers a bare 500 when it can't download the image, for example when the site blocks downloads.
- Images with no web address (`data:` and `blob:` URLs) get a clear error, since Pinry has to download the image itself.

### Changed

- **Settings are checked** before saving: the URL must start with `https://` or `http://` and is stored as a bare origin (no trailing slash or path), and the board ID must be a number. The result is shown in the popup, with a warning when an `http://` server means the API key is sent unencrypted.
- **Add-on ID** `pinry-saver@gsolin.github.io`. Upstream's manifest had none, so Firefox gave each temporary load a random ID and its settings were lost on reload. It also lets this fork be installed alongside the upstream add-on.
- **Requires Firefox 115 or later**, for `storage.session` in a Manifest V2 add-on.
- **Tag window styles** (`tags.css`) keep their shared colours, corner sizes and transition in CSS custom properties on `:root`. The description box and tag box share one rule for their border and focus ring, and a single `[hidden]` rule hides any element.
- **Declares that it collects no data** (`data_collection_permissions: none`). Images and tags go only to the Pinry server you configure.
