const CACHE = new Map();

// Inject the script to access React props
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from injected script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data.type && event.data.type === 'BetterCards_HeaderFound') {
    const { username, url } = event.data;
    const fullUrl = `${url}/1500x500`;
    CACHE.set(username, fullUrl);
    
    const card = document.querySelector('[data-testid="HoverCard"]');
    if (card && card.dataset.betterCardsUsername === username) {
        updateCardHeader(card, fullUrl);
    }
  }
});

// Observer to watch for the HoverCard
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1) {
        // Check if the added node is the HoverCard or contains it
        const hoverCard = node.querySelector ? node.querySelector('[data-testid="HoverCard"]') : null;
        if (hoverCard || (node.getAttribute && node.getAttribute('data-testid') === 'HoverCard')) {
          const card = hoverCard || node;
          handleHoverCard(card);
        }
      }
    }
  }
});

// Start observing the layers container or body
const layers = document.querySelector('#layers') || document.body;
observer.observe(layers, { childList: true, subtree: true });

// Also watch body in case #layers is re-created (SPA navigation)
if (layers !== document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
}

async function handleHoverCard(card) {
  if (card.dataset.betterCardsProcessed) return;

  // Find the username
  const username = extractUsername(card);
  if (!username) {
    // Content might not be loaded yet (skeleton state).
    // Observe the card for changes and retry.
    if (!card.dataset.betterCardsObserving) {
        card.dataset.betterCardsObserving = 'true';
        const retryObserver = new MutationObserver((mutations, obs) => {
            if (extractUsername(card)) {
                obs.disconnect();
                delete card.dataset.betterCardsObserving;
                handleHoverCard(card);
            }
        });
        retryObserver.observe(card, { childList: true, subtree: true });
    }
    return;
  }
  
  card.dataset.betterCardsProcessed = 'true';
  card.dataset.betterCardsUsername = username; // Store for callback

  // Prepare the card structure immediately
  prepareCardUI(card);

  // Reset header to loading state immediately to prevent stale data
  const headerDiv = card.querySelector('.bettercards-header');
  if (headerDiv) {
      headerDiv.classList.add('loading');
      headerDiv.style.backgroundImage = 'none';
      headerDiv.style.backgroundColor = '#cfd9de';
  }

  // Fetch and show header
  const headerUrl = await fetchHeader(username);
  
  // Always update the card. If headerUrl is null, it means no banner found (or fetch failed),
  // so we show the default gray background.
  updateCardHeader(card, headerUrl);
}

function extractUsername(card) {
  // Look for the handle link (e.g. @username)
  // It usually has dir="ltr" and starts with @
  const links = card.querySelectorAll('a[href^="/"]');
  for (const link of links) {
    const text = link.textContent;
    if (text.startsWith('@')) {
      return text.substring(1); // Remove @
    }
  }
  
  // Fallback: check hrefs
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href && href.length > 1 && !href.includes('/') && !['home', 'explore'].includes(href.substring(1))) {
       return href.substring(1);
    }
  }
  return null;
}

