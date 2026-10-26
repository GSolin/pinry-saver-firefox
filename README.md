# Pinry Saver - Firefox Addon

A Firefox browser extension for saving images from any web page to your [Pinry](https://github.com/pinry/pinry) instance, with tags and a link back to the page they came from.

This is a fork of [sciamop/pinry-saver-firefox](https://github.com/sciamop/pinry-saver-firefox) (1.0.1 on addons.mozilla.org). It's purpose is to fix a number of security issues and bugs; as well as adding additional features. See [CHANGELOG.md](CHANGELOG.md) for the full list.

## Features

- **Right-Click Image Saving**: Right-click any image and choose "Save to Pinry"
- **Tag Window** (optional): Add tags before saving, with suggestions from the tags already in your Pinry
- **Source Links**: Each pin links back to the page the image was found on
- **Default Board**: Optionally add every new pin to a board
- **Minimal Permissions**: Access to your Pinry server only, requested when you set it up
- **Toast Notifications**: HTML overlay notifications on the page you saved from

## Requirements

- Firefox 115 or later
- A Pinry 2.x server with API v2 (the default)
- A Pinry API token: log in to Pinry, open your profile, and copy the token

## Installation

1. Download or clone this repository
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on…"
4. Select the `manifest.json` file from this directory

A temporary add-on stays until Firefox restarts. Your settings are kept between loads.

## Setup

1. Click the Pinry Saver icon in your toolbar
2. Enter your settings:
   - **Pinry Server URL**: Your Pinry instance, e.g. `https://pinry.example.com`
   - **API Key**: Your Pinry API token
   - **Default Board ID** (optional): The number at the end of a board's address
3. Click "Save Settings", then allow access to your Pinry server when Firefox asks
4. Optionally tick **Add tags before saving** to open the tag window on each save. It's saved as soon as you tick it

`http://` servers work too, but the API key is then sent unencrypted. Use `https://` for anything outside your home network.

## Usage

1. Right-click an image on a web page
2. Select "Save to Pinry"

With **Add tags before saving** off (the default), the image is saved straight away and a notification on the page confirms it.

With it on, a tag window opens first:
- **Enter** or **comma** adds a tag; **Tab** completes an existing one (**↑/↓** to choose which)
- **Backspace** on an empty box removes the last tag
- **Enter** on an empty box (or **Ctrl+Enter**, or click Save) saves. **Esc** cancels

Pinry downloads the image itself, so images that only exist inside the page (`data:` or `blob:` addresses) can't be saved. Some sites block downloads; if a save fails, try opening the image on its own first.

## Development

The addon is built with:
- Manifest V2 (Firefox WebExtensions API)
- Vanilla JavaScript (no external dependencies)

Check it with [web-ext](https://github.com/mozilla/web-ext): `npx web-ext lint`, or `npx web-ext run` to start a Firefox with the add-on loaded.

### File Structure
```
├── manifest.json      # Addon configuration
├── background.js      # Context menu, image metadata, opens the tag window
├── pinry-client.js    # Pinry API helpers shared by the scripts
├── tags.html          # Tag window shown when saving
├── tags.css
├── tags.js
├── popup.html         # Settings popup
├── popup.css
├── popup.js
├── pinry-api.js       # Pinry API reference (not loaded by the addon)
├── icons/
├── CHANGELOG.md
└── README.md
```

## License

MIT License - feel free to modify and distribute.

---

**GitHub Repository**: [https://github.com/GSolin/pinry-saver-firefox](https://github.com/GSolin/pinry-saver-firefox)
**Original project**: [https://github.com/sciamop/pinry-saver-firefox](https://github.com/sciamop/pinry-saver-firefox) by sciamop
