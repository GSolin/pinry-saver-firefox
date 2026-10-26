// Pinry Saver Firefox Addon - Tag window, opened for each Save to Pinry click

// Must match background.js
const PENDING_PREFIX = 'pending:';
const MAX_TAG_LENGTH = 100;
const MAX_SUGGESTIONS = 8;

class TagWindow {
  constructor() {
    this.pendingKey = PENDING_PREFIX + (new URLSearchParams(location.search).get('id') || '');
    this.pending = null;
    this.settings = null;
    this.tags = [];
    // Existing Pinry tags keyed by lower-case name
    this.existingTags = new Map();
    this.matches = [];
    this.activeIndex = -1;
    this.finished = false;

    this.input = document.getElementById('tagInput');
    this.descriptionInput = document.getElementById('description');
    this.suggestionList = document.getElementById('suggestions');
    this.saveButton = document.getElementById('save');
    this.cancelButton = document.getElementById('cancel');

    this.init();
  }

  async init() {
    this.bindEvents();
    this.input.focus();

    const stored = await browser.storage.session.get(this.pendingKey);
    this.pending = stored[this.pendingKey];
    if (!this.pending) {
      this.finished = true;
      this.saveButton.disabled = true;
      this.cancelButton.textContent = 'Close';
      this.updateStatus('This save has expired. Right-click the image and choose Save to Pinry again.', 'error');
      return;
    }

    this.showDetails();

    this.settings = await getPinrySettings();
    const names = await fetchExistingTags(this.settings);
    for (const name of names) {
      this.existingTags.set(name.toLowerCase(), name);
    }
    this.updateSuggestions();
  }

  showDetails() {
    const preview = document.getElementById('preview');
    const image = document.getElementById('previewImage');
    image.addEventListener('load', () => { preview.hidden = false; });
    image.addEventListener('error', () => { preview.hidden = true; });
    image.src = this.pending.imageUrl;

    const source = document.getElementById('source');
    if (this.pending.pageUrl) {
      source.textContent = new URL(this.pending.pageUrl).hostname;
      source.title = this.pending.pageUrl;
    } else {
      source.textContent = 'Unknown page (no source link will be saved)';
    }

    this.descriptionInput.value = this.pending.description;
  }

