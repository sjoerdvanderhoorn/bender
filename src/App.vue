<script setup>
import 'bootstrap/dist/css/bootstrap.min.css';
import { ref, onMounted, nextTick, computed } from 'vue';
import Settings from './Settings.vue';
import Developer from './Developer.vue';
import { llm, apiKey, customSystemPrompt, maxToolCalls, maxTokens, loadSettings, saveSettings } from './store.js';
import { tools } from './services/automation-tools.js';
import {
  commandQueue,
  currentCommands,
  currentCommandIndex,
  commandResults,
  isProcessingCommands,
  showResults,
  expandedCommands,
  currentTokenUsage,
  totalTokenUsage,
  isPaused,
  startCommandQueue as startQueue,
  clearCommandQueue,
  retryCommand,
  stopCurrentCommand,
  pauseExecution,
  resumeExecution
} from './services/command-queue.js';
import { executeCommand } from './services/command-executor.js';

const showSettings = ref(false);
const showDeveloper = ref(false);
const commandHistory = ref([]);
const loading = ref(false);

// Computed property to get unified data from all command results
const unifiedData = computed(() => {
  const data = [];
  
  commandResults.value.forEach(result => {
    if (result.data !== null && result.data !== undefined) {
      if (Array.isArray(result.data)) {
        // If data is already an array, spread it into the unified array
        data.push(...result.data);
      } else {
        // If data is not an array, add it as a single item
        data.push(result.data);
      }
    }
  });
  
  return data;
});

onMounted(async () => {
  await loadSettings();
});

// Helper function to get the actual model name for the API
function getModelName(modelValue) {
  // Map the stored model values to actual OpenAI model names
  const modelMap = {
    'gpt-4o': 'gpt-4o',
    'gpt-4.1-mini': 'gpt-4o-mini', // Map to actual model name
    'gpt-4.1-nano': 'gpt-4o-mini', // Map to actual model name  
    'gpt-4o-mini': 'gpt-4o-mini',
    'openai': 'gpt-4o' // Default fallback
  };

  return modelMap[modelValue] || 'gpt-4o';
}

// Helper function to format token counts in thousands
function formatTokenCount(count) {
  if (count === 0) return '0';
  const thousands = Math.ceil(count / 1000);
  return `${thousands}K`;
}

// Command queue functions
function startCommandQueue() {
  if (!commandQueue.value.trim()) return;

  // Clear command history for new queue
  commandHistory.value = [];
  // Start the queue using the service
  startQueue(commandQueue.value, (command) => {
    // Clear command history for new command
    commandHistory.value = [];
    return executeCommand(
      command,
      apiKey.value,
      getModelName(llm.value),
      commandHistory.value,
      buildApiMessages,
      customSystemPrompt.value,
      maxToolCalls.value,
      maxTokens.value
    );
  });
}

// Retry a failed or stopped command
async function retryCommandLocal(commandIndex) {
  if (isProcessingCommands.value) {
    console.warn('Cannot retry while commands are processing');
    return;
  }
  
  await retryCommand(commandIndex, (command) => {
    // Clear command history for retry
    commandHistory.value = [];
    return executeCommand(
      command,
      apiKey.value,
      getModelName(llm.value),
      commandHistory.value,
      buildApiMessages,
      customSystemPrompt.value,
      maxToolCalls.value,
      maxTokens.value
    );
  });
}

// Helper function to build API messages from command history
function buildApiMessages() {
  const messages = [];

  // Find the command execution record
  const commandRecord = commandHistory.value.find(entry => entry.type === 'command_execution');
  if (!commandRecord) return messages;

  // Add initial command as user message
  messages.push({
    role: 'user',
    content: commandRecord.command
  });

  // Process tool calls and results
  const toolCallsGrouped = {};

  // Group tool calls by their order of appearance
  commandRecord.toolCalls.forEach(toolCall => {
    if (!toolCallsGrouped[toolCall.timestamp]) {
      toolCallsGrouped[toolCall.timestamp] = [];
    }
    toolCallsGrouped[toolCall.timestamp].push(toolCall);
  });

  // Process each group of tool calls
  Object.keys(toolCallsGrouped).sort().forEach(timestamp => {
    const toolCalls = toolCallsGrouped[timestamp];

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.args)
        }
      }))
    });

    // Add corresponding tool results
    toolCalls.forEach(toolCall => {
      const result = commandRecord.toolResults.find(tr => tr.tool_call_id === toolCall.id);
      if (result) {
        messages.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.content
        });
      }
    });
  });

  // Add any final responses
  commandRecord.responses.forEach(response => {
    messages.push({
      role: 'assistant',
      content: response.content
    });
  });

  return messages;
}

