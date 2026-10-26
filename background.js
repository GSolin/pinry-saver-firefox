// Pinry Saver Firefox Addon - Background Script

// Saves waiting in a tag window, kept in session storage until saved or cancelled
const PENDING_PREFIX = 'pending:';
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;

const TAG_WINDOW_WIDTH = 440;
const TAG_WINDOW_HEIGHT = 640;

// Function to show HTML toast overlay
async function showToast(tabId, message, type = 'info') {
  if (tabId === undefined || tabId < 0) {
    console.log(`${type.toUpperCase()}: ${message}`);
    return;
  }

  try {
    await browser.tabs.executeScript(tabId, {
      code: `
        (() => {
          const message = ${JSON.stringify(String(message))};
          const type = ${JSON.stringify(String(type))};

          // Remove any existing toast
          const existingToast = document.getElementById('pinry-toast');
          if (existingToast) {
            existingToast.remove();
          }
          if (!document.body) {
            return;
          }

          // Create toast element
          const toast = document.createElement('div');
          toast.id = 'pinry-toast';

          // Set background color based on type
          const bgColor = type === 'success' ? '#4CAF50' : '#f44336';

          toast.style.cssText = \`
            position: fixed;
            top: 20px;
            right: 20px;
            background: \${bgColor};
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            max-width: 300px;
            word-wrap: break-word;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
          \`;
          toast.textContent = message;

          // Add to page
          document.body.appendChild(toast);

          // Animate in
          setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
          }, 10);

          // Auto remove after 3 seconds
          setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
              if (toast.parentNode) {
                toast.remove();
              }
            }, 300);
          }, 3000);
        })();
      `
    });
  } catch (error) {
    console.error('Error showing toast:', error);
  }
}

// Handle addon installation
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Pinry Saver addon installed');
    // Set default settings if needed
    browser.storage.sync.get(['pinryUrl', 'apiKey']).then((result) => {
      if (!result.pinryUrl) {
        browser.storage.sync.set({
          pinryUrl: '',
          apiKey: ''
        });
      }
    });
  }
});

// Reads the alt and title of the right-clicked image from the page
async function getImageMetadata(info, tab) {
  if (!tab || tab.id === undefined || tab.id < 0) {
    return null;
  }

  try {
    const results = await browser.tabs.executeScript(tab.id, {
      frameId: info.frameId || 0,
      code: `
        (() => {
          try {
            const targetElementId = ${JSON.stringify(info.targetElementId ?? null)};
            const srcUrl = ${JSON.stringify(info.srcUrl)};
            let targetImage = null;

            const menusApi = typeof browser !== 'undefined' && (browser.menus || browser.contextMenus);
            if (targetElementId !== null && menusApi && menusApi.getTargetElement) {
              const element = menusApi.getTargetElement(targetElementId);
              if (element && element.tagName === 'IMG') {
                targetImage = element;
              }
            }

            if (!targetImage) {
              for (const img of document.querySelectorAll('img')) {
                if (img.src === srcUrl || img.currentSrc === srcUrl) {
                  targetImage = img;
                  break;
                }
              }
            }

            return JSON.stringify({
              alt: targetImage ? (targetImage.getAttribute('alt') || '') : '',
              title: targetImage ? (targetImage.getAttribute('title') || '') : '',
              found: !!targetImage
            });
          } catch (e) {
            return JSON.stringify({ alt: '', title: '', found: false, error: e.message });
          }
        })();
      `
    });
    return results && results[0] ? JSON.parse(results[0]) : null;
  } catch (scriptError) {
    console.log('Could not execute script to extract image metadata:', scriptError);
    return null;
  }
}

async function extractEnhancedDescription(info, tab, pageUrl) {
  const parts = [];

  try {
    // Try to extract domain from page URL (robust handling)
    let domain = null;
    if (pageUrl) {
      try {
        domain = new URL(pageUrl).hostname;
      } catch (urlError) {
        console.log('Invalid page URL:', pageUrl);
      }
    }

    // Try to get image metadata from the page
    const metadata = await getImageMetadata(info, tab);

    if (metadata) {
      // Add alt text if available and not empty
      if (metadata.alt && typeof metadata.alt === 'string' && metadata.alt.trim()) {
        parts.push(metadata.alt.trim());
      }

      // Add title text if available, different from alt, and not empty
      if (metadata.title &&
          typeof metadata.title === 'string' &&
          metadata.title.trim() &&
          metadata.title.trim() !== metadata.alt?.trim()) {
        parts.push(metadata.title.trim());
      }
    }

    // Add domain if available
    if (domain) {
      parts.push(`Source: ${domain}`);
    }

    // Return description or fallback
    if (parts.length > 0) {
      return parts.join(' | ');
    } else {
      // Ultimate fallback - use image filename or generic text
      try {
        const filename = new URL(info.srcUrl).pathname.split('/').pop();
        if (filename && filename.includes('.')) {
          return `Image: ${filename}`;
        }
      } catch (e) {
        // URL parsing failed, fall through to the generic text
      }
      return 'Saved image';
    }

  } catch (error) {
    console.error('Error extracting enhanced description:', error);
    // Return a basic fallback
    return 'Saved image';
  }
}

