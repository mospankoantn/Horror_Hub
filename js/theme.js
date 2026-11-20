// Runs in <head> before the stylesheet paints: picks the saved theme or the system one.
(() => {
  let theme = null;
  try { theme = localStorage.getItem('hh-theme'); } catch (error) { /* storage blocked */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();
