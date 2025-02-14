"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
// Helper function to send a request to the configured LLM endpoint
async function sendLLMRequest(text, config) {
    let url;
    let headers = {};
    if (config.endpointType === 'azure') {
        url = config.endpointUrl;
        headers['api-key'] = config.apiKey;
        headers['Content-Type'] = 'application/json';
    }
    else {
        url = config.endpointUrl || 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        headers['Content-Type'] = 'application/json';
    }
    // Build the GPT-4 chat payload
    const payload = {
        model: 'gpt-4',
        messages: [
            {
                role: 'system',
                content: 'You are a semantic analyzer that reviews declarative agent instructions for ambiguity and suggests improvements.'
            },
            { role: 'user', content: text }
        ],
        temperature: 0.7,
        max_tokens: 200
    };
    return axios_1.default.post(url, payload, { headers });
}
// Helper function to generate HTML for the webview panel with charts and tables
function getWebviewContent(analysisResult) {
    // This sample assumes analysisResult has:
    //   clarityScore (number),
    //   ambiguousSections (array),
    //   suggestions (array)
    return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Agent Instructor Analysis Result</title>
      <style>
        body {
          font-family: sans-serif;
          padding: 20px;
          background-color: #1e1e1e;
          color: #d4d4d4;
        }
        h1, h2 {
          color: #569cd6;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          padding: 8px 12px;
          border: 1px solid #3c3c3c;
        }
        th {
          background-color: #252526;
        }
        canvas {
          max-width: 100%;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <h1>Agent Instructor Analysis Result</h1>
      <h2>Summary</h2>
      <table>
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
        <tr>
          <td>Clarity Score</td>
          <td>${analysisResult.clarityScore}</td>
        </tr>
        <tr>
          <td>Ambiguous Sections</td>
          <td>${analysisResult.ambiguousSections.length}</td>
        </tr>
        <tr>
          <td>Number of Suggestions</td>
          <td>${analysisResult.suggestions.length}</td>
        </tr>
      </table>
      <h2>Metrics Chart</h2>
      <canvas id="analysisChart" width="400" height="200"></canvas>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script>
        (function() {
          // Prepare the chart data based on our analysisResult
          const ctx = document.getElementById('analysisChart').getContext('2d');
          const chart = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: ['Clarity Score', 'Ambiguous Sections', 'Suggestions'],
              datasets: [{
                label: 'Metrics',
                data: [
                  ${analysisResult.clarityScore},
                  ${analysisResult.ambiguousSections.length},
                  ${analysisResult.suggestions.length}
                ],
                backgroundColor: [
                  'rgba(86, 156, 214, 0.7)',
                  'rgba(86, 156, 214, 0.7)',
                  'rgba(86, 156, 214, 0.7)'
                ],
                borderColor: [
                  'rgba(86, 156, 214, 1)',
                  'rgba(86, 156, 214, 1)',
                  'rgba(86, 156, 214, 1)'
                ],
                borderWidth: 1
              }]
            },
            options: {
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    color: '#d4d4d4'
                  },
                  grid: {
                    color: '#3c3c3c'
                  }
                },
                x: {
                  ticks: {
                    color: '#d4d4d4'
                  },
                  grid: {
                    color: '#3c3c3c'
                  }
                }
              },
              plugins: {
                legend: {
                  labels: {
                    color: '#d4d4d4'
                  }
                }
              }
            }
          });
        })();
      </script>
    </body>
  </html>
  `;
}
function activate(context) {
    let disposable = vscode.commands.registerCommand('agentInstructor.analyze', async () => {
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found. Please open an instruction.txt file.');
            return;
        }
        // Ensure the current file is instruction.txt
        const fileName = editor.document.fileName;
        if (!fileName.endsWith('instruction.txt')) {
            vscode.window.showWarningMessage('Please open an "instruction.txt" file.');
            return;
        }
        // Retrieve text from the currently open instruction.txt file
        const inputText = editor.document.getText();
        if (!inputText) {
            vscode.window.showWarningMessage('The instruction.txt file is empty.');
            return;
        }
        // Read configuration from workspace settings
        const config = vscode.workspace.getConfiguration('agentInstructor');
        const llmConfig = {
            endpointType: config.get('endpointType', 'openai'),
            endpointUrl: config.get('endpointUrl', ''),
            apiKey: config.get('apiKey', '')
        };
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing instructions with GPT-4...",
            cancellable: false
        }, async () => {
            try {
                const response = await sendLLMRequest(inputText, llmConfig);
                const analysisResult = response.data;
                console.log("Raw analysisResult:", analysisResult);
                // Create a new Webview Panel to display the analysis result
                const panel = vscode.window.createWebviewPanel('agentInstructorAnalysis', 'Agent Instructor Analysis', vscode.ViewColumn.One, { enableScripts: true });
                // Set the HTML content for the panel
                panel.webview.html = getWebviewContent(analysisResult);
            }
            catch (error) {
                vscode.window.showErrorMessage(`NLP analysis failed: ${error.message}`);
            }
        });
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map