function prepareCardUI(card) {
  // Find the inner content container. 
  const avatar = card.querySelector('[data-testid^="UserAvatar-Container"]');
  if (!avatar) return;

  let container = avatar.parentElement;
  while (container && container !== card) {
    if (container.parentElement === card || container.parentElement.parentElement === card) {
      break;
    }
    container = container.parentElement;
  }
  
  if (!container) return;

  // Add our class to handle layout changes
  container.classList.add('bettercards-modified-card');

  // Create the header element (Idempotent check)
  if (!container.querySelector('.bettercards-header')) {
      const headerDiv = document.createElement('div');
      headerDiv.className = 'bettercards-header loading'; 
      
      // Insert as first child so it sits behind content (z-index 0 vs content auto/1)
      if (container.firstChild) {
          container.insertBefore(headerDiv, container.firstChild);
      } else {
          container.appendChild(headerDiv);
      }
  }
  
  // Ensure buttons have z-index to sit above header and are positioned correctly
  const actionSelectors = [
      '[data-testid$="-follow"]',
      '[data-testid$="-unfollow"]',
      '[data-testid="editProfileButton"]'
  ];
  
  let mainActionBtn = null;
  for (const sel of actionSelectors) {
      mainActionBtn = card.querySelector(sel);
      if (mainActionBtn) break;
  }

  if (mainActionBtn && avatar) {
      // Find the container that holds all the buttons (Follow, Message, Menu, etc.)
      // Usually it's a flex row. We traverse up from the Follow button.
      let btnContainer = mainActionBtn.parentElement;
      
      // Heuristic: Go up until we hit a container that is a direct child of the main card container
      // or until we find a container that has multiple children (the buttons).
      // Twitter's structure is usually: Card -> ... -> Row -> [Button, Button, Button]
      
      // We'll try to find the row wrapper.
      // It usually doesn't contain the avatar.
      while (btnContainer && btnContainer !== container) {
          if (btnContainer.parentElement === container) break;
          // If this container has the avatar, we went too far (or structure is different)
          if (btnContainer.contains(avatar)) break; 
          
          // Check if this container has the "More" menu button
          if (btnContainer.querySelector('[data-testid="userActions"]')) {
              break; // Found the container that holds the menu!
          }
          
          btnContainer = btnContainer.parentElement;
      }

      if (btnContainer && !btnContainer.contains(avatar)) {
          btnContainer.style.position = 'absolute';
          btnContainer.style.top = '12px';
          btnContainer.style.right = '12px';
          btnContainer.style.zIndex = '10'; // High z-index to ensure clickable
          // Remove any margins that might displace it
          btnContainer.style.marginTop = '0';
          btnContainer.style.marginRight = '0';
          // Stack buttons vertically
          btnContainer.style.display = 'flex';
          btnContainer.style.flexDirection = 'column';
          btnContainer.style.alignItems = 'flex-end';
          btnContainer.style.gap = '8px';
          
          btnContainer.style.pointerEvents = 'auto';
          
          // Ensure overflow is visible for dropdowns (Menu)
          btnContainer.style.overflow = 'visible';
      }
  } else {
      // Buttons might not be loaded yet. Observe and retry.
      if (!card.dataset.betterCardsWaitingForButtons) {
          card.dataset.betterCardsWaitingForButtons = 'true';
          const btnObserver = new MutationObserver((mutations, obs) => {
              let found = false;
              for (const sel of actionSelectors) {
                  if (card.querySelector(sel)) {
                      found = true;
                      break;
                  }
              }
              if (found) {
                  obs.disconnect();
                  delete card.dataset.betterCardsWaitingForButtons;
                  prepareCardUI(card);
              }
          });
          btnObserver.observe(card, { childList: true, subtree: true });
      }
  }
}

function updateCardHeader(card, url) {
  const headerDiv = card.querySelector('.bettercards-header');
  if (headerDiv) {
    headerDiv.classList.remove('loading');
    if (url) {
      headerDiv.style.backgroundImage = `url(${url})`;
    } else {
      // Default background if no banner
      headerDiv.style.backgroundColor = '#cfd9de'; // Standard Twitter gray
      headerDiv.style.backgroundImage = 'none';
    }
  }
}

async function fetchHeader(username) {
  if (CACHE.has(username)) {
    return CACHE.get(username);
  }

  window.dispatchEvent(new CustomEvent('BetterCards_FindHeader', { detail: { username } }));
  
  try {
    const response = await fetch(`/${username}`);
    if (CACHE.has(username)) return CACHE.get(username);

    const text = await response.text();
    
    const titleMatch = text.match(/<title>(.*?)<\/title>/);
    if (titleMatch && !titleMatch[1].includes(`@${username}`)) {
        return null;
    }
    
    let userId = null;
    
    const screenNamePattern = `"screen_name":"${username}"`;
    const restIdPattern = `"rest_id":"(\\d+)"`;
    
    const screenNameIndices = [];
    let match;
    const screenNameRegex = new RegExp(screenNamePattern, 'gi');
    while ((match = screenNameRegex.exec(text)) !== null) {
      screenNameIndices.push(match.index);
    }
    
    for (const index of screenNameIndices) {
      const chunkAhead = text.substring(index, index + 1000);
      const matchAhead = chunkAhead.match(new RegExp(restIdPattern));
      if (matchAhead) {
        userId = matchAhead[1];
        break;
      }
      
      const chunkBehind = text.substring(Math.max(0, index - 1000), index);
      const matchBehind = chunkBehind.match(new RegExp(restIdPattern));
      if (matchBehind) {
        userId = matchBehind[1];
        break;
      }
    }

    if (userId) {
      const bannerRegex = new RegExp(`profile_banners\\/${userId}\\/(\\d+)`, 'g');
      const bannerMatch = text.match(bannerRegex);
      
      if (bannerMatch) {
        const url = `https://pbs.twimg.com/${bannerMatch[0]}/1500x500`;
        CACHE.set(username, url);
        return url;
      }
    }

  } catch (e) {
    // Silent fail
  }
  
  return null;
}
