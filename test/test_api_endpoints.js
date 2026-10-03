/**
 * ============================================================================
 * TEST SUITE: HTTP REST API & Gateway Endpoint Suite (test/test_api_endpoints.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Spawns the Express server on an isolated port (3099) and executes live HTTP
 *   integration tests against health probes, module status, daily reports, weekly
 *   analytics, management telemetry, and operations assistant endpoints.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section B (Reference Architecture), Section AA (Dashboards)
 *
 * PACKAGES & DEPENDENCIES:
 *   - node:child_process (spawn)           : Isolated test server process runner
 *   - global fetch                         : HTTP client
 *
 * USAGE:
 *   node test/test_api_endpoints.js
 * ============================================================================
 */

import { spawn } from 'node:child_process';

async function testHttpEndpoints() {
  console.log('🚀 Spawning test server on port 3099...');
  const serverProc = spawn('node', ['src/server.js'], {
    env: { ...process.env, PORT: '3099' },
    stdio: 'pipe'
  });

  serverProc.stdout.on('data', d => {
  });
  serverProc.stderr.on('data', d => {
    console.error(`[Server Err]: ${d}`);
  });

  await new Promise(r => setTimeout(r, 1500));

  const endpoints = [
    { url: 'http://localhost:3099/health', method: 'GET' },
    { url: 'http://localhost:3099/api/modules/status', method: 'GET' },
    { url: 'http://localhost:3099/api/reports/daily', method: 'GET' },
    { url: 'http://localhost:3099/api/dashboard/weekly', method: 'GET' },
    { url: 'http://localhost:3099/api/dashboard/management', method: 'GET' },
    { url: 'http://localhost:3099/api/dashboard/department-performance', method: 'GET' },
    { url: 'http://localhost:3099/api/system/maintenance-audit', method: 'GET' },
    { url: 'http://localhost:3099/api/ai/operations-assistant', method: 'POST', body: JSON.stringify({ query: 'How many leads processed?' }) },
    { url: 'http://localhost:3099/admin', method: 'GET' }
  ];

  let allPassed = true;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : {},
        body: ep.body
      });
      console.log(`Endpoint ${ep.method} ${ep.url} -> Status: ${res.status}`);
      if (!res.ok) {
        allPassed = false;
        console.error(`❌ Endpoint failed: ${ep.url} returned ${res.status}`);
      }
    } catch (err) {
      allPassed = false;
      console.error(`❌ Endpoint error on ${ep.url}:`, err.message);
    }
  }

  serverProc.kill();
  if (!allPassed) {
    process.exit(1);
  } else {
    console.log('✅ ALL HTTP ENDPOINTS RESPONDED WITH STATUS 200 OK!');
  }
}

testHttpEndpoints().catch(err => {
  console.error(err);
  process.exit(1);
});
