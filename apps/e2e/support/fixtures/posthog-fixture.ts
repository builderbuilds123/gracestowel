import { test as base } from '@playwright/test';

export const test = base.extend<{ posthogFix: void }>({
  posthogFix: [async ({ page }, use) => {
    // Inject CSS to hide PostHog surveys globally
    // We use addInitScript to ensure this runs before any page content loads
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.innerHTML = `
        [class*="PostHogSurvey"],
        [class*="posthog-survey"],
        div[id^="posthog-survey"] {
          display: none !important;
          pointer-events: none !important;
          visibility: hidden !important;
          z-index: -9999 !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
          position: fixed !important;
          top: -10000px !important;
          left: -10000px !important;
        }
      `;
      document.head.appendChild(style);
      
      // Backup: Aggressively remove from DOM
      setInterval(() => {
        const popups = document.querySelectorAll('[class*="PostHogSurvey"], [class*="posthog-survey"]');
        popups.forEach(p => p.remove());
      }, 100);
    });
    await use();
  }, { auto: true }],
});
