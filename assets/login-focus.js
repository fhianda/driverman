'use strict';

// Le clavier peut réduire seulement le viewport visuel (Safari) ou toute la
// WebView (Android). Recentrer uniquement un champ de connexion masqué.
(() => {
  let frame;
  function keepFieldVisible() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const field = document.activeElement;
      if (!field?.matches('#auth-form input')) return;
      const viewport = window.visualViewport;
      const top = (viewport?.offsetTop || 0) + 24;
      const bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - 24;
      const rect = field.getBoundingClientRect();
      if (rect.top < top || rect.bottom > bottom) {
        window.scrollBy({top: rect.top - (top + Math.max(0, (bottom - top - rect.height) / 2)), behavior: 'instant'});
      }
    });
  }
  document.addEventListener('focusin', keepFieldVisible);
  window.addEventListener('resize', keepFieldVisible);
  window.visualViewport?.addEventListener('resize', keepFieldVisible);
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.id === 'auth-email') {
      event.preventDefault();
      document.querySelector('#auth-password')?.focus();
    }
  });
})();
