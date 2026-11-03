// Optional desktop (Electron) bridge. The desktop build's preload exposes window.landedDesktop
// ({ isDesktop, platform, quit(), toggleFullscreen() }); in a browser it's undefined and this does nothing.
// With the bridge, the hidden .desktop-row button rows (title card and pause card) show Quit and Fullscreen.
export const desktop = window.landedDesktop?.isDesktop ? window.landedDesktop : null;

const ACTIONS = { 'desktop-quit': 'quit', 'desktop-fs': 'toggleFullscreen' }; // button class → bridge method

export function installDesktop() {
  if (!desktop) return;
  for (const row of document.querySelectorAll('.desktop-row')) row.classList.remove('hidden');
  for (const [cls, method] of Object.entries(ACTIONS)) {
    for (const el of document.getElementsByClassName(cls)) {
      // blur: Enter / Space must reach the game (take off, shoot), not click this button again
      el.addEventListener('click', (e) => { e.currentTarget.blur(); desktop[method](); });
    }
  }
}
