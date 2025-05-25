/**
 * Automation Tools - Unified tool definitions and implementations
 * This module contains both the OpenAI function schemas and their implementations
 * in a single, easy-to-maintain structure. Each tool contains:
 * - type & function: OpenAI function calling schema
 * - implementation: The actual function that executes the tool
 * 
 * All tools use async/await to ensure proper sequential execution
 */

import { sendMessageToContentScript, navigateToUrl, waitForPageReady } from './content-script-api.js';

/**
 * Unified tool definitions and implementations
 * Each tool contains both its schema definition and implementation function
 */
export const tools = [
  {
    type: "function",
    function: {
      name: "NavigateToUrl",
      description: "Navigate to a specific URL in the current tab. Returns the navigation result, current page URL, and page HTML with interactive elements having ID attributes.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to navigate to (must include http:// or https://)"
          },
          reasonForAction: {
            type: "string",
            description: "Briefly explain the intention and how this action will help to achieve the goal."
          }
        },
        required: ["url", "reasonForAction"]
      }
    },
    implementation: async (args) => {
      try {
        const { url } = args;
        console.log(`Navigating to: ${url}`);
        const result = await navigateToUrl(url);
        // Additional wait to ensure page is fully interactive
        await waitFor(200);
        await waitForPageReady();
        
        // Get page context for LLM
        const pageContext = await getPageContext();
        
        return `${result}\n\nCurrent URL: ${pageContext.url}\n\nPage HTML:\n${pageContext.html}`;
      } catch (error) {
        return `Error navigating to URL: ${error.message}`;
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ClickElement",
      description: "Click on an element with the given ID in the current page. Returns the action result, current page URL, and updated page HTML with interactive elements having ID attributes.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "The ID of the element to click (from previous page HTML output)"
          },
          reasonForAction: {
            type: "string",
            description: "Briefly explain the intention and how this action will help to achieve the goal."
          }
        },
        required: ["id", "reasonForAction"]
      }
    },
    implementation: async (args) => {
      try {
        const { id } = args;
        console.log(`Clicking element with ID: ${id}`);
        const result = await sendMessageToContentScript('clickElement', { id });
        // Wait after click to allow for any page changes
        await waitFor(200);
        await waitForPageReady();
        
        // Get page context for LLM
        const pageContext = await getPageContext();
        
        return `${result}\n\nCurrent URL: ${pageContext.url}\n\nPage HTML:\n${pageContext.html}`;
      } catch (error) {
        return `Error clicking element: ${error.message}`;
      }
    }
  },
  {
    type: "function",
    function: {
      name: "InputText",
      description: "Enter text into an input or textarea element with the given ID. Returns the action result, current page URL, and updated page HTML with interactive elements having ID attributes.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "The ID of the input element (from previous page HTML output)"
          },
          text: {
            type: "string",
            description: "The text to enter into the input field"
          },
          reasonForAction: {
            type: "string",
            description: "Briefly explain the intention and how this action will help to achieve the goal."
          }
        },
        required: ["id", "text", "reasonForAction"]
      }
    },
    implementation: async (args) => {
      try {
        const { id, text } = args;
        console.log(`Inputting text into element with ID: ${id}`);
        const result = await sendMessageToContentScript('inputText', { id, text });
        // Wait after input to allow for any validation or page changes
        await waitFor(200);
        await waitForPageReady();

        // Get the human-readable name for the element
        const elementInfo = await sendMessageToContentScript('getElementInfo', { id });
        const name = elementInfo && elementInfo.name ? elementInfo.name : 'Unknown';

        // Get page context for LLM
        const pageContext = await getPageContext();

        return `Entered text into element ID ${id} ("${name}")`;
      } catch (error) {
        return `Error inputting text: ${error.message}`;
      }
    }
  },
  {
    type: "function",
    function: {
      name: "GoBack",
      description: "Navigate back to the previous page in the browser history. Returns the action result, current page URL, and page HTML with interactive elements having ID attributes.",
      parameters: {
        type: "object",
        properties: {
          reasonForAction: {
            type: "string",
            description: "Briefly explain the intention and how this action will help to achieve the goal."
          }
        },
        required: ["reasonForAction"]
      }
    },
    implementation: async (args) => {
      try {
        console.log('Navigating back...');
        const result = await sendMessageToContentScript('goBack');
        // Wait for page to load after going back
        await waitFor(200);
        await waitForPageReady();
        
        // Get page context for LLM
        const pageContext = await getPageContext();
        
        return `${result}\n\nCurrent URL: ${pageContext.url}\n\nPage HTML:\n${pageContext.html}`;
      } catch (error) {
        return `Error going back: ${error.message}`;
      }
    }
  },
  {
    type: "function",
    function: {
      name: "Done",
      description: "Mark the current command as completed and provide the requested data. ONLY call this when you have successfully extracted the requested data. Do NOT call with null or empty data.",
      parameters: {
        type: "object",
        properties: {
          data: {
            anyOf: [
              { type: "object" },
              { 
                type: "array",
                items: {
                  type: "object"
                }
              },
              { type: "string" },
              { type: "null" }
            ],
            description: "The actual data that was requested by the user command. Must contain the extracted information, not null or empty."
          },
          reasonForAction: {
            type: "string",
            description: "Briefly explain the intention and how this action will help to achieve the goal."
          }
        },
        required: ["data", "reasonForAction"]
      }
    },
    implementation: async (args) => {
      const { data } = args;
      console.log('Done function called with data:', data);
      console.log('Data type:', typeof data);
      console.log('Data value:', JSON.stringify(data, null, 2));
      
      // Validate that we have actual data
      if (data === null || data === undefined) {
        console.warn('WARNING: Done() called with null/undefined data. This should only happen if data extraction truly failed.');
        return 'Error: Done() called with null data. Please extract the requested data first before calling Done().';
      }
      
      if (Array.isArray(data) && data.length === 0) {
        console.warn('WARNING: Done() called with empty array. Make sure you extracted the requested data.');
      }
      
      // Try to parse data if it's a string to see if it's valid JSON
      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
          console.log('Successfully parsed JSON data:', parsedData);
        } catch (parseError) {
          console.log('Data is not valid JSON, keeping as string:', data);
          // Keep original data if it's not valid JSON
          parsedData = data;
        }
      }
        // This will be handled by the main app to complete the current command
      return JSON.stringify({ type: 'COMMAND_COMPLETE', data: parsedData });
    }
  },
  {
    type: "function",
    function: {
      name: "GetAbsoluteUrlFromElement",
      description: "Extract absolute URLs and human-readable names from one or more link elements by their IDs. Useful for collecting links from a page for further navigation or data extraction.",
      parameters: {
        type: "object",
        properties: {
          ids: {
            oneOf: [
              { type: "number" },
              { 
                type: "array",
                items: { type: "number" }
              }
            ],
            description: "Single element ID or array of element IDs to extract URLs from (from previous page HTML output)"
          },
          reasonForAction: {
            type: "string",
            description: "Briefly explain the intention and how this action will help to achieve the goal."
          }
        },
        required: ["ids", "reasonForAction"]
      }
    },
    implementation: async (args) => {
      try {
        const { ids } = args;
        console.log(`Getting absolute URLs from element(s): ${Array.isArray(ids) ? ids.join(', ') : ids}`);
        const result = await sendMessageToContentScript('getAbsoluteUrlFromElement', { ids });
        
        // Get page context for LLM
        const pageContext = await getPageContext();
        
        const resultData = Array.isArray(result) ? result : [result];
        const summary = resultData.map(item => 
          item.error ? `ID ${item.id}: ${item.error}` :
          `ID ${item.id}: "${item.name}" -> ${item.url || 'No URL'}`
        ).join('\n');
        
        return `Extracted URLs:\n${summary}`;
      } catch (error) {
        return `Error extracting URLs: ${error.message}`;
      }
    }
  }
];

/**
 * Add a small delay to ensure page stability between actions
 * @param {number} ms - Milliseconds to wait
 */
async function waitFor(ms = 500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get current page HTML and URL for LLM context
 * @returns {Promise<Object>} Object containing HTML and URL
 */
async function getPageContext() {
  try {
    // Small delay to ensure page is stable
    await waitFor(200);
    await waitForPageReady();
    
    // Get HTML
    const html = await sendMessageToContentScript('getCurrentPageHTML');
    
    // Get current URL
    const url = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs.length > 0 ? tabs[0].url : 'Unknown');
      });
    });
    
    return { html: html || 'Failed to get page HTML', url };
  } catch (error) {
    return { html: `Error getting page HTML: ${error.message}`, url: 'Unknown' };
  }
}

// Export unified tools array containing both definitions and implementations
