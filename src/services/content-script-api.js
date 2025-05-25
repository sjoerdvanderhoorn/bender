
/**
 * Content Script API - Handles communication between extension and web pages
 * This module contains utilities for sending messages to content scripts
 */

/**
 * Wait for page to be ready (loaded and interactive)
 * @returns {Promise} Promise that resolves when page is ready
 */
export async function waitForPageReady() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        resolve();
        return;
      }
      
      const checkPageReady = () => {
        chrome.tabs.get(tabs[0].id, (tab) => {
          if (tab.status === 'complete') {
            // Additional wait to ensure page scripts have loaded
            setTimeout(resolve, 1000);
          } else {
            setTimeout(checkPageReady, 500);
          }
        });
      };
      
      checkPageReady();
    });
  });
}

/**
 * Send a message to the content script in the active tab
 * @param {string} action - The action to perform
 * @param {Object} data - Additional data to send with the action
 * @returns {Promise} Promise that resolves with the response from content script
 */
export async function sendMessageToContentScript(action, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        reject(new Error('No active tab found'));
        return;
      }
      
      console.log('Sending message to content script:', { action, ...data });
      
      chrome.tabs.sendMessage(tabs[0].id, { action, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          console.error('Content script error:', response.error);
          reject(new Error(response.error));
        } else {
          console.log('Content script response:', response);
          resolve(response ? response.result : 'Success');
        }
      });
    });
  });
}

/**
 * Navigate to a URL in the current tab and wait for it to load
 * @param {string} url - The URL to navigate to
 * @returns {Promise} Promise that resolves when navigation and page loading is complete
 */
export async function navigateToUrl(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        reject(new Error('No active tab found'));
        return;
      }
      
      chrome.tabs.update(tabs[0].id, { url: url }, async (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          try {
            // Wait for the page to be fully loaded
            await waitForPageReady();
            resolve(`Navigated to ${url} and page is ready`);
          } catch (error) {
            resolve(`Navigated to ${url} (page ready check failed: ${error.message})`);
          }
        }
      });
    });
  });
}
