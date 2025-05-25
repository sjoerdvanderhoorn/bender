// filepath: c:\Users\sjoer\Desktop\bender\src\services\command-queue.js

/**
 * Command Queue Service - Manages the processing of multiple commands
 * Handles command execution, status tracking, and result collection
 * 
 * NEW FEATURES:
 * - Stop current command: Stops the currently executing command and moves to the next
 * - Pause execution: Pauses the entire command queue execution
 * - Resume execution: Resumes paused command queue execution
 */

import { ref } from 'vue';

// Command queue state
export const commandQueue = ref('');
export const currentCommands = ref([]);
export const currentCommandIndex = ref(0);
export const commandResults = ref([]);
export const isProcessingCommands = ref(false);
export const showResults = ref(false);
export const expandedCommands = ref(new Set());

// Execution control state
export const isPaused = ref(false);
export const shouldStopCurrent = ref(false);

// Token usage tracking
export const currentTokenUsage = ref({ input: 0, output: 0, total: 0 });
export const totalTokenUsage = ref({ input: 0, output: 0, total: 0 });

// Store the execute command function for processing subsequent commands
let storedExecuteCommandFn = null;

/**
 * Start processing a queue of commands
 * @param {string} commandQueueText - Newline-separated list of commands
 * @param {Function} executeCommandFn - Function to execute individual commands
 */
export function startCommandQueue(commandQueueText, executeCommandFn) {
  if (!commandQueueText.trim()) return;
  
  const commands = commandQueueText
    .split('\n')
    .map(cmd => cmd.trim())
    .filter(cmd => cmd.length > 0);
  
  if (commands.length === 0) return;
  
  currentCommands.value = commands;
  currentCommandIndex.value = 0;
  commandResults.value = [];
  isProcessingCommands.value = true;
  
  // Reset token usage for new queue
  totalTokenUsage.value = { input: 0, output: 0, total: 0 };
  
  // Store the execute command function
  storedExecuteCommandFn = executeCommandFn;
  
  processNextCommand(executeCommandFn);
}

/**
 * Process the next command in the queue
 * @param {Function} executeCommandFn - Function to execute individual commands
 */
export async function processNextCommand(executeCommandFn) {
  // Check if execution is paused
  if (isPaused.value) {
    return; // Exit without processing, resumeExecution will call this again
  }
  
  if (currentCommandIndex.value >= currentCommands.value.length) {
    // All commands completed
    isProcessingCommands.value = false;
    showResults.value = true;
    return;
  }
  
  const currentCommand = currentCommands.value[currentCommandIndex.value];
  
  try {
    await executeCommandFn(currentCommand);
  } catch (error) {
    // Mark command as failed and move to next
    commandResults.value.push({
      command: currentCommand,
      status: 'failed',
      error: error.message,
      data: null,
      commandHistory: [],
      tokenUsage: { ...currentTokenUsage.value }
    });
    
    currentCommandIndex.value++;
    setTimeout(() => processNextCommand(executeCommandFn), 1000);
  }
}

/**
 * Update token usage tracking
 * @param {Object} usage - Token usage object from OpenAI API
 * @param {Object} commandRecord - Command record object to update
 */
export function updateTokenUsage(usage, commandRecord) {
  if (usage) {
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || (inputTokens + outputTokens);
    
    // Update current command token usage
    currentTokenUsage.value.input += inputTokens;
    currentTokenUsage.value.output += outputTokens;
    currentTokenUsage.value.total += totalTokens;
    
    // Update total session token usage
    totalTokenUsage.value.input += inputTokens;
    totalTokenUsage.value.output += outputTokens;
    totalTokenUsage.value.total += totalTokens;
    
    // Update the command record's token usage
    if (commandRecord) {
      commandRecord.tokenUsage.input += inputTokens;
      commandRecord.tokenUsage.output += outputTokens;
      commandRecord.tokenUsage.total += totalTokens;
    }
  }
}

/**
 * Reset token usage for a new command
 */
export function resetCurrentTokenUsage() {
  currentTokenUsage.value = { input: 0, output: 0, total: 0 };
}

/**
 * Add a command result to the results array
 * @param {Object} result - Command result object
 */
