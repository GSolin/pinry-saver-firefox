// Pinry Saver Firefox Addon - Popup Script

class PinryShare {
  constructor() {
    this.init();
  }

  async init() {
    console.log('Initializing PinrySaver...');
    await this.loadSettings();
    this.bindEvents();
    console.log('PinrySaver initialized - Ready for right-click image sharing');
  }

  async loadSettings() {
    const result = await browser.storage.sync.get(['pinryUrl', 'apiKey', 'defaultBoardId', 'showTagWindow']);
    this.pinryUrl = result.pinryUrl || '';
    this.apiKey = result.apiKey || '';
    this.defaultBoardId = result.defaultBoardId || '';

    // Update settings form
    document.getElementById('pinryUrl').value = this.pinryUrl;
    document.getElementById('apiKey').value = this.apiKey;
    document.getElementById('defaultBoardId').value = this.defaultBoardId;
    document.getElementById('showTagWindow').checked = !!result.showTagWindow;
  }

  bindEvents() {
    // Save settings button
    document.getElementById('saveSettings').addEventListener('click', () => {
      this.saveSettings();
    });

    // Saved as soon as it's toggled, separately from the other settings
    document.getElementById('showTagWindow').addEventListener('change', (event) => {
      this.saveTagWindowSetting(event.target.checked);
    });
  }

  // Returns the server's origin (https://host[:port]), or an error message
  checkPinryUrl(value) {
    let url;
    try {
      url = new URL(value);
    } catch (e) {
      return { error: 'Pinry URL is not a valid address' };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { error: 'Pinry URL must start with https:// or http://' };
    }
    return { origin: url.origin };
  }

  // Not async: Firefox only shows the permission prompt straight from a click
  saveSettings() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const defaultBoardId = document.getElementById('defaultBoardId').value.trim();

    if (!document.getElementById('pinryUrl').value.trim() || !apiKey) {
      this.updateStatus('Pinry URL and API key are required', 'error');
      return;
    }

    const checked = this.checkPinryUrl(document.getElementById('pinryUrl').value.trim());
    if (checked.error) {
      this.updateStatus(checked.error, 'error');
      return;
    }

    if (defaultBoardId && !/^[1-9][0-9]*$/.test(defaultBoardId)) {
      this.updateStatus('Default Board ID must be a number', 'error');
      return;
    }

    const access = browser.permissions.request({ origins: [pinryHostPattern(checked.origin)] });
    this.storeSettings(checked.origin, apiKey, defaultBoardId, access);
  }

  async storeSettings(pinryUrl, apiKey, defaultBoardId, access) {
    document.getElementById('pinryUrl').value = pinryUrl;
    const previousUrl = this.pinryUrl;

    try {
      await browser.storage.sync.set({
        pinryUrl: pinryUrl,
        apiKey: apiKey,
        defaultBoardId: defaultBoardId
      });

      this.pinryUrl = pinryUrl;
      this.apiKey = apiKey;
      this.defaultBoardId = defaultBoardId;
    } catch (error) {
      console.error('Error saving settings:', error);
      this.updateStatus('Error saving settings', 'error');
      return;
    }

    const granted = await access.catch(() => false);
    if (!granted) {
      this.updateStatus(`Settings saved, but Pinry Saver can't reach ${pinryUrl} until you allow access`, 'error');
      return;
    }

    // Give up access to a server that's no longer used
    if (previousUrl && pinryHostPattern(previousUrl) !== pinryHostPattern(pinryUrl)) {
      browser.permissions.remove({ origins: [pinryHostPattern(previousUrl)] }).catch(() => {});
    }

    if (pinryUrl.startsWith('http:')) {
      this.updateStatus('Settings saved. This server uses http://, so the API key is sent unencrypted.', 'success');
    } else {
      this.updateStatus('Settings saved!', 'success');
    }
  }

  async saveTagWindowSetting(enabled) {
    try {
      await browser.storage.sync.set({ showTagWindow: enabled });
    } catch (error) {
      console.error('Error saving settings:', error);
      this.updateStatus('Error saving settings', 'error');
    }
  }

  updateStatus(message, type = '') {
    console.log(`${type.toUpperCase()}: ${message}`);
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PinryShare();
});
