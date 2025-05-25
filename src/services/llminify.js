// Content script for Bender extension
// This script is injected into web pages to handle automation tasks

// Global LLMinify instance for this page
let benderPage = null;

// Initialize the page analyzer
function initializePage() {
  /**
   * LLMinify class for content script - HTML minification and DOM interaction
   */
  class LLMinify {
    constructor() {
      this._interactiveSelectors = [
        'input', 'button', 'select', 'textarea', 'option', 'a',
        '[onclick]', '[onkeydown]', '[onkeyup]', '[onkeypress]',
        '[onchange]', '[oninput]', '[onfocus]', '[onblur]'
      ].join(',');
      this._allowedAttrs = new Set([/*'href', 'placeholder', 'alt', 'title'*/]);
      this._controlTags = new Set(['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'OPTION', 'A', 'IMG']);
      this.mapping = [];
      this.HTML = '';
    }

    /**
     * Get element by its assigned ID from the mapping
     */
    getElementById(id) {
      const mapping = this.mapping.find(m => m.id === id);
      return mapping ? mapping.el : null;
    }

    /**
     * Get the text content or fallback attribute of an element by ID
     */
    getElementHumanReadable(id) {
      const el = this.getElementById(id);
      if (!el) return null;
      // Try visible text
      let text = (el.innerText || el.textContent || '').trim();
      if (text) return text;
      // Fallback attributes
      const attrs = ['title', 'alt', 'placeholder', 'href', 'src'];
      for (const attr of attrs) {
        if (el.hasAttribute && el.hasAttribute(attr)) {
          const val = el.getAttribute(attr);
          if (val && val.trim()) return val.trim();
        }
        // For properties like href/src on <a> or <img>
        if (el[attr] && typeof el[attr] === 'string' && el[attr].trim()) {
          return el[attr].trim();
        }
      }
      return '';
    }

    /**
     * Get absolute URLs from elements by their IDs
     * @param {number|number[]} ids - Single ID or array of IDs
     * @returns {Array} Array of objects with {name, url} properties
     */
    getAbsoluteUrlFromElement(ids) {
      // Ensure ids is always an array
      const idArray = Array.isArray(ids) ? ids : [ids];
      const results = [];

      idArray.forEach(id => {
        const el = this.getElementById(id);
        if (!el) {
          results.push({
            id: id,
            name: null,
            url: null,
            error: 'Element not found'
          });
          return;
        }

        // Get human readable name
        const name = this.getElementHumanReadable(id);
        
        // Get href attribute and convert to absolute URL
        let url = null;
        if (el.hasAttribute && el.hasAttribute('href')) {
          const href = el.getAttribute('href');
          if (href) {
            try {
              // Convert relative URLs to absolute using the current page's base URL
              url = new URL(href, window.location.href).href;
            } catch (e) {
              // If URL construction fails, keep the original href
              url = href;
            }
          }
        }

        results.push({
          id: id,
          name: name || '',
          url: url
        });
      });

      return results;
    }

    /**
     * Refresh the minified HTML representation of the current page
     */
    refresh() {
      const interactiveSelectors = this._interactiveSelectors;
      const allowed = this._allowedAttrs;
      const controlTags = this._controlTags;

      // 1. Collect original interactive elements
      const originalInteractiveEls = Array.from(document.querySelectorAll(interactiveSelectors));

      // 2. Deep-clone the entire HTML document
      const clone = document.documentElement.cloneNode(true);

      // 3. Strip attributes except allowed ones and form-control values
      this._stripAttributes(clone, allowed, controlTags);

      // 4. Assign IDs to interactive elements and build mapping
      this._assignElementIds(clone, originalInteractiveEls, interactiveSelectors);

      // 5. Remove script and style contents
      clone.querySelectorAll('script, noscript, style').forEach(el => el.textContent = '');

      // 6. Remove HTML comments
      this._removeComments(clone);

      // 7. Remove hidden and decorative elements
      this._removeHiddenElements(clone);

      // 8. Prune empty, non-interactive nodes
      this._pruneEmptyNodes(clone, controlTags);

      // 9. Collapse single-child wrappers
      this._collapseSingleChildWrappers(clone, controlTags);

      // 10. Generate normalized HTML
      this.HTML = this._normalizeHTML(clone);
    }

    /**
     * Strip attributes except allowed ones
     * @private
     */
    _stripAttributes(clone, allowed, controlTags) {
      clone.querySelectorAll('*').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
          const name = attr.name.toLowerCase();
          if (allowed.has(name)) return;
          if (name === 'value' && controlTags.has(el.tagName)) return;
          if (name === 'checked' && el.tagName === 'INPUT') return;
          if (name === 'selected' && el.tagName === 'OPTION') return;
          el.removeAttribute(attr.name);
        });
      });
    }

    /**
     * Assign IDs to interactive elements and build mapping
     * @private
     */
    _assignElementIds(clone, originalInteractiveEls, interactiveSelectors) {
      this.mapping = [];
      let llmCounter = 1;
      const clonedInteractiveEls = Array.from(clone.querySelectorAll(interactiveSelectors));
      clonedInteractiveEls.forEach((cloneEl, i) => {
        const id = llmCounter++;
        cloneEl.setAttribute('id', String(id));
        this.mapping.push({ id: id, el: originalInteractiveEls[i] });
      });
    }

    /**
     * Remove all HTML comments
     * @private
     */
    _removeComments(clone) {
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT, null, false);
      const comments = [];
      while (walker.nextNode()) comments.push(walker.currentNode);
      comments.forEach(node => node.parentNode.removeChild(node));
    }

    /**
     * Remove hidden and decorative elements
     * @private
     */
    _removeHiddenElements(clone) {
      Array.from(clone.querySelectorAll('*')).reverse().forEach(el => {
        const style = window.getComputedStyle(el);
        if (
          el.hasAttribute('hidden') ||
          el.getAttribute('aria-hidden') === 'true' ||
          ['presentation', 'none'].includes(el.getAttribute('role')) ||
          style.display === 'none' ||
          style.visibility === 'hidden'
        ) {
          el.remove();
        }
      });
    }

    /**
     * Remove empty, non-interactive nodes
     * @private
     */
    _pruneEmptyNodes(clone, controlTags) {
      Array.from(clone.querySelectorAll('*')).reverse().forEach(el => {
        if (el === clone) return;
        if (el.hasAttribute('id')) return;
        if (controlTags.has(el.tagName)) return;
        if (el.tagName === 'A' && el.hasAttribute('href')) return;

        // Only remove if NO text nodes and NO element children
        let hasText = Array.from(el.childNodes).some(
          n => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== ''
        );
        let hasElement = Array.from(el.childNodes).some(
          n => n.nodeType === Node.ELEMENT_NODE
        );
        if (!hasText && !hasElement) el.remove();
      });
    }

    /**
     * Collapse single-child wrapper elements
     * @private
     */
    _collapseSingleChildWrappers(clone, controlTags) {
      Array.from(clone.querySelectorAll('*')).reverse().forEach(node => {
        if (node === clone) return;
        if (node.hasAttribute('id')) return;
        if (controlTags.has(node.tagName)) return;

        // Get all child nodes that are ELEMENT_NODE
        const elementChildren = Array.from(node.childNodes).filter(
          n => n.nodeType === Node.ELEMENT_NODE
        );
        // Only collapse if the ONLY child is an element, and there are NO text nodes with real content
        const textNodes = Array.from(node.childNodes).filter(
          n => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== ''
        );
        if (elementChildren.length === 1 && textNodes.length === 0 && node.childNodes.length === 1) {
          node.parentNode.replaceChild(elementChildren[0], node);
        }
      });
    }

    /**
     * Normalize and clean up the HTML output
     * @private
     */
    _normalizeHTML(clone) {
      let html = clone.outerHTML;
      html = html
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .replace(/^\s+|\s+$/gm, '')
        .replace(/\s{2,}|\n/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();

      return html;
    }
  }

  benderPage = new LLMinify();
  window.benderPage = benderPage;
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}

