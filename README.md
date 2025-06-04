# Bender Chrome Extension

Bender is a Chrome extension that automates web browsing using AI **that works**, allowing you to queue commands in natural language and have them executed automatically across web pages.

## Features

### ✅ Command Queue System
- Enter multiple commands (one per line)
- Sequential execution with status tracking
- Structured results display with accordion UI
- Copy results as JSON for export

### ✅ Web Automation Tools
- **NavigateToUrl** - Navigate to any website (automatically returns page HTML and URL)
- **ClickElement** - Click buttons, links, etc. (automatically returns updated page HTML and URL)
- **InputText** - Fill forms and input fields (automatically returns updated page HTML and URL)
- **GoBack** - Browser navigation (automatically returns updated page HTML and URL)
- **Done** - Mark command complete and return data

### ✅ Smart Page Analysis
- LLMinify integration for clean HTML extraction
- Interactive elements get unique IDs for manipulation
- Hidden/decorative elements filtered out
- Content optimized for LLM processing
- Page HTML automatically provided after each action

### ✅ Error Handling & UI
- Failed commands marked with error details
- Processing status with spinner and progress
- Chat history for each command execution
- Results accordion with command status

## Demo

Given a single instruction, Bender changes commands together to fetch the news from multiple tech sites and upload it to paste.gd.

<video src="resources/demo-1.mp4" controls style="max-width: 100%; height: auto; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 1em;">
  Your browser does not support the video tag.
</video>

## Usage Examples

### Simple Data Extraction
```
Navigate to https://example.com and extract the main heading and description
```

### News Aggregation from multiple sources in a single command
```
Go to https://news.ycombinator.com, https://www.theverge.com, and https://www.wired.com, and for every site get the top 5 story titles and URLs in a unified JSON format
```

Or, even take action with the data and store it somewhere (this can be _anywhere_)...!
```
Go to https://news.ycombinator.com, https://www.theverge.com, and https://www.wired.com, and for every site get the top 5 story titles and URLs and paste those onto https://paste.gd/ so I can share it.
```

### Multi-step Automation
```
Navigate to GitHub.com, search for "chrome extension", and get the first 3 repository names with their descriptions
```

### Form Interaction
```
Navigate to https://httpbin.org/forms/post and fill out the form with test data, then submit it
```

## How It Works

1. **User enters commands** in the queue textarea
2. **Commands execute sequentially** using OpenAI's function calling
3. **LLM uses web automation tools** to navigate and extract data
4. **Results are captured** in structured format
5. **User can export data** as JSON for further processing

## Available Tools

The AI has access to these web automation tools:

1. **NavigateToUrl(url)** - Navigate to a specific URL
2. **ClickElement(id)** - Click an element by its ID
3. **InputText(id, text)** - Enter text into an input field
4. **GoBack()** - Navigate back in browser history
5. **Done(data)** - Mark command complete and return extracted data

All tools automatically return the current URL and updated page HTML for context.

## Token Optimization with LLMinify

Bender includes a sophisticated HTML minification system called **LLMinify** that dramatically reduces token usage when sending page content to the AI. LLMinify performs a 10-step optimization process to collapse web pages into the most condensed representation possible. This is crucial for keeping API costs low and staying within token limits.

This process typically reduces page HTML from **tens of thousands of tokens** down to **hundreds of tokens** while preserving all actionable content. For example:

- **Before**: A typical e-commerce page might be 50,000+ tokens
- **After**: LLMinify reduces it to ~500-1,000 tokens
- **Savings**: 95%+ token reduction while maintaining full functionality

### What's Preserved vs. Removed

**✅ Preserved:**
- All text content that users can see
- All interactive elements (buttons, links, forms)
- Form states and values
- Essential attributes for interaction
- Structural hierarchy for context

**❌ Removed:**
- CSS styling and classes
- JavaScript code
- Hidden/decorative elements
- Empty wrapper divs
- Comments and metadata
- Redundant whitespace
- Non-essential attributes

This allows the AI to understand and interact with web pages using minimal tokens while maintaining complete automation capabilities.

## Technical Implementation

- **Vue.js + Bootstrap** for responsive UI
- **Chrome Extension APIs** for tab control and content scripts
- **OpenAI function calling** for intelligent tool usage
- **Content script messaging** for secure page manipulation
- **LLMinify** for aggressive HTML token optimization
- **Vite build system** for modern development workflow

## Development

- Run `npm install` to install dependencies.
- Run `npm run dev` to start the Vite dev server.
- Run `npm run build` to build the extension into `/dist`.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select the `dist` folder from this project
4. The Bender extension should now appear in your extensions list
5. Configure your OpenAI API key in the extension settings
6. Open the Bender sidepanel (click the extension icon or use Ctrl+Shift+X)
