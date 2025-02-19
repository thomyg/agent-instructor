import * as vscode from 'vscode';
import axios from 'axios';

interface Correction {
  phrase: string;
  suggestion: string;
}

interface AnalysisData {
  clarityScore: number;
  corrections?: Correction[];
  // Fallback properties (if corrections isn’t provided)
  ambiguousSections?: string[];
  suggestions?: string[];
}

interface LLMConfig {
  endpointType: 'openai' | 'azure';
  endpointUrl: string;
  apiKey: string;
  maxTokens: number;
}

// Sends a request to the configured LLM endpoint
async function sendLLMRequest(text: string, config: LLMConfig) {
  console.log("Sending request to LLM endpoint...");
  console.log("LLM Config:", config);
  
  let url: string;
  let headers: Record<string, string> = {};
  
  if (config.endpointType === 'azure') {
    url = config.endpointUrl;
    headers['api-key'] = config.apiKey;
    headers['Content-Type'] = 'application/json';
  } else {
    url = config.endpointUrl || 'https://api.openai.com/v1/chat/completions';
    headers['Authorization'] = `Bearer ${config.apiKey}`;
    headers['Content-Type'] = 'application/json';
  }
  
  console.log("Request URL:", url);
  console.log("Request Headers:", headers);

  const payload = {
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content:
          'You are a semantic analyzer. Analyze the following agent instructions for ambiguity and suggest improvements. Respond ONLY with a JSON object with exactly these keys: "clarityScore" (a number between 0 and 100) and "corrections" (an array of objects, each with "phrase" and "suggestion"). Do not include any additional text.'
      },
      { role: 'user', content: text }
    ],
    temperature: 0.7,
    max_tokens: config.maxTokens
  };

  return axios.post(url, payload, { headers });
}

