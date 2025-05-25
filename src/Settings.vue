<template>
  <div class="modal show d-block" tabindex="-1" role="dialog">
    <div class="modal-dialog" role="document">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Settings</h5>
          <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')"></button>
        </div>        <div class="modal-body">
          <div class="mb-3">
            <label for="llmSelect" class="form-label">LLM</label>
            <select id="llmSelect" class="form-select" v-model="selectedLLM">
              <option v-for="llm in llms" :key="llm.value" :value="llm.value">{{ llm.label }}</option>
            </select>
          </div>
          <div class="mb-3">
            <label for="apiKey" class="form-label">API Key</label>
            <input id="apiKey" type="text" class="form-control" v-model="apiKey" />
          </div>          <div class="mb-3">
            <label for="customSystemPrompt" class="form-label">Custom System Prompt</label>
            <textarea 
              id="customSystemPrompt" 
              class="form-control" 
              v-model="customSystemPrompt" 
              rows="4"
              placeholder="Add custom instructions that will be appended to the default system prompt..."
            ></textarea>
            <div class="form-text">This text will be added to the end of the default system prompt sent to ChatGPT.</div>
          </div>
          <div class="mb-3">
            <label for="maxToolCalls" class="form-label">Max Tool Calls (per command)</label>
            <input 
              id="maxToolCalls" 
              type="number" 
              class="form-control" 
              v-model.number="maxToolCalls" 
              min="1" 
              max="100"
            />
            <div class="form-text">Maximum number of tool calls allowed per command (default: 50).</div>
          </div>
          <div class="mb-3">
            <label for="maxTokens" class="form-label">Max Tokens (per command)</label>
            <input 
              id="maxTokens" 
              type="number" 
              class="form-control" 
              v-model.number="maxTokens" 
              min="1000" 
              max="500000" 
              step="1000"
            />
            <div class="form-text">Maximum number of tokens allowed per command (default: 150,000).</div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" @click="saveSettings">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps(['modelValue']);
const emit = defineEmits(['close', 'saved']);

const llms = [
  { label: 'OpenAI (gpt-4o)', value: 'gpt-4o' },
  { label: 'OpenAI (gpt-4.1-mini)', value: 'gpt-4.1-mini' },
  { label: 'OpenAI (gpt-4.1-nano)', value: 'gpt-4.1-nano' },
  { label: 'OpenAI (gpt-4o-mini)', value: 'gpt-4o-mini' }
];

const selectedLLM = ref('openai');
const apiKey = ref('');
const customSystemPrompt = ref('');
const maxToolCalls = ref(50);
const maxTokens = ref(150000);

onMounted(async () => {
  const result = await chrome.storage.sync.get(['llm', 'apiKey', 'customSystemPrompt', 'maxToolCalls', 'maxTokens']);
  if (result.llm) selectedLLM.value = result.llm;
  if (result.apiKey) apiKey.value = result.apiKey;
  if (result.customSystemPrompt) customSystemPrompt.value = result.customSystemPrompt;
  if (result.maxToolCalls !== undefined) maxToolCalls.value = result.maxToolCalls;
  if (result.maxTokens !== undefined) maxTokens.value = result.maxTokens;
});

function saveSettings() {
  chrome.storage.sync.set({ 
    llm: selectedLLM.value, 
    apiKey: apiKey.value, 
    customSystemPrompt: customSystemPrompt.value || '',
    maxToolCalls: maxToolCalls.value || 50,
    maxTokens: maxTokens.value || 150000
  }, () => {
    emit('saved', { 
      llm: selectedLLM.value, 
      apiKey: apiKey.value, 
      customSystemPrompt: customSystemPrompt.value || '',
      maxToolCalls: maxToolCalls.value || 50,
      maxTokens: maxTokens.value || 150000
    });
    emit('close');
  });
}
</script>

<style scoped>
.modal {
  background: rgba(0,0,0,0.3);
}
</style>
