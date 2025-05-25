// src/store.js
import { ref } from 'vue';

export const llm = ref('openai');
export const apiKey = ref('');
export const customSystemPrompt = ref('');
export const maxToolCalls = ref(50);
export const maxTokens = ref(150000);

export async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['llm', 'apiKey', 'customSystemPrompt', 'maxToolCalls', 'maxTokens'], (result) => {
      if (result.llm) llm.value = result.llm;
      if (result.apiKey) apiKey.value = result.apiKey;
      if (result.customSystemPrompt) customSystemPrompt.value = result.customSystemPrompt;
      if (result.maxToolCalls !== undefined) maxToolCalls.value = result.maxToolCalls;
      if (result.maxTokens !== undefined) maxTokens.value = result.maxTokens;
      resolve();
    });
  });
}

export function saveSettings(newLLM, newApiKey, newCustomSystemPrompt, newMaxToolCalls, newMaxTokens) {
  llm.value = newLLM;
  apiKey.value = newApiKey;
  customSystemPrompt.value = newCustomSystemPrompt || '';
  maxToolCalls.value = newMaxToolCalls || 50;
  maxTokens.value = newMaxTokens || 150000;
  chrome.storage.sync.set({ 
    llm: newLLM, 
    apiKey: newApiKey, 
    customSystemPrompt: newCustomSystemPrompt || '',
    maxToolCalls: newMaxToolCalls || 50,
    maxTokens: newMaxTokens || 150000
  });
}
