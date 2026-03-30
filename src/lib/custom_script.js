/**
 * Example Custom Script for anyWebMCP
 * This script is executed in the Main World context.
 * It can monitor DOM changes and return a result when a condition is met.
 */

return new Promise((resolve, reject) => {
  const config = {
    contentSelector: '.markdown-body',
    stopSelector: 'button[aria-label="Copy text"]', // Signal to stop monitoring
    timeout: 30000
  };

  const check = () => {
    const stopEl = document.querySelector(config.stopSelector);
    if (stopEl) {
      const contentEl = document.querySelector(config.contentSelector);
      resolve(contentEl ? contentEl.innerText : 'Content not found');
      return true;
    }
    return false;
  };

  if (check()) return;

  const observer = new MutationObserver(() => {
    if (check()) observer.disconnect();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => {
    observer.disconnect();
    const finalContent = document.querySelector(config.contentSelector);
    resolve(finalContent ? finalContent.innerText : 'Timeout reaching content');
  }, config.timeout);
});