export function addCommandResult(result) {
  // Check if this is a retry completion - find existing result and update it
  const existingResultIndex = commandResults.value.findIndex(
    (r, index) => r.command === result.command && r.status === 'retrying'
  );
  
  if (existingResultIndex !== -1) {
    // This is a retry completion - update the existing result
    const existingResult = commandResults.value[existingResultIndex];
    
    // Merge the data if both have data
    if (result.data !== null && result.data !== undefined) {
      if (existingResult.data !== null && existingResult.data !== undefined) {
        // Both have data - merge them
        if (Array.isArray(existingResult.data) && Array.isArray(result.data)) {
          // Both are arrays - concatenate
          existingResult.data = [...existingResult.data, ...result.data];
        } else if (Array.isArray(existingResult.data)) {
          // Existing is array, new is not - push new data
          existingResult.data.push(result.data);
        } else if (Array.isArray(result.data)) {
          // New is array, existing is not - unshift existing data
          result.data.unshift(existingResult.data);
          existingResult.data = result.data;
        } else {
          // Both are objects/primitives - create array
          existingResult.data = [existingResult.data, result.data];
        }
      } else {
        // Only new result has data
        existingResult.data = result.data;
      }
    }
    
    // Update other fields
    existingResult.status = result.status;
    existingResult.error = result.error;
    existingResult.commandHistory = [...(existingResult.commandHistory || []), ...(result.commandHistory || [])];
    existingResult.tokenUsage.input += result.tokenUsage.input || 0;
    existingResult.tokenUsage.output += result.tokenUsage.output || 0;
    existingResult.tokenUsage.total += result.tokenUsage.total || 0;
    
    // Don't increment currentCommandIndex for retries
    return;
  }
    // Normal case - add new result
  commandResults.value.push(result);
  currentCommandIndex.value++;
  
  // Automatically process the next command if there are more commands and not paused
  if (storedExecuteCommandFn && !isPaused.value) {
    setTimeout(() => processNextCommand(storedExecuteCommandFn), 1000);
  }
}

/**
 * Clear the command queue and reset state
 */
export function clearCommandQueue() {
  commandQueue.value = '';
  currentCommands.value = [];
  currentCommandIndex.value = 0;
  commandResults.value = [];
  isProcessingCommands.value = false;
  showResults.value = false;
  expandedCommands.value = new Set();
  totalTokenUsage.value = { input: 0, output: 0, total: 0 };
  currentTokenUsage.value = { input: 0, output: 0, total: 0 };
  storedExecuteCommandFn = null;
  isPaused.value = false;
  shouldStopCurrent.value = false;
}

/**
 * Stop the current command and continue with the next
 */
export function stopCurrentCommand() {
  shouldStopCurrent.value = true;
}

/**
 * Pause command execution
 */
export function pauseExecution() {
  isPaused.value = true;
}

/**
 * Resume command execution
 */
export function resumeExecution() {
  isPaused.value = false;
  
  // If we have a stored execute function and are currently processing, continue
  if (storedExecuteCommandFn && isProcessingCommands.value) {
    setTimeout(() => processNextCommand(storedExecuteCommandFn), 100);
  }
}

/**
 * Check if execution should be stopped or paused
 * @returns {Object} - Object with stop and pause flags
 */
export function getExecutionState() {
  return {
    shouldStop: shouldStopCurrent.value,
    isPaused: isPaused.value
  };
}

/**
 * Reset the stop flag (used after stopping current command)
 */
export function resetStopFlag() {
  shouldStopCurrent.value = false;
}

/**
 * Retry a specific failed or stopped command
 * @param {number} commandIndex - Index of the command to retry
 * @param {Function} executeCommandFn - Function to execute the command
 */
export async function retryCommand(commandIndex, executeCommandFn) {
  if (commandIndex < 0 || commandIndex >= commandResults.value.length) {
    console.error('Invalid command index for retry');
    return;
  }
  
  const commandResult = commandResults.value[commandIndex];
  if (commandResult.status !== 'failed' && commandResult.status !== 'stopped') {
    console.warn('Can only retry failed or stopped commands');
    return;
  }
  
  console.log(`Retrying command: ${commandResult.command}`);
  
  // Update the command result to show it's being retried
  commandResult.status = 'retrying';
  commandResult.error = null;
  
  try {
    // Reset token usage for the retry
    resetCurrentTokenUsage();
    
    // Execute the command again
    await executeCommandFn(commandResult.command);
  } catch (error) {
    console.error('Error retrying command:', error);
    // Restore failed status if retry also fails
    commandResult.status = 'failed';
    commandResult.error = error.message;
  }
}