  bindEvents() {
    this.saveButton.addEventListener('click', () => this.save());
    this.cancelButton.addEventListener('click', () => this.cancel());

    // Clicking anywhere in the box puts the cursor in the input
    document.getElementById('tagBox').addEventListener('click', (event) => {
      if (event.target.id === 'tagBox' || event.target.id === 'tagList') {
        this.input.focus();
      }
    });

    this.descriptionInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.ctrlKey) {
        event.preventDefault();
        this.save();
      }
    });

    this.input.addEventListener('keydown', (event) => {
      const suggesting = !this.suggestionList.hidden;
      if (suggesting && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const count = this.matches.length;
        // Cycles through the suggestions and back to none (-1)
        this.activeIndex = ((this.activeIndex + 1 + step + count + 1) % (count + 1)) - 1;
        this.renderSuggestions();
      } else if (suggesting && event.key === 'Tab' && !event.shiftKey) {
        // Tab completes to the highlighted suggestion, or the first one
        event.preventDefault();
        this.chooseSuggestion(this.matches[Math.max(this.activeIndex, 0)]);
      } else if (suggesting && event.key === 'Escape') {
        // Close the suggestions without cancelling the save
        event.preventDefault();
        event.stopPropagation();
        this.hideSuggestions();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (suggesting && this.activeIndex >= 0 && !event.ctrlKey) {
          this.chooseSuggestion(this.matches[this.activeIndex]);
        } else if (this.input.value.trim() && !event.ctrlKey) {
          this.addTagFromInput();
        } else {
          this.save();
        }
      } else if (event.key === ',') {
        event.preventDefault();
        this.addTagFromInput();
      } else if (event.key === 'Backspace' && this.input.value === '' && this.tags.length > 0) {
        this.removeTag(this.tags.length - 1);
      }
    });

    // Pasted text like "ink, landscape, japan" becomes separate tags
    this.input.addEventListener('input', () => {
      if (this.input.value.includes(',')) {
        const parts = this.input.value.split(',');
        const last = parts.pop();
        parts.forEach((part) => this.addTag(part));
        this.input.value = last;
      }
      this.updateSuggestions();
    });

    this.input.addEventListener('blur', () => this.hideSuggestions());

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.cancel();
      }
    });

    // Closing the window with its X button counts as cancelling
    window.addEventListener('pagehide', () => {
      if (!this.finished) {
        browser.storage.session.remove(this.pendingKey);
      }
    });
  }

  // Returns false if the text isn't a usable tag
  addTag(raw) {
    const name = String(raw).trim().replace(/\s+/g, ' ');
    if (!name) {
      return true;
    }
    if (name.length > MAX_TAG_LENGTH) {
      this.updateStatus(`Tags can be at most ${MAX_TAG_LENGTH} characters`, 'error');
      return false;
    }

    const canonical = this.existingTags.get(name.toLowerCase()) || name;
    if (!this.tags.some((tag) => tag.toLowerCase() === canonical.toLowerCase())) {
      this.tags.push(canonical);
      this.renderTags();
    }
    this.updateStatus('');
    return true;
  }

  addTagFromInput() {
    if (this.addTag(this.input.value)) {
      this.input.value = '';
      this.updateSuggestions();
      return true;
    }
    return false;
  }

  chooseSuggestion(name) {
    this.addTag(name);
    this.input.value = '';
    this.updateSuggestions();
    this.input.focus();
  }

  removeTag(index) {
    this.tags.splice(index, 1);
    this.renderTags();
    this.input.focus();
  }

  // Existing tags containing the typed text, ones starting with it first
  updateSuggestions() {
    const query = this.input.value.trim().toLowerCase();
    const chosen = new Set(this.tags.map((tag) => tag.toLowerCase()));
    this.matches = query === '' ? [] : [...this.existingTags.values()]
      .filter((name) => name.toLowerCase().includes(query) && !chosen.has(name.toLowerCase()))
      .sort((a, b) =>
        (b.toLowerCase().startsWith(query) - a.toLowerCase().startsWith(query)) || a.localeCompare(b)
      )
      .slice(0, MAX_SUGGESTIONS);
    this.activeIndex = -1;
    this.renderSuggestions();
  }

  hideSuggestions() {
    this.matches = [];
    this.activeIndex = -1;
    this.renderSuggestions();
  }

  renderSuggestions() {
    this.suggestionList.replaceChildren();
    this.matches.forEach((name, index) => {
      const item = document.createElement('li');
      item.id = `suggestion-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === this.activeIndex));
      item.textContent = name;
      // mousedown, not click, so the input keeps focus
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.chooseSuggestion(name);
      });
      this.suggestionList.appendChild(item);
    });

    const open = this.matches.length > 0;
    this.suggestionList.hidden = !open;
    this.input.setAttribute('aria-expanded', String(open));
    if (open && this.activeIndex >= 0) {
      this.input.setAttribute('aria-activedescendant', `suggestion-${this.activeIndex}`);
      document.getElementById(`suggestion-${this.activeIndex}`).scrollIntoView({ block: 'nearest' });
    } else {
      this.input.removeAttribute('aria-activedescendant');
    }
  }

  renderTags() {
    const list = document.getElementById('tagList');
    list.replaceChildren();
    this.tags.forEach((tag, index) => {
      const item = document.createElement('li');
      item.className = 'tag';

      const label = document.createElement('span');
      label.textContent = tag;
      item.appendChild(label);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tag-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove tag ${tag}`);
      remove.addEventListener('click', () => this.removeTag(index));
      item.appendChild(remove);

      list.appendChild(item);
    });
  }

  async save() {
    if (this.finished || this.saveButton.disabled || !this.settings) {
      return;
    }
    // Text still in the box counts as a tag
    if (this.input.value.trim() && !this.addTagFromInput()) {
      return;
    }

    // Asks for access to the server if it hasn't been granted yet; must run before any await
    const access = browser.permissions.request({ origins: [pinryHostPattern(this.settings.pinryUrl)] });

    this.setBusy(true);
    if (!(await access.catch(() => false))) {
      this.setBusy(false);
      this.updateStatus(`Pinry Saver needs access to ${new URL(this.settings.pinryUrl).host} to save. Allow it when Firefox asks.`, 'error');
      return;
    }
    this.updateStatus('Saving… Pinry is downloading the image.', '');

    const pinData = buildPinData(this.pending.imageUrl, this.descriptionInput.value.trim(), this.pending.pageUrl, this.tags);

    const result = await shareToPinry(this.settings, pinData);
    if (!result.success) {
      this.setBusy(false);
      this.updateStatus(describeSaveError(result), 'error');
      return;
    }

    // The pin exists now, so saving again would make a duplicate
    this.finished = true;
    await browser.storage.session.remove(this.pendingKey);

    if (this.settings.defaultBoardId) {
      const boardResult = await addPinToBoard(this.settings, this.settings.defaultBoardId, result.data.id);
      if (!boardResult.success) {
        this.cancelButton.disabled = false;
        this.cancelButton.textContent = 'Close';
        this.updateStatus(`Saved to Pinry, but couldn't add it to board ${this.settings.defaultBoardId}.`, 'error');
        return;
      }
    }

    this.updateStatus('Saved to Pinry!', 'success');
    setTimeout(() => this.closeWindow(), 900);
  }

  async cancel() {
    if (!this.finished) {
      this.finished = true;
      await browser.storage.session.remove(this.pendingKey);
    }
    this.closeWindow();
  }

  async closeWindow() {
    try {
      const current = await browser.windows.getCurrent();
      await browser.windows.remove(current.id);
    } catch (e) {
      window.close();
    }
  }

  setBusy(busy) {
    this.saveButton.disabled = busy;
    this.cancelButton.disabled = busy;
    this.input.disabled = busy;
    this.descriptionInput.disabled = busy;
  }

  updateStatus(message, type = '') {
    if (message) {
      console.log(`${type.toUpperCase()}: ${message}`);
    }
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new TagWindow();
});