// Generates HTML content for the webview panel with a refined, modern look.
// The corrections are displayed in a single table with three columns.
function getWebviewContent(analysis: AnalysisData): string {
  const tableRows = (analysis.corrections && analysis.corrections.length > 0)
    ? analysis.corrections.map((item, index) => `
      <tr>
        <td>${item.phrase}</td>
        <td>${item.suggestion}</td>
        <td><button onclick="handleCorrectionClick(${index})">Apply Correction</button></td>
      </tr>
    `).join('')
    : `<tr><td colspan="3">No corrections provided.</td></tr>`;

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Agent Instructor Analysis Result</title>
      <link href="https://fonts.googleapis.com/css?family=Roboto:400,500&display=swap" rel="stylesheet" />
      <style>
        :root {
          --background: #1e1e1e;
          --foreground: #d4d4d4;
          --primary: #007acc;
          --primary-hover: #005a9e;
          --header: #569cd6;
          --table-header-bg: linear-gradient(90deg, #252526, #2d2d30);
          --border: #3c3c3c;
        }
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 20px;
          height: 100vh;
          font-family: 'Roboto', sans-serif;
          background-color: var(--background);
          color: var(--foreground);
          overflow: hidden;
        }
        .container {
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 20px;
          width: 100%;
          height: 100%;
          max-width: 1600px;
          margin: 0 auto;
        }
        .summary {
          grid-row: 1;
          width: 100%;
        }
        .content-grid {
          grid-row: 2;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          height: 100%;
        }
        .chart {
          height: 100%;
          padding: 20px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }
        .details {
          height: 100%;
          padding: 20px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          overflow-y: auto;
        }
        h1, h2 {
          color: var(--header);
          margin: 0.5em 0;
          text-align: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1em;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          overflow: hidden;
        }
        th, td {
          padding: 12px 16px;
          font-size: 1em;
          border: 1px solid var(--border);
        }
        th {
          background: var(--table-header-bg);
          text-align: left;
        }
        tr:nth-child(even) {
          background-color: rgba(255, 255, 255, 0.05);
        }
        button {
          background-color: var(--primary);
          border: none;
          padding: 10px 16px;
          color: white;
          cursor: pointer;
          border-radius: 5px;
          transition: background-color 0.3s ease;
        }
        button:hover {
          background-color: var(--primary-hover);
        }
        p {
          margin: 0.5em 0 1em;
          font-size: 1em;
        }
        #chartContainer {
          width: 100%;
          height: calc(100% - 60px);
          margin: 0 auto;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="summary">
          <h1>Agent Instructor Analysis</h1>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Clarity Score</td>
                <td>${analysis.clarityScore}</td>
              </tr>
              <tr>
                <td>Corrections Count</td>
                <td>${analysis.corrections ? analysis.corrections.length : 0}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="content-grid">
          <div class="chart">
            <h2>Metrics Chart</h2>
            <div id="chartContainer">
              <canvas id="analysisChart"></canvas>
            </div>
          </div>
          
          <div class="details">
            <h2>Ambiguous Phrases &amp; Suggested Replacements</h2>
            <p>Compare each ambiguous phrase with its suggested replacement. Click "Apply Correction" to update your document.</p>
            <table>
              <thead>
                <tr>
                  <th>Ambiguous Phrase</th>
                  <th>Suggested Replacement</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script>
        const vscode = acquireVsCodeApi();
        function handleCorrectionClick(index) {
          vscode.postMessage({ command: 'applyCorrection', index: index });
        }
        (function() {
          const ctx = document.getElementById('analysisChart').getContext('2d');
          new Chart(ctx, {
            type: 'bar',
            data: {
              labels: ['Clarity Score', 'Corrections Count'],
              datasets: [{
                label: 'Metrics',
                data: [${analysis.clarityScore}, ${analysis.corrections ? analysis.corrections.length : 0}],
                backgroundColor: [
                  'rgba(86, 156, 214, 0.7)',
                  'rgba(86, 156, 214, 0.7)'
                ],
                borderColor: [
                  'rgba(86, 156, 214, 1)',
                  'rgba(86, 156, 214, 1)'
                ],
                borderWidth: 1
              }]
            },
            options: {
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: { color: '#d4d4d4' },
                  grid: { color: '#3c3c3c' }
                },
                x: {
                  ticks: { color: '#d4d4d4' },
                  grid: { color: '#3c3c3c' }
                }
              },
              plugins: {
                legend: {
                  labels: { color: '#d4d4d4' }
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

// Add this function before the activate function
async function generateInstructions(config: LLMConfig, agentDescription: string): Promise<string> {
  const url = config.endpointType === 'azure' ? config.endpointUrl : 'https://api.openai.com/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    ...(config.endpointType === 'azure' 
      ? { 'api-key': config.apiKey }
      : { 'Authorization': `Bearer ${config.apiKey}` })
  };

  const payload = {
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are an AI assistant that generates clear and precise instructions for AI agents. Generate a detailed set of instructions that demonstrates good practices for agent instruction writing.'
      },
      {
        role: 'user',
        content: `Generate a comprehensive set of instructions for an AI agent with the following description:\n\n${agentDescription}\n\nProvide clear, specific, and unambiguous instructions that will guide this agent in performing its tasks effectively.`
      }
    ],
    temperature: 0.7,
    max_tokens: config.maxTokens
  };

  const response = await axios.post(url, payload, { headers });
  return response.data.choices[0].message.content;
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Extension activated");

  let disposable = vscode.commands.registerCommand('agentInstructor.analyze', async () => {
    console.log("Command 'agentInstructor.analyze' executed");

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor found. Please open an instruction.txt file.');
      return;
    }

    const fileName = editor.document.fileName;
    if (!fileName.endsWith('instruction.txt')) {
      vscode.window.showWarningMessage('Please open an "instruction.txt" file.');
      return;
    }

    const inputText = editor.document.getText();
    if (!inputText) {
      vscode.window.showWarningMessage('The instruction.txt file is empty.');
      return;
    }

    const config = vscode.workspace.getConfiguration('agentInstructor');
    const llmConfig: LLMConfig = {
      endpointType: config.get('endpointType', 'openai'),
      endpointUrl: config.get('endpointUrl', ''),
      apiKey: config.get('apiKey', ''),
      maxTokens: config.get('maxTokens', 1000)
    };

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Analyzing instructions with GPT-4...",
      cancellable: false
    }, async () => {
      try {
        console.log("Sending LLM request...");
        const response = await sendLLMRequest(inputText, llmConfig);
        console.log("Raw response:", response.data);

        const messageContent = response.data.choices[0].message.content;
        console.log("Message content:", messageContent);

        let parsedResult;
        try {
          parsedResult = JSON.parse(messageContent);
        } catch (err: any) {
          vscode.window.showErrorMessage("Failed to parse JSON response: " + err.message);
          return;
        }

        const clarityScore = parsedResult.clarityScore || 0;
        const corrections = parsedResult.corrections || [];
        const analysisData: AnalysisData = { clarityScore, corrections };

        const panel = vscode.window.createWebviewPanel(
          'agentInstructorAnalysis',
          'Agent Instructor Analysis',
          vscode.ViewColumn.One,
          { enableScripts: true }
        );

        panel.webview.html = getWebviewContent(analysisData);

        panel.webview.onDidReceiveMessage(async message => {
          if (message.command === 'applyCorrection') {
            const correction = corrections[message.index];
            if (!correction) {
              vscode.window.showErrorMessage("Invalid correction index.");
              return;
            }
            const confirmed = await vscode.window.showInformationMessage(
              `Apply correction: Replace "${correction.phrase}" with "${correction.suggestion}"?`,
              'Apply'
            );
            if (confirmed === 'Apply') {
              const instructionUri = editor.document.uri;
              try {
                const doc = await vscode.workspace.openTextDocument(instructionUri);
                const activeEditor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                const fullText = doc.getText();
                const regex = new RegExp(correction.phrase, 'gi');
                const newText = fullText.replace(regex, correction.suggestion);
                if (fullText === newText) {
                  vscode.window.showWarningMessage("The ambiguous phrase was not found in the document.");
                  return;
                }
                const success = await activeEditor.edit(editBuilder => {
                  const start = doc.positionAt(0);
                  const end = doc.positionAt(fullText.length);
                  editBuilder.replace(new vscode.Range(start, end), newText);
                });
                if (success) {
                  vscode.window.showInformationMessage("Correction applied.");
                } else {
                  vscode.window.showErrorMessage("Failed to apply correction.");
                }
              } catch (err: any) {
                vscode.window.showErrorMessage("Error updating document: " + err.message);
              }
            }
          }
        });

      } catch (error: any) {
        console.log("Error occurred:", error);
        vscode.window.showErrorMessage(`NLP analysis failed: ${error.message}`);
      }
    });
  });

  context.subscriptions.push(disposable);

  // Update the generate command registration in the activate function
  let generateDisposable = vscode.commands.registerCommand('agentInstructor.generate', async () => {
    const config = vscode.workspace.getConfiguration('agentInstructor');
    const llmConfig: LLMConfig = {
      endpointType: config.get('endpointType', 'openai'),
      endpointUrl: config.get('endpointUrl', ''),
      apiKey: config.get('apiKey', ''),
      maxTokens: config.get('maxTokens', 1000)
    };

    // Get the active editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor found. Please open instruction.txt');
      return;
    }

    const fileName = editor.document.fileName;
    if (!fileName.endsWith('instruction.txt')) {
      vscode.window.showWarningMessage('Please open instruction.txt before generating instructions.');
      return;
    }

    // Get agent description from user
    const agentDescription = await vscode.window.showInputBox({
      prompt: 'Describe the AI agent (its purpose, capabilities, and constraints)',
      placeHolder: 'e.g., A coding assistant that helps developers write and review code...',
      ignoreFocusOut: true
    });

    if (!agentDescription) {
      vscode.window.showInformationMessage('Operation cancelled - no agent description provided.');
      return;
    }

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Generating instructions...",
      cancellable: false
    }, async () => {
      try {
        const instructions = await generateInstructions(llmConfig, agentDescription);
        
        // Get current content
        const currentContent = editor.document.getText();
        
        // Add new instructions with a separator if there's existing content
        const newContent = currentContent 
          ? `${currentContent}\n\n---\n\nAgent Description: ${agentDescription}\n\n${instructions}`
          : `Agent Description: ${agentDescription}\n\n${instructions}`;
        
        // Replace entire document content
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        
        await editor.edit(editBuilder => {
          editBuilder.replace(fullRange, newContent);
        });
        
        vscode.window.showInformationMessage('Instructions generated and added to instruction.txt');
      } catch (error: any) {
        console.error("Error generating instructions:", error);
        vscode.window.showErrorMessage(`Failed to generate instructions: ${error.message}`);
      }
    });
  });

  context.subscriptions.push(generateDisposable);
}

export function deactivate() {
  console.log("Extension deactivated");
}
