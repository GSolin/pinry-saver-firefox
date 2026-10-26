// Pinry Saver Firefox Addon - Pinry API helpers

function isWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

// Permission pattern covering a Pinry server (match patterns can't hold a port)
function pinryHostPattern(pinryUrl) {
  const url = new URL(pinryUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

async function getPinrySettings() {
  return browser.storage.sync.get(['pinryUrl', 'apiKey', 'defaultBoardId', 'showTagWindow']);
}

function buildPinData(imageUrl, description, pageUrl, tags) {
  const pinData = { url: imageUrl, description: description, tags: tags };
  if (pageUrl) {
    pinData.referer = pageUrl;
  }
  return pinData;
}

async function pinryRequest(settings, method, path, body) {
  const apiUrl = `${settings.pinryUrl}/api/v2/${path}`;

  console.log('Sending to Pinry:', { method: method, url: apiUrl, data: body });

  const response = await fetch(apiUrl, {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${settings.apiKey}`,
      'Accept': 'application/json'
    },
    credentials: 'omit',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  console.log('Pinry response:', {
    status: response.status,
    statusText: response.statusText
  });

  if (response.ok) {
    return { success: true, data: await response.json() };
  }

  const errorText = await response.text();
  console.log('Error response body:', errorText);
  return {
    success: false,
    status: response.status,
    error: `HTTP ${response.status}: ${response.statusText}`,
    details: errorText
  };
}

async function shareToPinry(settings, pinData) {
  try {
    return await pinryRequest(settings, 'POST', 'pins/', pinData);
  } catch (error) {
    console.error('Error sharing to Pinry:', error);
    return { success: false, error: error.message };
  }
}

// Pinry's pin API has no board field, so the board is updated separately
async function addPinToBoard(settings, boardId, pinId) {
  try {
    return await pinryRequest(settings, 'PATCH', `boards/${boardId}/`, { pins_to_add: [pinId] });
  } catch (error) {
    console.error('Error adding pin to board:', error);
    return { success: false, error: error.message };
  }
}

// Existing tag names in Pinry, for suggestions
async function fetchExistingTags(settings) {
  try {
    // Pinry caches this list for 5 minutes; a unique query string gets the current one
    const result = await pinryRequest(settings, 'GET', `tags-auto-complete/?t=${Date.now()}`);
    if (!result.success || !Array.isArray(result.data)) {
      return [];
    }
    return result.data
      .map((tag) => (typeof tag === 'string' ? tag : tag && tag.name))
      .filter((name) => typeof name === 'string' && name);
  } catch (error) {
    console.error('Error fetching tags:', error);
    return [];
  }
}

// Turns a failed Pinry response into a readable message
function describeSaveError(result) {
  if (result.status === 401 || result.status === 403) {
    return 'Pinry rejected the API key - check it in the addon settings';
  }
  if (result.status === 500) {
    return 'Pinry couldn\'t download this image - the site may block downloads. Try opening the image on its own first.';
  }
  if (result.details) {
    // Parse the error details for better user feedback
    try {
      const errorData = JSON.parse(result.details);
      if (errorData['url-or-image'] || errorData.url) {
        return 'Invalid image URL - try a different image';
      }
      if (errorData.tags) {
        return 'Pinry rejected a tag - tags can be at most 100 characters';
      }
    } catch (e) {
      // Not JSON
    }
    if (result.details.includes('NOT NULL constraint failed')) {
      return 'Image processing failed - try a different image';
    }
    if (result.details.includes('IntegrityError')) {
      return 'Image format not supported - try a different image';
    }
  }
  return result.error || 'Unknown error occurred';
}
