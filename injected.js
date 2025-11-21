// This script runs in the page context (main world)
// It can access the React internal instances

(function() {
  function getReactFiber(dom) {
    const key = Object.keys(dom).find(key => key.startsWith('__reactFiber$'));
    return key ? dom[key] : null;
  }

  function findUserInFiber(fiber, targetUsername) {
    let curr = fiber;
    while (curr) {
      const props = curr.memoizedProps;
      if (props) {
        let user = null;
        // Check various locations where user data might be stored
        if (props.user) {
          user = props.user;
        } else if (props.data && props.data.user && props.data.user.result && props.data.user.result.legacy) {
             user = props.data.user.result.legacy;
        }
        
        // STRICT CHECK: Ensure the user object actually belongs to the username we are hovering
        if (user && user.screen_name && user.screen_name.toLowerCase() === targetUsername.toLowerCase()) {
            return user;
        }
      }
      curr = curr.return;
    }
    return null;
  }
  
  window.addEventListener('BetterCards_FindHeader', function(e) {
    const { username } = e.detail;
    
    const hoverCard = document.querySelector('[data-testid="HoverCard"]');
    if (!hoverCard) {
        return;
    }
    
    const fiber = getReactFiber(hoverCard);
    if (!fiber) {
        return;
    }
    
    let user = findUserInFiber(fiber, username);
    
    if (!user) {
        const avatar = hoverCard.querySelector('[data-testid^="UserAvatar-Container"]');
        if (avatar) {
            const avatarFiber = getReactFiber(avatar);
            if (avatarFiber) {
                user = findUserInFiber(avatarFiber, username);
            }
        }
    }
    
    if (user && user.profile_banner_url) {
        window.postMessage({
            type: 'BetterCards_HeaderFound',
            username: username,
            url: user.profile_banner_url
        }, '*');
    }
  });

})();