// Copy results to clipboard
function copyResults() {
  const resultsData = commandResults.value.map(result => ({
    command: result.command,
    status: result.status,
    data: result.data,
    error: result.error,
    tokenUsage: result.tokenUsage
  }));

  navigator.clipboard.writeText(JSON.stringify(resultsData, null, 2))
    .then(() => {
      alert('Results copied to clipboard!');
    })
    .catch(err => {
      console.error('Failed to copy results:', err);
      alert('Failed to copy results to clipboard');
    });
}

// Copy only data from all commands as a unified array
function copyData() {
  navigator.clipboard.writeText(JSON.stringify(unifiedData.value, null, 2))
    .then(() => {
      alert('Data copied to clipboard!');
    })
    .catch(err => {
      console.error('Failed to copy data:', err);
      alert('Failed to copy data to clipboard');
    });
}

// Toggle command result visibility
function toggleCommandResult(index) {
  if (expandedCommands.value.has(index)) {
    expandedCommands.value.delete(index);
  } else {
    expandedCommands.value.add(index);
  }
}

// Function called when settings are saved
function onSettingsSaved() {
  showSettings.value = false;
}
</script>

<template>
  <div class="container mt-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4>Bender browser automation</h4>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-warning btn-sm" @click="showDeveloper = true">
          🛠️ Development
        </button>
        <button class="btn btn-outline-secondary btn-sm" @click="showSettings = true">Settings</button>
      </div>
    </div>

    <!-- Command Queue Section -->
    <div class="mb-4" v-if="!isProcessingCommands">
      <div>
        <h5><label for="commandQueue">🤖 Commands</label></h5>
      </div>
      <textarea id="commandQueue" v-model="commandQueue" class="form-control mb-2" rows="6"
        placeholder="Enter commands, one per line:&#10;Go to https://news.ycombinator.com and get the top 5 story titles with their URLs in JSON format.&#10;Find the address of a post office in Amsterdam."
        :disabled="isProcessingCommands || loading"></textarea>
      <button class="btn btn-success" @click="startCommandQueue"
        :disabled="!commandQueue.trim() || isProcessingCommands || loading">
        🚀 Start
      </button>
      <span v-if="totalTokenUsage.total > 0" class="small text-muted">
        <span class="badge bg-secondary ms-1">🪙{{ formatTokenCount(totalTokenUsage.total) }}</span>
      </span>
    </div>    
    
    <!-- Processing Status -->
    <div class="mb-3" v-if="isProcessingCommands">
      <div>
        <h5>{{ isPaused ? '⏸️ Paused' : '🔄 Processing Commands' }}</h5>
      </div>
      <div class="alert" :class="isPaused ? 'alert-warning' : 'alert-info'">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong v-if="currentCommands[currentCommandIndex]">
              {{ currentCommands[currentCommandIndex] }}
            </strong>
            <div class="small">
              Command {{ currentCommandIndex + 1 }} of {{ currentCommands.length }}
              <span v-if="isPaused" class="text-warning ms-2">⏸️ Execution paused</span>
            </div>
            <!-- Token Usage Display -->
            <div class="small mt-1" v-if="currentTokenUsage.total > 0">
              <span class="badge bg-secondary me-1">
                🪙 Tokens: {{ formatTokenCount(currentTokenUsage.input) }}↗ {{
                  formatTokenCount(currentTokenUsage.output) }}↘ {{ formatTokenCount(currentTokenUsage.total) }}⚡
              </span>
              <span class="badge bg-dark" v-if="totalTokenUsage.total > 0">
                Total: {{ formatTokenCount(totalTokenUsage.total) }}
              </span>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <div class="spinner-border text-info" role="status" v-if="!isPaused"></div>
          </div>
        </div>
      </div>
      <button class="btn btn-warning btn-sm" @click="stopCurrentCommand" title="Stop current command and continue with next">
        ⏹️ Stop
      </button>
      <button 
        class="btn btn-sm"
        :class="isPaused ? 'btn-success' : 'btn-secondary'"
        @click="isPaused ? resumeExecution() : pauseExecution()"
        :title="isPaused ? 'Resume execution' : 'Pause execution'"
      >
        {{ isPaused ? '▶️ Resume' : '⏸️ Pause' }}
      </button>
    </div>
    <div class="mb-4" v-if="(isProcessingCommands && commandHistory.length > 0) || commandResults.length > 0">      <div class="d-flex justify-content-between align-items-center mb-2">
        <div>
          <h5>🎯 Results</h5>
        </div>
        <div class="d-flex gap-2" v-if="commandResults.length > 0">
          <button class="btn btn-outline-primary btn-sm" @click="copyResults">
            📋 Copy Results
          </button>
        </div>
      </div>

      <div class="unified-command-section">
        <!-- Live Command Execution (during processing) -->
        <div v-if="isProcessingCommands && commandHistory.length > 0" v-for="(commandRecord, idx) in commandHistory"
          :key="`live-${idx}`" class="command-card mb-3">
          <div v-if="commandRecord.type === 'command_execution'">
            <div class="command-header" @click="toggleCommandResult(`live-${idx}`)">
              <div class="d-flex justify-content-between align-items-center p-3 bg-primary text-white rounded-top">
                <div class="flex-grow-1">
                  <div class="d-flex align-items-center gap-2 mb-1">                    <span :class="['badge',
                      commandRecord.status === 'completed' ? 'bg-success' :
                        commandRecord.status === 'failed' ? 'bg-danger' : 
                        commandRecord.status === 'stopped' ? 'bg-warning text-dark' :
                        commandRecord.status === 'retrying' ? 'bg-warning text-dark' : 'bg-warning text-dark']">
                      {{ commandRecord.status === 'completed' ? '✅' :
                        commandRecord.status === 'failed' ? '❌' : 
                        commandRecord.status === 'stopped' ? '⏹️' :
                        commandRecord.status === 'retrying' ? '🔄' : '⏳' }} {{ commandRecord.status }}
                    </span>
                    <span class="badge bg-info" v-if="commandRecord.toolCalls.length > 0">
                      🔧 {{ commandRecord.toolCalls.length }} tools
                    </span>
                    <span class="badge bg-secondary" v-if="commandRecord.tokenUsage.total > 0">
                      🪙 {{ formatTokenCount(commandRecord.tokenUsage.total) }}
                    </span>
                  </div>
                  <div class="fw-bold">{{ commandRecord.command.substring(0, 80) }}{{ commandRecord.command.length > 80
                    ? '...' : '' }}</div>
                  <div class="small opacity-75">{{ commandRecord.startTime }}</div>
                </div>
                <button class="btn btn-sm btn-outline-light">
                  {{ expandedCommands.has(`live-${idx}`) ? '▼' : '▶' }}
                </button>
              </div>
            </div>

            <div v-if="expandedCommands.has(`live-${idx}`)" class="command-content border border-top-0 rounded-bottom">
              <div class="p-3">
                <div class="mb-3">
                  <h6>Full Command:</h6>
                  <p class="small bg-light p-2 rounded mb-0">{{ commandRecord.command }}</p>
                </div>

                <!-- Tool Execution Details -->
                <div v-if="commandRecord.toolCalls.length > 0" class="mb-3">
                  <h6>Tool Executions:</h6>
                  <div v-for="toolCall in commandRecord.toolCalls" :key="toolCall.id" class="tool-execution-item mb-2">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                      <div>
                        <span class="badge bg-info me-2">{{ toolCall.name }}</span>
                        <span class="small text-muted">{{ toolCall.timestamp }}</span>
                      </div>
                      <button class="btn btn-outline-secondary btn-sm"
                        @click="toggleCommandResult(`tool-${idx}-${toolCall.id}`)">
                        {{ expandedCommands.has(`tool-${idx}-${toolCall.id}`) ? '▼' : '▶' }} Details
                      </button>
                    </div>

                    <div v-if="expandedCommands.has(`tool-${idx}-${toolCall.id}`)"
                      class="tool-details bg-light p-2 rounded">
                      <div class="mb-2" v-if="toolCall.args?.reasonForAction">
                        <strong class="small">Reason for action:</strong>
                        <pre class="small mb-2 mt-1">{{ toolCall.args?.reasonForAction }}</pre>
                      </div>
                      
                      <div class="mb-2">
                        <strong class="small">Parameters:</strong>
                          <pre class="small mb-2 mt-1">{{
                            JSON.stringify(
                              Object.fromEntries(
                                Object.entries(toolCall.args || {}).filter(([key]) => key !== 'reasonForAction')
                              ),
                              null,
                              2
                            )
                          }}</pre>
                      </div>

                      <div v-if="commandRecord.toolResults.find(tr => tr.tool_call_id === toolCall.id)">
                        <strong class="small">Output:</strong>
                        <pre
                          class="small mb-0 mt-1">{{commandRecord.toolResults.find(tr => tr.tool_call_id === toolCall.id).content}}</pre>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Final Responses -->
                <div v-if="commandRecord.responses.length > 0" class="mb-3">
                  <h6>Responses:</h6>
                  <div v-for="response in commandRecord.responses" :key="response.timestamp"
                    class="response-item bg-success bg-opacity-10 p-2 rounded mb-2">
                    <div class="small text-muted mb-1">{{ response.timestamp }}</div>
                    <div>{{ response.content }}</div>
                  </div>
                </div>

                <!-- Token Usage -->
                <div v-if="commandRecord.tokenUsage.total > 0" class="mb-3">
                  <h6>Token Usage:</h6>
                  <div class="d-flex gap-2 flex-wrap">
                    <span class="badge bg-primary">Input: {{ formatTokenCount(commandRecord.tokenUsage.input) }}</span>
                    <span class="badge bg-success">Output: {{ formatTokenCount(commandRecord.tokenUsage.output)
                      }}</span>
                    <span class="badge bg-secondary">Total: {{ formatTokenCount(commandRecord.tokenUsage.total)
                      }}</span>
                  </div>
                </div>

                <!-- Error Display -->
                <div v-if="commandRecord.error" class="alert alert-danger">
                  <strong>Error:</strong> {{ commandRecord.error }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Completed Commands (from results) -->
        <div v-for="(result, idx) in commandResults" :key="`result-${idx}`" class="command-card mb-3">
          <div class="command-header" @click="toggleCommandResult(`result-${idx}`)">            <div class="d-flex justify-content-between align-items-center p-3 rounded-top"
              :class="result.status === 'completed' ? 'bg-success text-white' : 
                       result.status === 'stopped' ? 'bg-warning text-dark' :
                       result.status === 'retrying' ? 'bg-warning text-dark' : 'bg-danger text-white'">
              <div class="flex-grow-1">
                <div class="d-flex align-items-center gap-2 mb-1">
                  <span class="badge bg-light text-dark">
                    {{ result.status === 'completed' ? '✅' : 
                       result.status === 'stopped' ? '⏹️' :
                       result.status === 'retrying' ? '🔄' : '❌' }} {{ result.status }}
                  </span>
                  <span class="badge bg-info"
                    v-if="result.commandHistory && result.commandHistory.some(ch => ch.toolCalls && ch.toolCalls.length > 0)">
                    🔧 {{result.commandHistory.reduce((total, ch) => total + (ch.toolCalls ? ch.toolCalls.length : 0),
                    0) }} tools
                  </span>
                  <span class="badge bg-secondary" v-if="result.tokenUsage && result.tokenUsage.total > 0">
                    🪙 {{ formatTokenCount(result.tokenUsage.total) }}
                  </span>
                </div>
                <div class="fw-bold">{{ result.command.substring(0, 80) }}{{ result.command.length > 80 ? '...' : '' }}
                </div>
              </div>
              <button class="btn btn-sm btn-outline-light">
                {{ expandedCommands.has(`result-${idx}`) ? '▼' : '▶' }}
              </button>
            </div>
          </div>

          <div v-if="expandedCommands.has(`result-${idx}`)" class="command-content border border-top-0 rounded-bottom">
            <div class="p-3">
              <div class="mb-3">
                <h6>Command:</h6>
                <p class="small bg-light p-2 rounded">{{ result.command }}</p>
              </div>              <div class="mb-3" v-if="(result.status === 'failed' || result.status === 'stopped') && result.error">
                <h6>{{ result.status === 'stopped' ? 'Stopped' : 'Error' }}:</h6>
                <div class="alert small" :class="result.status === 'stopped' ? 'alert-warning' : 'alert-danger'">
                  {{ result.error }}
                </div>                <button 
                  v-if="result.status === 'failed' || result.status === 'stopped'"
                  class="btn btn-warning btn-sm" 
                  @click="retryCommandLocal(idx)"
                  :disabled="isProcessingCommands"
                >
                  🔄 Retry Command
                </button>
              </div>

              <div class="mb-3" v-if="result.data">
                <h6>Data:</h6>
                <pre class="small bg-light p-2 rounded overflow-auto"
                  style="max-height: 200px;">{{ JSON.stringify(result.data, null, 2) }}</pre>
              </div>
              <div class="mb-3" v-if="result.tokenUsage && result.tokenUsage.total > 0">
                <h6>Token Usage:</h6>
                <div class="d-flex gap-2 flex-wrap">
                  <span class="badge bg-primary">Input: {{ formatTokenCount(result.tokenUsage.input) }}</span>
                  <span class="badge bg-success">Output: {{ formatTokenCount(result.tokenUsage.output) }}</span>
                  <span class="badge bg-secondary">Total: {{ formatTokenCount(result.tokenUsage.total) }}</span>
                </div>
              </div>

              <!-- Tool Execution Details (matching live view) -->
              <div v-if="result.commandHistory && result.commandHistory.length > 0" class="mb-3">
                <div v-for="(commandRecord, entryIdx) in result.commandHistory" :key="entryIdx">
                  <div
                    v-if="commandRecord.type === 'command_execution' && commandRecord.toolCalls && commandRecord.toolCalls.length > 0">
                    <h6>Tool Executions:</h6>
                    <div v-for="toolCall in commandRecord.toolCalls" :key="toolCall.id"
                      class="tool-execution-item mb-2">
                      <div class="d-flex justify-content-between align-items-center mb-2">
                        <div>
                          <span class="badge bg-info me-2">{{ toolCall.name }}</span>
                          <span class="small text-muted">{{ toolCall.timestamp }}</span>
                        </div>
                        <button class="btn btn-outline-secondary btn-sm"
                          @click="toggleCommandResult(`completed-tool-${idx}-${entryIdx}-${toolCall.id}`)">
                          {{ expandedCommands.has(`completed-tool-${idx}-${entryIdx}-${toolCall.id}`) ? '▼' : '▶' }}
                          Details
                        </button>
                      </div>

                      <div v-if="expandedCommands.has(`completed-tool-${idx}-${entryIdx}-${toolCall.id}`)"
                        class="tool-details bg-light p-2 rounded">
                        
                        <div class="mb-2" v-if="toolCall.args?.reasonForAction">
                          <strong class="small">Reason for action:</strong>
                          <pre class="small mb-2 mt-1">{{ toolCall.args?.reasonForAction }}</pre>
                        </div>

                        <div class="mb-2">
                          <strong class="small">Parameters:</strong>
                          <pre class="small mb-2 mt-1">{{
                              JSON.stringify(
                                Object.fromEntries(
                                  Object.entries(toolCall.args || {}).filter(([key]) => key !== 'reasonForAction')
                                ),
                                null,
                                2
                              )
                            }}</pre>
                        </div>

                        <div
                          v-if="commandRecord.toolResults && commandRecord.toolResults.find(tr => tr.tool_call_id === toolCall.id)">
                          <strong class="small">Output:</strong>
                          <pre
                            class="small mb-0 mt-1">{{commandRecord.toolResults.find(tr => tr.tool_call_id === toolCall.id).content}}</pre>
                        </div>
                      </div>
                    </div>

                    <!-- Final Responses for completed commands -->
                    <div v-if="commandRecord.responses && commandRecord.responses.length > 0" class="mb-3">
                      <h6>Responses:</h6>
                      <div v-for="response in commandRecord.responses" :key="response.timestamp"
                        class="response-item bg-success bg-opacity-10 p-2 rounded mb-2">
                        <div class="small text-muted mb-1">{{ response.timestamp }}</div>
                        <div>{{ response.content }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>        </div>
      </div>
    </div>

    <!-- Data Section -->
    <div class="mb-4" v-if="unifiedData.length > 0">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div>
          <h5>📊 Data</h5>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-success btn-sm" @click="copyData">
            📊 Copy Data
          </button>
        </div>
      </div>

      <div class="data-section">
        <div class="alert alert-info">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div>
              <strong>{{ unifiedData.length }} item{{ unifiedData.length !== 1 ? 's' : '' }}</strong>
            </div>
            <span class="badge bg-primary">JSON Array</span>
          </div>
        </div>
        <pre class="data-preview bg-light p-3 rounded border overflow-auto" style="max-height: 300px;">{{ JSON.stringify(unifiedData, null, 2) }}</pre>
      </div>
    </div>

    <Settings v-if="showSettings" @close="showSettings = false" @saved="onSettingsSaved" />
    <Developer v-if="showDeveloper" @close="showDeveloper = false" />
  </div>
</template>

<style scoped>
.container {
  max-width: 500px;
}

/* Unified Command Section Styles */
.unified-command-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #dee2e6;
}

/* Data Section Styles */
.data-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #dee2e6;
}

