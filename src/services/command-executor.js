// filepath: c:\Users\sjoer\Desktop\bender\src\services\command-executor.js

/**
 * Command Executor Service - Handles individual command execution
 * Manages OpenAI API communication and tool execution
 */

import OpenAI from 'openai';
import { tools } from './automation-tools.js';
import { 
  updateTokenUsage, 
  resetCurrentTokenUsage, 
  addCommandResult,
  currentTokenUsage,
  getExecutionState,
  resetStopFlag
} from './command-queue.js';

/**
 * Execute a single command using OpenAI API
 * @param {string} command - The command to execute
 * @param {string} apiKey - OpenAI API key
 * @param {string} modelName - Model name to use
 * @param {Array} commandHistory - Command history array
 * @param {Function} buildApiMessages - Function to build API messages
 * @param {string} customSystemPrompt - Custom system prompt to append
 * @param {number} maxToolCalls - Maximum number of tool calls allowed
 * @param {number} maxTokens - Maximum number of tokens allowed
 */
export async function executeCommand(command, apiKey, modelName, commandHistory, buildApiMessages, customSystemPrompt = '', maxToolCalls = 50, maxTokens = 150000) {
  // Reset current command token usage
  resetCurrentTokenUsage();
  
  // Create OpenAI-compatible tools (without implementation)
  const openaiTools = tools.map(tool => ({
    type: tool.type,
    function: tool.function
  }));
  
  // Create a single command execution record that will be updated throughout execution
  const commandRecord = {
    type: 'command_execution',
    command: command,
    status: 'executing',
    startTime: new Date().toLocaleTimeString(),
    toolCalls: [],
    toolResults: [],
    responses: [],
    tokenUsage: { input: 0, output: 0, total: 0 },
    error: null,
    completedAt: null
  };
  
  // Add the command record to history
  commandHistory.push(commandRecord);

  try {
    if (!apiKey) {
      throw new Error('Please configure your API key in settings');
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });    // Build messages for API with system prompt
    const baseSystemPrompt = `You are a web automation assistant. You have access to tools to navigate websites, analyze page content, click elements, fill forms, and extract data.

IMPORTANT WORKFLOW:
1. Start by calling NavigateToUrl if you need to go to a specific website
2. Google and Bing are your friend. When you are not sure how to navigate to a page, use Google or Bing to search for it
3. The HTML returned by tools includes element IDs that can be used to interact with page elements
4. Use ClickElement(id) and InputText(id, text) to interact with page elements
5. Use GetAbsoluteUrlFromElement(ids) to extract absolute URLs and names from link elements - useful for collecting navigation targets or data extraction
6. Use GoBack if you need to navigate back
7. Do not use NavigateToUrl unless you cannot navigate to the page using the current context  
8. When you have completed the task, call Done(data) with the requested data

SEQUENTIAL EXECUTION:
- Tools are executed one at a time in the order you call them
- Each tool waits for the previous one to complete before starting
- Navigation and page changes include automatic wait times for page loading
- Always get fresh page HTML after navigation or major page changes

ELEMENT INTERACTION:
- Elements in the HTML have ID attributes (numbers) for interaction
- Only interact with elements that have ID attributes
- Always get fresh page HTML after navigation or major page changes
- GetAbsoluteUrlFromElement can extract URLs from multiple link elements at once

DATA EXTRACTION:
- Extract data systematically and structure it properly
- When done, call Done() with a JSON object containing the requested data
- IMPORTANT: Only call Done() when you have successfully extracted the requested data
- Do NOT call Done() with null or empty data - if extraction fails, continue trying or use other tools
- Be thorough and accurate in data extraction

USING THE Done() FUNCTION:
- Format: Done({data: yourExtractedData})
- Example: Done({data: [{"title": "Article Title", "url": "https://example.com"}]})
- Only call Done() once you have the complete data requested by the user
- If you cannot extract data, continue working with other tools instead of calling Done()

Complete the following task: ${command}`;

    const systemPrompt = customSystemPrompt.trim() 
      ? `${baseSystemPrompt}\n\nADDITIONAL INSTRUCTIONS:\n${customSystemPrompt.trim()}`
      : baseSystemPrompt;

    let apiMessages = [
      {
        role: 'system',        
        content: systemPrompt
      },
      ...buildApiMessages()
    ];// Track current tool calls for command log
      // Make initial API call with tools
    let response = await openai.chat.completions.create({
      model: modelName,
      messages: apiMessages,
      tools: openaiTools,
      parallel_tool_calls: false, // Ensure sequential execution
      tool_choice: 'required' // Always use a tool
    });// Track token usage from initial response
    if (response.usage) {
      updateTokenUsage(response.usage, commandRecord);
    }    let assistantMessage = response.choices[0].message;
    let maxIterations = Math.min(maxToolCalls, 50); // Use the smaller of maxToolCalls or 50
    let iterations = 0;    // Handle tool calls if present
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && iterations < maxIterations) {
      iterations++;
      
      // Check if command should be stopped
      const executionState = getExecutionState();
      if (executionState.shouldStop) {
        resetStopFlag();
        commandRecord.status = 'stopped';
        commandRecord.error = 'Command stopped by user';
        commandRecord.completedAt = new Date().toLocaleTimeString();
        
        addCommandResult({
          command: command,
          status: 'stopped',
          error: 'Command stopped by user',
          data: null,
          commandHistory: commandHistory,
          tokenUsage: { ...currentTokenUsage.value }
        });
        return;
      }
      
      // Check token limit before continuing
      if (currentTokenUsage.value.total >= maxTokens) {
        throw new Error(`Token limit reached (${maxTokens}). Current usage: ${currentTokenUsage.value.total} tokens`);
      }
      
      // Add tool calls to command record
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        commandRecord.toolCalls.push({
          name: toolCall.function.name,
          args: args,
          id: toolCall.id,
          timestamp: new Date().toLocaleTimeString()
        });
      }
        // Execute tool calls sequentially (one at a time)
      const toolCallResults = [];
      for (let i = 0; i < assistantMessage.tool_calls.length; i++) {
        const toolCall = assistantMessage.tool_calls[i];
        
        // Check if command should be stopped before each tool execution
        const executionState = getExecutionState();
        if (executionState.shouldStop) {
          resetStopFlag();
          commandRecord.status = 'stopped';
          commandRecord.error = 'Command stopped by user';
          commandRecord.completedAt = new Date().toLocaleTimeString();
          
          addCommandResult({
            command: command,
            status: 'stopped',
            error: 'Command stopped by user',
            data: null,
            commandHistory: commandHistory,
            tokenUsage: { ...currentTokenUsage.value }
          });
          return;
        }
          try {
          const args = JSON.parse(toolCall.function.arguments);
          const tool = tools.find(t => t.function.name === toolCall.function.name);
          
          if (tool && tool.implementation) {
            console.log(`[${i + 1}/${assistantMessage.tool_calls.length}] Executing tool: ${toolCall.function.name}`, args);
            // Ensure sequential execution by awaiting each tool call
            const result = await tool.implementation(args);// Check if this is a completion signal
            if (typeof result === 'string' && result.includes('COMMAND_COMPLETE')) {
              try {
                const completionData = JSON.parse(result);
                console.log('Command completion detected, parsed data:', completionData);
                console.log('Extracted data field:', completionData.data);
                
                // Update command record with completion
                commandRecord.status = 'completed';
                commandRecord.completedAt = new Date().toLocaleTimeString();
                commandRecord.toolResults.push({
                  tool_call_id: toolCall.id,
                  role: 'tool',
                  content: String(result),
                  timestamp: new Date().toLocaleTimeString()
                });
                
                // Mark command as completed with the actual extracted data
                // Never store the COMMAND_COMPLETE wrapper, only the actual data
                const actualData = completionData.data;
                addCommandResult({
                  command: command,
                  status: 'completed',
                  error: null,
                  data: actualData,
                  commandHistory: [...commandHistory],
                  tokenUsage: { ...currentTokenUsage.value }
                });
                
                // Don't call processNextCommand here - let the queue service handle it
                return;
              } catch (parseError) {
                console.error('Failed to parse completion data:', parseError);
                // Fall through to regular tool result handling
              }
            }
            
            // Add regular tool result to command record
            const toolResult = {
              tool_call_id: toolCall.id,
              role: 'tool',
              content: String(result),
              timestamp: new Date().toLocaleTimeString()
            };
            commandRecord.toolResults.push(toolResult);
            
            toolCallResults.push(toolResult);          } else {
            const errorResult = {
              tool_call_id: toolCall.id,
              role: 'tool',
              content: `Error: Unknown tool ${toolCall.function.name}`,
              timestamp: new Date().toLocaleTimeString()
            };
            commandRecord.toolResults.push(errorResult);
            toolCallResults.push(errorResult);
          }
        } catch (error) {
          console.error(`Error executing tool ${toolCall.function.name}:`, error);
          const errorResult = {
            tool_call_id: toolCall.id,
            role: 'tool',
            content: `Error: ${error.message}`,
            timestamp: new Date().toLocaleTimeString()
          };
          commandRecord.toolResults.push(errorResult);
          toolCallResults.push(errorResult);
        }
      }
      
      // Update API messages and continue conversation
      apiMessages.push({
        role: 'assistant',
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls
      });
      
      apiMessages.push(...toolCallResults);      // Get next response from OpenAI
      response = await openai.chat.completions.create({
        model: modelName,
        messages: apiMessages,
        tools: openaiTools,
        parallel_tool_calls: false, // Ensure sequential execution
        tool_choice: 'required' // Always use a tool
      });// Track token usage from follow-up response
      if (response.usage) {
        updateTokenUsage(response.usage, commandRecord);
      }

      assistantMessage = response.choices[0].message;
    }

    // Final assistant response (no more tool calls)
    if (assistantMessage.content) {
      commandRecord.responses.push({
        content: assistantMessage.content,
        timestamp: new Date().toLocaleTimeString()
      });
    }

    // Update command record as completed
    commandRecord.status = 'completed';
    commandRecord.completedAt = new Date().toLocaleTimeString();    // If we get here without a Done() call, mark as completed anyway
    addCommandResult({
      command: command,
      status: 'completed',
      error: null,
      data: assistantMessage.content || 'Command completed',
      commandHistory: [...commandHistory],
      tokenUsage: { ...currentTokenUsage.value }
    });

    // Don't call processNextCommand here - let the queue service handle it
  } catch (error) {
    console.error('Error executing command:', error);
    
    // Update command record with error
    commandRecord.status = 'failed';
    commandRecord.error = error.message;
    commandRecord.completedAt = new Date().toLocaleTimeString();    // Mark command as failed
    addCommandResult({
      command: command,
      status: 'failed',
      error: error.message,
      data: null,
      commandHistory: [...commandHistory],
      tokenUsage: { ...currentTokenUsage.value }
    });

    // Don't call processNextCommand here - let the queue service handle it
  }
}