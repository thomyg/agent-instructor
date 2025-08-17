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

// Response shapes for chat completions
interface ChatCompletionResponseChoice {
  message: { content: string };
}
interface ChatCompletionResponse {
  choices: ChatCompletionResponseChoice[];
}

// NEW: Types for Copilot Connectors
interface CopilotConnector {
  id: string;
  name?: string;
  description?: string;
  state?: string;
}

// Graph connections response
interface GraphConnectionsResponse {
  value: any[];
}

// App-only Graph auth config and secret key
const GRAPH_SECRET_KEY = 'agentInstructor.graph.clientSecret';
interface GraphClientConfig {
  tenantId: string;
  clientId: string;
}
interface TokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
}

function getGraphClientConfig(): GraphClientConfig {
  const cfg = vscode.workspace.getConfiguration('agentInstructor');
  return {
    tenantId: cfg.get('graph.tenantId', ''),
    clientId: cfg.get('graph.clientId', '')
  };
}

async function getAppOnlyAccessToken(context: vscode.ExtensionContext): Promise<string> {
  const { tenantId, clientId } = getGraphClientConfig();
  const clientSecret = await context.secrets.get(GRAPH_SECRET_KEY);
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('App-only auth not configured. Set tenantId, clientId in settings and client secret in SecretStorage.');
  }
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const res = await axios.post<TokenResponse>(tokenUrl, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data.access_token;
}

// Sends a request to the configured LLM endpoint
async function sendLLMRequest(text: string, config: LLMConfig): Promise<{ data: ChatCompletionResponse }> {
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

  return axios.post<ChatCompletionResponse>(url, payload, { headers }) as unknown as Promise<{ data: ChatCompletionResponse }>;
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

// NEW: Fetch Copilot connectors (using Microsoft Graph external connections as a baseline)
async function fetchCopilotConnectors(accessToken: string): Promise<CopilotConnector[]> {
  try {
    const headers = { Authorization: `Bearer ${accessToken}` };
    // Try v1.0 first
    const url = 'https://graph.microsoft.com/v1.0/external/connections';
    const res = await axios.get<GraphConnectionsResponse>(url, { headers });
    const value = res.data?.value ?? [];
    return value.map((c: any) => ({
      id: c.id,
      name: c.name || c.displayName,
      description: c.description,
      state: c.state || c.status
    }));
  } catch (err: any) {
    // Fall back to /beta if v1.0 fails
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const betaUrl = 'https://graph.microsoft.com/beta/external/connections';
      const res = await axios.get<GraphConnectionsResponse>(betaUrl, { headers });
      const value = res.data?.value ?? [];
      return value.map((c: any) => ({
        id: c.id,
        name: c.name || c.displayName,
        description: c.description,
        state: c.state || c.status
      }));
    } catch (inner: any) {
      throw inner;
    }
  }
}

