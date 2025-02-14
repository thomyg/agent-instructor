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
}

// Send a request to the configured LLM endpoint
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
    max_tokens: 200
  };

  return axios.post(url, payload, { headers });
}

// Generate HTML content for the webview panel with improved styling
function getWebviewContent(analysis: AnalysisData): string {
  // Render corrections as clickable buttons.
  const correctionsHtml = (analysis.corrections && analysis.corrections.length > 0) ? `
    <h2>Corrections</h2>
    <table>
      <thead>
        <tr>
          <th>Ambiguous Phrase</th>
          <th>Suggestion</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
      ${analysis.corrections.map((item, index) => `
        <tr>
          <td>${item.phrase}</td>
          <td>${item.suggestion}</td>
          <td><button onclick="handleCorrectionClick(${index})">Apply Correction</button></td>
        </tr>
      `).join('')}
      </tbody>
    </table>
  ` : `<h2>No corrections provided.</h2>`;

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Agent Instructor Analysis Result</title>
      <!-- Modern font -->
      <link href="https://fonts.googleapis.com/css?family=Roboto&display=swap" rel="stylesheet" />
      <style>
        :root {
          --background: #1e1e1e;
          --foreground: #d4d4d4;
          --primary: #007acc;
          --primary-hover: #005a9e;
          --header: #569cd6;
          --table-header: #252526;
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
          grid-template-rows: auto auto 1fr auto;
          gap: 20px;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
        }
        h1, h2, h3 {
          color: var(--header);
          margin: 0.5em 0;
        }
        table {
          width: 90%;
          border-collapse: collapse;
          margin-bottom: 1em;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          border-radius: 5px;
          overflow: hidden;
        }
        th, td {
          padding: 10px 15px;
          font-size: 0.95em;
        }
        th {
          background-color: var(--table-header);
          text-align: left;
        }
        tr:nth-child(even) {
          background-color: rgba(255, 255, 255, 0.05);
        }
        button {
          background-color: var(--primary);
          border: none;
          padding: 8px 12px;
          color: white;
          cursor: pointer;
          border-radius: 3px;
          transition: background-color 0.2s ease-in-out;
          margin: 2px 0;
        }
        button:hover {
          background-color: var(--primary-hover);
        }
        ul {
          list-style: none;
          padding: 0;
          margin: 0;
          font-size: 0.9em;
        }
        #chartContainer {
          width: 90%;
          height: 30vh;
          margin-top: 1em;
        }
        /* Responsive grid layout for details */
        #detailsContainer {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          width: 90%;
          margin-top: 1em;
        }
        .detailCard {
          background-color: var(--table-header);
          padding: 15px;
          border-radius: 5px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Analysis Result</h1>
        <div class="summary">
          <h2>Summary</h2>
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
        <div class="chart">
          <h2>Metrics Chart</h2>
          <div id="chartContainer">
            <canvas id="analysisChart"></canvas>
          </div>
        </div>
        <div id="detailsContainer">
          <div class="detailCard">
            <h3>Ambiguous Sections</h3>
            <ul>
              ${(analysis.corrections && analysis.corrections.length > 0) 
                ? analysis.corrections.map((item, index) => `<li><button onclick="handleCorrectionClick(${index})">${item.phrase}</button></li>`).join('')
                : '<li>None</li>'}
            </ul>
          </div>
          <div class="detailCard">
            <h3>Suggestions</h3>
            <ul>
              ${(analysis.corrections && analysis.corrections.length > 0) 
                ? analysis.corrections.map((item, index) => `<li>${item.suggestion}</li>`).join('')
                : '<li>None</li>'}
            </ul>
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
      apiKey: config.get('apiKey', '')
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
}

export function deactivate() {
  console.log("Extension deactivated");
}
