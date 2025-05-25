<template>
    <div class="modal show d-block" tabindex="-1" role="dialog">
        <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">🛠️ Developer Tools</h5>
                    <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <p class="text-muted">Test automation tools individually. Click on a tool to expand and test it.
                        </p>
                    </div>

                    <!-- Tool Testing Sections -->
                    <div v-for="tool in tools" :key="tool.function.name" class="mb-3">
                        <div class="card">
                            <div class="card-header">
                                <button
                                    class="btn btn-link text-start w-100 d-flex justify-content-between align-items-center p-0"
                                    @click="toggleTool(tool.function.name)"
                                    :aria-expanded="expandedTools.has(tool.function.name)">
                                    <div>
                                        <strong>{{ tool.function.name }}</strong>
                                        <div class="small text-muted">{{ tool.function.description }}</div>
                                    </div>
                                    <span>{{ expandedTools.has(tool.function.name) ? '▼' : '▶' }}</span>
                                </button>
                            </div>

                            <div v-if="expandedTools.has(tool.function.name)" class="card-body">
                                <!-- Parameters Section -->
                                <div v-if="tool.function.parameters.required.length > 0" class="mb-3">
                                    <h6>Parameters:</h6>
                                    <div v-for="param in tool.function.parameters.required" :key="param" class="mb-2">
                                        <label :for="`param-${tool.function.name}-${param}`" class="form-label">
                                            {{ param }} <span class="text-danger">*</span>
                                        </label>
                                        <div class="small text-muted mb-1">
                                            {{ tool.function.parameters.properties[param]?.description }}
                                        </div>
                                        <input :id="`param-${tool.function.name}-${param}`"
                                            v-model="toolParams[tool.function.name][param]" type="text"
                                            class="form-control" :placeholder="`Enter ${param}...`" />
                                    </div>
                                </div>

                                <!-- Optional Parameters Section -->
                                <div v-if="hasOptionalParams(tool)" class="mb-3">
                                    <h6>Optional Parameters:</h6>
                                    <div v-for="param in getOptionalParams(tool)" :key="param" class="mb-2">
                                        <label :for="`param-${tool.function.name}-${param}`" class="form-label">
                                            {{ param }}
                                        </label>
                                        <div class="small text-muted mb-1">
                                            {{ tool.function.parameters.properties[param]?.description }}
                                        </div>
                                        <input :id="`param-${tool.function.name}-${param}`"
                                            v-model="toolParams[tool.function.name][param]" type="text"
                                            class="form-control" :placeholder="`Enter ${param}...`" />
                                    </div>
                                </div>

                                <!-- No Parameters Message -->
                                <div v-if="tool.function.parameters.required.length === 0 && !hasOptionalParams(tool)"
                                    class="mb-3">
                                    <div class="alert alert-info">
                                        This tool requires no parameters.
                                    </div>
                                </div>

                                <!-- Run Button -->
                                <div class="mb-3">
                                    <button class="btn btn-success" @click="runTool(tool.function.name)"
                                        :disabled="isRunning || !canRunTool(tool)">
                                        <span v-if="isRunning && currentRunningTool === tool.function.name"
                                            class="spinner-border spinner-border-sm me-2"></span>
                                        {{ 
                                            isRunning && currentRunningTool === tool.function.name ? 'Running...' : 'Run Tool' 
                                        }}
                                    </button>
                                </div>

                                <!-- Output Section -->
                                <div>
                                    <h6>Output:</h6>
                                    <textarea class="form-control" rows="6" readonly
                                        :value="toolResults[tool.function.name] || 'No output yet...'"
                                        style="font-family: monospace; font-size: 0.9rem;"></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" @click="clearAllResults">Clear All Results</button>
                    <button type="button" class="btn btn-primary" @click="$emit('close')">Close</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { tools } from './services/automation-tools.js';

const emit = defineEmits(['close']);

const expandedTools = ref(new Set());
const toolParams = reactive({});
const toolResults = reactive({});
const isRunning = ref(false);
const currentRunningTool = ref(null);

// Initialize tool parameters
onMounted(() => {
    tools.forEach(tool => {
        const toolName = tool.function.name;
        toolParams[toolName] = {};
        toolResults[toolName] = '';

        // Initialize all parameters (required and optional)
        if (tool.function.parameters.properties) {
            Object.keys(tool.function.parameters.properties).forEach(param => {
                toolParams[toolName][param] = '';
            });
        }
    });
});

// Toggle tool expansion
function toggleTool(toolName) {
    if (expandedTools.value.has(toolName)) {
        expandedTools.value.delete(toolName);
    } else {
        expandedTools.value.add(toolName);
    }
}

// Check if tool has optional parameters
function hasOptionalParams(tool) {
    const allParams = Object.keys(tool.function.parameters.properties || {});
    const requiredParams = tool.function.parameters.required || [];
    return allParams.length > requiredParams.length;
}

// Get optional parameters
function getOptionalParams(tool) {
    const allParams = Object.keys(tool.function.parameters.properties || {});
    const requiredParams = tool.function.parameters.required || [];
    return allParams.filter(param => !requiredParams.includes(param));
}

// Check if tool can be run (all required parameters filled)
function canRunTool(tool) {
    const requiredParams = tool.function.parameters.required || [];
    const toolName = tool.function.name;

    return requiredParams.every(param => {
        const value = toolParams[toolName][param];
        return value && value.trim() !== '';
    });
}

// Run a tool
async function runTool(toolName) {
    if (isRunning.value) return;

    isRunning.value = true;
    currentRunningTool.value = toolName;    try {
        // Prepare arguments
        const args = {};
        const targetTool = tools.find(t => t.function.name === toolName);

        // Add all parameters that have values
        if (targetTool.function.parameters.properties) {
            Object.keys(targetTool.function.parameters.properties).forEach(param => {
                const value = toolParams[toolName][param];
                if (value && value.trim() !== '') {
                    // Try to parse as number if the parameter type suggests it
                    if (targetTool.function.parameters.properties[param].type === 'number') {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue)) {
                            args[param] = numValue;
                        } else {
                            args[param] = value;
                        }
                    } else if (param === 'data') {
                        // Try to parse JSON for data parameter
                        try {
                            args[param] = JSON.parse(value);
                        } catch {
                            args[param] = value;
                        }
                    } else {
                        args[param] = value;
                    }
                }
            });
        }

        toolResults[toolName] = 'Running...';        // Call the automation tool
        const executionTool = tools.find(t => t.function.name === toolName);
        if (!executionTool || !executionTool.implementation) {
            throw new Error(`Tool ${toolName} not found or missing implementation`);
        }
        const result = await executionTool.implementation(args);
        toolResults[toolName] = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

    } catch (error) {
        toolResults[toolName] = `Error: ${error.message}`;
    } finally {
        isRunning.value = false;
        currentRunningTool.value = null;
    }
}

// Clear all results
function clearAllResults() {
    tools.forEach(tool => {
        toolResults[tool.function.name] = '';
    });
}
</script>

<style scoped>
.modal {
    background: rgba(0, 0, 0, 0.3);
}

.btn-link {
    text-decoration: none;
    color: inherit;
}

.btn-link:hover {
    text-decoration: none;
    color: inherit;
}

.card-header .btn-link:focus {
    box-shadow: none;
}

.spinner-border-sm {
    width: 1rem;
    height: 1rem;
}
</style>