// NEW: Build the webview for Copilot Connectors list with search and copy-to-clipboard
function getCopilotConnectorsWebview(connectors: CopilotConnector[], hasAppOnly: boolean, errorText?: string): string {
  const rows = connectors.length
    ? connectors.map((c, i) => `
      <tr data-name="${(c.name || '').toLowerCase()}" data-id="${c.id.toLowerCase()}">
        <td><div class="name">${c.name || '(no name)'}<div class="desc">${c.description || ''}</div></div></td>
        <td><code>${c.id}</code></td>
        <td><span class="badge">${c.state || ''}</span></td>
        <td><button class="copy-btn" data-idx="${i}">Copy ID</button></td>
      </tr>
    `).join('')
    : `<tr><td colspan="4">${hasAppOnly ? 'No connectors found.' : 'Configure app-only (set secret) to list your Copilot connectors.'}</td></tr>`;

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Copilot Connectors</title>
    <style>
      :root { --bg:#1e1e1e; --fg:#d4d4d4; --muted:#a0a0a0; --primary:#007acc; --primary-hover:#005a9e; --border:#2a2a2a; }
      *{box-sizing:border-box}
      body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font-family:Segoe UI, Roboto, sans-serif}
      header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
      h1{font-size:18px;margin:0 8px 0 0}
      .spacer{flex:1}
      button{background:var(--primary);border:none;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer}
      button:hover{background:var(--primary-hover)}
      input[type="search"]{width:320px;max-width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:#2a2a2a;color:var(--fg)}
      .hint{color:var(--muted);font-size:12px;margin:4px 0 12px}
      table{width:100%;border-collapse:collapse}
      th,td{border-bottom:1px solid var(--border);padding:10px;vertical-align:top}
      th{font-weight:600;text-align:left}
      tr:hover{background:#242424}
      code{background:#2a2a2a;padding:2px 6px;border-radius:4px}
      .name{font-weight:600}
      .desc{font-weight:400;color:var(--muted);font-size:12px;margin-top:2px}
      .badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#2f343a;color:#9fb4c8;font-size:12px}
      .error{background:#3a1f1f;color:#ffb3b3;border:1px solid #5c2b2b;padding:10px;border-radius:6px;margin-bottom:10px}
      .toolbar{display:flex;gap:8px;align-items:center}
      .pill{padding:4px 8px;border-radius:999px;background:#2a2a2a;color:#cfcfcf;border:1px solid var(--border);font-size:12px}
    </style>
  </head>
  <body>
    <header>
      <h1>Copilot Connectors</h1>
      <span class="pill">App-only: ${hasAppOnly ? 'Configured' : 'Not configured'}</span>
      <div class="spacer"></div>
      <div class="toolbar">
        <input id="search" type="search" placeholder="Search by name or ID" aria-label="Search connectors" />
        ${hasAppOnly ? '<button id="refresh">Refresh</button><button id="clearSecret">Clear Secret</button>' : '<button id="setSecret">Set Secret</button>'}
      </div>
    </header>

    ${errorText ? `<div class="error">${errorText}</div>` : ''}
    <div class="hint">Click a row\'s Copy ID button to copy the connector ID to your clipboard.</div>

    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>ID</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody id="rows">
        ${rows}
      </tbody>
    </table>

    <script>
      const vscode = acquireVsCodeApi();
      const state = { connectors: ${JSON.stringify(connectors)} };

      function filterRows(q){
        q = (q||'').toLowerCase();
        const rows = document.querySelectorAll('#rows tr');
        rows.forEach(r=>{
          const name = r.getAttribute('data-name')||'';
          const id = r.getAttribute('data-id')||'';
          r.style.display = (name.includes(q) || id.includes(q)) ? '' : 'none';
        });
      }

      document.getElementById('search').addEventListener('input', (e)=>{
        filterRows(e.target.value);
      });

      document.querySelectorAll('.copy-btn').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          const idx = e.currentTarget.getAttribute('data-idx');
          const item = state.connectors[Number(idx)];
          if(item){ vscode.postMessage({ command: 'copyConnectorId', id: item.id }); }
        });
      });

      const refresh = document.getElementById('refresh');
      if(refresh){ refresh.addEventListener('click', ()=> vscode.postMessage({ command: 'refresh' })); }

      const setSecret = document.getElementById('setSecret');
      if(setSecret){ setSecret.addEventListener('click', ()=> vscode.postMessage({ command: 'setSecret' })); }

      const clearSecret = document.getElementById('clearSecret');
      if(clearSecret){ clearSecret.addEventListener('click', ()=> vscode.postMessage({ command: 'clearSecret' })); }
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

  const response = await axios.post<ChatCompletionResponse>(url, payload, { headers });
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

        const messageContent: string = response.data.choices?.[0]?.message?.content ?? '';
        console.log("Message content:", messageContent);

        let parsedResult: { clarityScore?: number; corrections?: Correction[] } | undefined;
        try {
          parsedResult = JSON.parse(messageContent);
        } catch (err: any) {
          vscode.window.showErrorMessage("Failed to parse JSON response: " + err.message);
          return;
        }

        const clarityScore = parsedResult?.clarityScore || 0;
        const corrections = parsedResult?.corrections || [];
        const analysisData: AnalysisData = { clarityScore, corrections };

        const panel = vscode.window.createWebviewPanel(
          'agentInstructorAnalysis',
          'Agent Instructor Analysis',
          vscode.ViewColumn.One,
          { enableScripts: true }
        );

        panel.webview.html = getWebviewContent(analysisData);

        panel.webview.onDidReceiveMessage(async (message: { command: string; index?: number }) => {
          if (message.command === 'applyCorrection') {
            const idx = typeof message.index === 'number' ? message.index : -1;
            const correction = corrections[idx];
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
                const success = await activeEditor.edit((editBuilder: vscode.TextEditorEdit) => {
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
        
        await editor.edit((editBuilder: vscode.TextEditorEdit) => {
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

  // Secret commands for Graph client secret
  const setSecretCmd = vscode.commands.registerCommand('agentInstructor.setGraphClientSecret', async () => {
    const secret = await vscode.window.showInputBox({
      prompt: 'Enter Microsoft Graph client secret',
      ignoreFocusOut: true,
      password: true,
      placeHolder: 'Client secret'
    });
    if (!secret) { return; }
    await context.secrets.store(GRAPH_SECRET_KEY, secret);
    vscode.window.showInformationMessage('Graph client secret saved.');
  });
  context.subscriptions.push(setSecretCmd);

  const clearSecretCmd = vscode.commands.registerCommand('agentInstructor.clearGraphClientSecret', async () => {
    await context.secrets.delete(GRAPH_SECRET_KEY);
    vscode.window.showInformationMessage('Graph client secret cleared.');
  });
  context.subscriptions.push(clearSecretCmd);

  // NEW: Copilot Connectors command (app-only only, auto-load on open)
  const connectorsDisposable = vscode.commands.registerCommand('agentInstructor.copilotConnectors', async () => {
    let connectors: CopilotConnector[] = [];
    let lastError: string | undefined;

    async function hasAppOnlyConfigured(): Promise<boolean> {
      const { tenantId, clientId } = getGraphClientConfig();
      const s = await context.secrets.get(GRAPH_SECRET_KEY);
      return !!(tenantId && clientId && s);
    }

    let hasAppOnly = await hasAppOnlyConfigured();

    const panel = vscode.window.createWebviewPanel(
      'agentInstructorConnectors',
      'Copilot Connectors',
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    const render = () => {
      panel.webview.html = getCopilotConnectorsWebview(connectors, hasAppOnly, lastError);
    };

    async function refreshAppOnly() {
      lastError = undefined;
      try {
        const token = await getAppOnlyAccessToken(context);
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Window,
          title: 'Loading Copilot connectors...'
        }, async () => {
          connectors = await fetchCopilotConnectors(token);
        });
      } catch (e: any) {
        const msg = e?.response?.data?.error?.message || e?.message || String(e);
        lastError = `Failed to load connectors. ${msg}`;
        connectors = [];
      } finally {
        hasAppOnly = await hasAppOnlyConfigured();
        render();
      }
    }

    // Initial render and auto-load if configured
    render();
    if (hasAppOnly) {
      // Auto-load connectors if secret is present
      await refreshAppOnly();
    }

    panel.webview.onDidReceiveMessage(async (msg: { command: string; id?: string }) => {
      switch (msg.command) {
        case 'refresh':
          if (await hasAppOnlyConfigured()) {
            await refreshAppOnly();
          } else {
            render();
          }
          break;
        case 'copyConnectorId':
          if (typeof msg.id === 'string') {
            await vscode.env.clipboard.writeText(msg.id);
            vscode.window.showInformationMessage('Connector ID copied to clipboard');
          }
          break;
        case 'setSecret':
          await vscode.commands.executeCommand('agentInstructor.setGraphClientSecret');
          hasAppOnly = await hasAppOnlyConfigured();
          if (hasAppOnly) {
            await refreshAppOnly();
          } else {
            render();
          }
          break;
        case 'clearSecret':
          await vscode.commands.executeCommand('agentInstructor.clearGraphClientSecret');
          hasAppOnly = await hasAppOnlyConfigured();
          connectors = [];
          render();
          break;
      }
    });
  });

  context.subscriptions.push(connectorsDisposable);
}

export function deactivate() {
  console.log("Extension deactivated");
}
