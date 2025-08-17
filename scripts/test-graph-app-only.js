#!/usr/bin/env node
/**
 * Quick Microsoft Graph app-only test for external connections.
 *
 * Usage:
 *   npm run graph:appOnly
 * or
 *   node scripts/test-graph-app-only.js
 *
 * You will be prompted for:
 *  - Tenant ID (GUID)
 *  - Client ID (Application ID)
 *  - Client Secret
 *  - API version (v1.0 or beta)
 */

const axios = require('axios');
const readline = require('readline');

function ask(question, { silent = false, defaultValue = '' } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (!silent) {
      rl.question(`${question}${defaultValue ? ` [${defaultValue}]` : ''}: `, (answer) => {
        rl.close();
        resolve(answer || defaultValue);
      });
    } else {
      // Silent input (no echo). Works in most terminals.
      const stdin = process.openStdin();
      process.stdout.write(`${question}: `);
      const onDataHandler = (char) => {
        char = char + '';
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004':
            stdin.removeListener('data', onDataHandler);
            process.stdout.write('\n');
            rl.close();
            resolve(buffer);
            break;
          default:
            process.stdout.write('*');
            buffer += char;
            break;
        }
      };
      let buffer = '';
      stdin.on('data', onDataHandler);
    }
  });
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function getAppOnlyToken(tenantId, clientId, clientSecret) {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const res = await axios.post(tokenUrl, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data.access_token;
}

async function main() {
  try {
    const defaultVersion = 'v1.0';
    const tenantId = await ask('Tenant ID (GUID)');
    const clientId = await ask('Client ID (Application ID)');
    const clientSecret = await ask('Client Secret', { silent: true });
    const apiVersion = (await ask('API version (v1.0 or beta)', { defaultValue: defaultVersion })).toLowerCase() === 'beta' ? 'beta' : 'v1.0';

    if (!tenantId || !clientId || !clientSecret) {
      console.error('Missing required values.');
      process.exit(1);
    }

    console.log('\nRequesting app-only token...');
    const token = await getAppOnlyToken(tenantId, clientId, clientSecret);
    const payload = decodeJwtPayload(token) || {};
    console.log('Token acquired. aud:', payload.aud, 'roles:', payload.roles || payload.scp);
    // NEW: Print the raw access token to help debug auth issues
    console.log('\nAccess token (pasteable):\n');
    console.log(token);

    const url = `https://graph.microsoft.com/${apiVersion}/external/connections`;
    console.log('\nCalling:', url);
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });

    const items = Array.isArray(res.data?.value) ? res.data.value : [];
    console.log(`\n${items.length} connection(s) found:\n`);
    for (const c of items) {
      console.log(`- ${c.id}  ${c.name || c.displayName || ''}  ${c.state || c.status || ''}`);
    }

    if (!items.length) {
      console.log('\nNo connectors found. If you expect some, check permissions/tenant.');
    }
  } catch (e) {
    const status = e?.response?.status;
    console.error('\nRequest failed.', status ? `HTTP ${status}` : '');
    if (e?.response?.data) {
      console.error(JSON.stringify(e.response.data, null, 2));
    } else {
      console.error(e?.message || String(e));
    }
    process.exit(2);
  }
}

main();