.data-preview {
  font-size: 0.85rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.command-card {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.command-header {
  cursor: pointer;
  transition: all 0.2s ease;
}

.command-header:hover .bg-primary {
  background-color: #0056b3 !important;
}

.command-header:hover .bg-success {
  background-color: #157347 !important;
}

.command-header:hover .bg-danger {
  background-color: #bb2d3b !important;
}

.command-content {
  background: white;
}

.tool-execution-item {
  background: rgba(13, 202, 240, 0.1);
  border-radius: 6px;
  padding: 0.75rem;
  border-left: 3px solid #0dcaf0;
}

.tool-details {
  border-left: 2px solid #6c757d;
}

.response-item {
  border-left: 3px solid #198754;
}

.execution-log {
  background: rgba(248, 249, 250, 0.8);
  border-radius: 4px;
  padding: 0.5rem;
}

/* Legacy styles for backward compatibility */
.command-log {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #dee2e6;
  max-height: 400px;
  overflow-y: auto;
}

.command-entry {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e9ecef;
}

.command-entry:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.command-execution {
  background: rgba(13, 110, 253, 0.05);
  border-radius: 8px;
  padding: 1rem;
  border-left: 4px solid #0d6efd;
}

.response-item {
  background: rgba(25, 135, 84, 0.1);
  padding: 0.5rem;
  border-radius: 4px;
  border-left: 3px solid #198754;
  margin-top: 0.5rem;
}

.error-item {
  background: rgba(220, 53, 69, 0.1);
  padding: 0.5rem;
  border-radius: 4px;
  border-left: 3px solid #dc3545;
  margin-top: 0.5rem;
}

.tool-call-item {
  background: rgba(13, 202, 240, 0.1);
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  border-radius: 4px;
  border-left: 3px solid #0dcaf0;
}

.tool-parameters {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid #dee2e6;
}

.tool-results {
  margin-top: 0.5rem;
}

.tool-result-item {
  background: rgba(25, 135, 84, 0.1);
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  border-radius: 4px;
  border-left: 3px solid #198754;
}

.tool-output {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid #dee2e6;
}

.token-usage-item {
  background: rgba(255, 193, 7, 0.1);
  padding: 0.5rem;
  border-radius: 4px;
  border-left: 3px solid #ffc107;
  font-size: 0.9rem;
}

.token-usage-section {
  background: rgba(255, 193, 7, 0.05);
  border-radius: 6px;
  padding: 0.75rem;
  border: 1px solid rgba(255, 193, 7, 0.2);
}

.results-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #dee2e6;
}

.result-item {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  overflow: hidden;
}

.result-header {
  cursor: pointer;
  transition: background-color 0.2s;
}

.result-header:hover {
  background-color: #e9ecef !important;
}

.result-content {
  background: white;
}

.spinner-border-sm {
  width: 1rem;
  height: 1rem;
}

pre {
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