console.log('Bender content script loaded on:', window.location.href);

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Bender content script received message:', request);
  
  try {
    switch (request.action) {
      case 'getCurrentPageHTML':
        if (!benderPage) initializePage();
        benderPage.refresh();
        console.log('Returning page HTML, length:', benderPage.HTML.length);
        sendResponse({ result: benderPage.HTML });
        break;
        
      case 'clickElement':
        if (!benderPage) {
          sendResponse({ error: 'Page not initialized. Call getCurrentPageHTML first.' });
          break;
        }
        const clickElement = benderPage.getElementById(request.id);
        if (clickElement) {
          clickElement.click();
          sendResponse({ result: `Clicked "${benderPage.getElementHumanReadable(request.id)}" (${request.id})` });
        } else {
          sendResponse({ result: `Element ${request.id} not found` });
        }
        break;
        
      case 'inputText':
        if (!benderPage) {
          sendResponse({ error: 'Page not initialized. Call getCurrentPageHTML first.' });
          break;
        }
        const inputElement = benderPage.getElementById(request.id);
        if (inputElement) {
          inputElement.value = request.text;
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          inputElement.dispatchEvent(new Event('change', { bubbles: true }));
          sendResponse({ result: `Entered text "${request.text}" into "${benderPage.getElementHumanReadable(request.id)}" (${request.id})` });
        } else {
          sendResponse({ result: `Element with ID ${request.id} not found` });
        }
        break;
        
      case 'getAbsoluteUrlFromElement':
        if (!benderPage) {
          sendResponse({ error: 'Page not initialized. Call getCurrentPageHTML first.' });
          break;
        }
        const urlResults = benderPage.getAbsoluteUrlFromElement(request.ids);
        sendResponse({ result: urlResults });
        break;
        
      case 'goBack':
        window.history.back();
        sendResponse({ result: 'Navigated to previous page' });
        break;
        
      default:
        sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    sendResponse({ error: error.message });
  }
  
  return true; // Keep the message channel open for async response
});
