// This script runs in the page context (main world)
// It can access the React internal instances

(function() {
  function getReactFiber(dom) {
    const key = Object.keys(dom).find(key => key.startsWith('__reactFiber$'));
    return key ? dom[key] : null;
  }

  function findUserInFiber(fiber) {
    let curr = fiber;
    while (curr) {
      const props = curr.memoizedProps;
      if (props) {
        if (props.user && props.user.profile_banner_url) {
          return props.user;
        }
        if (props.data && props.data.user && props.data.user.result && props.data.user.result.legacy) {
             return props.data.user.result.legacy;
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
    
    let user = findUserInFiber(fiber);
    
    if (!user) {
        const avatar = hoverCard.querySelector('[data-testid^="UserAvatar-Container"]');
        if (avatar) {
            const avatarFiber = getReactFiber(avatar);
            if (avatarFiber) {
                user = findUserInFiber(avatarFiber);
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