// Drop pending saves whose tag window was closed without saving or cancelling
async function prunePendingSaves() {
  const all = await browser.storage.session.get(null);
  const stale = Object.keys(all).filter((key) =>
    key.startsWith(PENDING_PREFIX) &&
    !(all[key] && Date.now() - all[key].createdAt < PENDING_MAX_AGE_MS)
  );
  if (stale.length > 0) {
    await browser.storage.session.remove(stale);
  }
}

// Open the tag window for a pending save, centred over the current window
async function openTagWindow(pendingId) {
  const options = {
    url: browser.runtime.getURL(`tags.html?id=${encodeURIComponent(pendingId)}`),
    type: 'popup',
    width: TAG_WINDOW_WIDTH,
    height: TAG_WINDOW_HEIGHT
  };

  try {
    const current = await browser.windows.getLastFocused();
    if (current && current.width && current.height) {
      options.left = Math.max(0, Math.round(current.left + (current.width - TAG_WINDOW_WIDTH) / 2));
      options.top = Math.max(0, Math.round(current.top + (current.height - TAG_WINDOW_HEIGHT) / 3));
    }
  } catch (e) {
    // Firefox picks a position itself
  }

  await browser.windows.create(options);
}

// Saves straight to Pinry when the tag window is turned off
async function saveImmediately(tabId, settings, pinData) {
  const allowed = await browser.permissions.contains({ origins: [pinryHostPattern(settings.pinryUrl)] });
  if (!allowed) {
    await showToast(tabId, `Pinry Saver can't reach ${new URL(settings.pinryUrl).host} yet. Open its settings and click Save Settings to allow access.`, 'error');
    return;
  }

  const result = await shareToPinry(settings, pinData);
  if (!result.success) {
    await showToast(tabId, describeSaveError(result), 'error');
    return;
  }

  if (settings.defaultBoardId) {
    const boardResult = await addPinToBoard(settings, settings.defaultBoardId, result.data.id);
    if (!boardResult.success) {
      await showToast(tabId, `Saved to Pinry, but couldn't add it to board ${settings.defaultBoardId}.`, 'error');
      return;
    }
  }

  await showToast(tabId, 'Successfully saved image to Pinry!', 'success');
}

// Create the context menu each time the background page starts
browser.contextMenus.removeAll().then(() => {
  browser.contextMenus.create({
    id: 'save-to-pinry',
    title: 'Save to Pinry',
    contexts: ['image'],  // Only show for images
    icons: {
      "16": "icons/pinry_saver_bitmap_icon_white.png",
      "32": "icons/pinry_saver_bitmap_icon_white.png"
    }
  });
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-to-pinry') {
    return;
  }

  const tabId = tab ? tab.id : undefined;

  try {
    const settings = await getPinrySettings();

    if (!settings.pinryUrl || !settings.apiKey) {
      await showToast(tabId, 'Please configure Pinry URL and API key in the addon settings first.', 'error');
      return;
    }

    if (!info.srcUrl) {
      await showToast(tabId, 'Please right-click on an image to save it to Pinry.', 'error');
      return;
    }

    if (!isWebUrl(info.srcUrl)) {
      await showToast(tabId, 'This image is embedded in the page (no web address), so Pinry can\'t download it.', 'error');
      return;
    }

    // The page the image was found on, stored as the pin's source link
    const pageUrl = [info.pageUrl, tab && tab.url].find(isWebUrl) || null;

    console.log('Preparing Pinry save:', info.srcUrl, 'from', pageUrl);

    // Extract enhanced description with image metadata and page domain
    const description = await extractEnhancedDescription(info, tab, pageUrl);

    if (!settings.showTagWindow) {
      await saveImmediately(tabId, settings, buildPinData(info.srcUrl, description, pageUrl, []));
      return;
    }

    await prunePendingSaves();
    const pendingId = crypto.randomUUID();
    await browser.storage.session.set({
      [PENDING_PREFIX + pendingId]: {
        createdAt: Date.now(),
        imageUrl: info.srcUrl,
        pageUrl: pageUrl,
        description: description
      }
    });

    // The tag window finishes the save (tags.js)
    await openTagWindow(pendingId);
  } catch (error) {
    console.error('Error in context menu:', error);
    await showToast(tabId, 'An error occurred while saving to Pinry.', 'error');
  }
});
