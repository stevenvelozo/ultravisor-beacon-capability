# Example: REST API Health Check

A capability that monitors multiple REST endpoints and reports their health status. Useful for synthetic monitoring when you want results captured in Ultravisor rather than a separate monitoring tool.

## Full Source

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const libHTTPS = require('https');
const libHTTP = require('http');
const libURL = require('url');

class RESTHealthCheck extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'RESTHealthCheck';
		this.capabilityName = 'RESTHealthCheck';
	}

	// --- Action: CheckEndpoint ---

	get actionCheckEndpoint_Description()
	{
		return 'Check a single REST endpoint and report status, latency, and response';
	}

	get actionCheckEndpoint_Schema()
	{
		return [
			{ Name: 'URL', DataType: 'String', Required: true },
			{ Name: 'Method', DataType: 'String', Required: false, Default: 'GET' },
			{ Name: 'ExpectedStatus', DataType: 'Integer', Required: false, Default: 200 },
			{ Name: 'TimeoutMs', DataType: 'Integer', Required: false, Default: 10000 },
			{ Name: 'Headers', DataType: 'Object', Required: false }
		];
	}

	actionCheckEndpoint(pSettings, pWorkItem, fCallback)
	{
		let tmpParsed = libURL.parse(pSettings.URL);
		let tmpLib = (tmpParsed.protocol === 'https:') ? libHTTPS : libHTTP;
		let tmpStart = Date.now();

		let tmpOptions = {
			hostname: tmpParsed.hostname,
			port: tmpParsed.port,
			path: tmpParsed.path,
			method: pSettings.Method || 'GET',
			timeout: pSettings.TimeoutMs || 10000,
			headers: pSettings.Headers || {}
		};

		let tmpReq = tmpLib.request(tmpOptions, (pRes) =>
		{
			let tmpBody = '';
			pRes.on('data', (pChunk) => { tmpBody += pChunk; });
			pRes.on('end', () =>
			{
				let tmpLatency = Date.now() - tmpStart;
				let tmpExpected = pSettings.ExpectedStatus || 200;
				let tmpHealthy = (pRes.statusCode === tmpExpected);

				return fCallback(null, {
					Outputs: {
						URL: pSettings.URL,
						StatusCode: pRes.statusCode,
						ExpectedStatus: tmpExpected,
						Healthy: tmpHealthy,
						LatencyMs: tmpLatency,
						ResponseBody: tmpBody.substring(0, 2048),
						Headers: pRes.headers
					},
					Log: [
						`${pSettings.URL} -> ${pRes.statusCode} (${tmpLatency}ms) ${tmpHealthy ? 'HEALTHY' : 'UNHEALTHY'}`
					]
				});
			});
		});

		tmpReq.on('timeout', () =>
		{
			tmpReq.destroy();
			return fCallback(null, {
				Outputs: {
					URL: pSettings.URL,
					Healthy: false,
					LatencyMs: Date.now() - tmpStart,
					Error: 'Request timed out'
				},
				Log: [`${pSettings.URL} -> TIMEOUT`]
			});
		});

		tmpReq.on('error', (pError) =>
		{
			return fCallback(null, {
				Outputs: {
					URL: pSettings.URL,
					Healthy: false,
					LatencyMs: Date.now() - tmpStart,
					Error: pError.message
				},
				Log: [`${pSettings.URL} -> ERROR: ${pError.message}`]
			});
		});

		tmpReq.end();
	}

	// --- Action: CheckMultiple ---

	get actionCheckMultiple_Description()
	{
		return 'Check multiple endpoints in parallel and return a consolidated health report';
	}

	get actionCheckMultiple_Schema()
	{
		return [
			{ Name: 'Endpoints', DataType: 'Array', Required: true, Description: 'Array of { URL, Method, ExpectedStatus }' },
			{ Name: 'TimeoutMs', DataType: 'Integer', Required: false, Default: 10000 }
		];
	}

	actionCheckMultiple(pSettings, pWorkItem, fCallback, fReportProgress)
	{
		let tmpEndpoints = pSettings.Endpoints || [];
		let tmpResults = [];
		let tmpCompleted = 0;
		let tmpTotal = tmpEndpoints.length;

		if (tmpTotal === 0)
		{
			return fCallback(null, {
				Outputs: { Results: [], AllHealthy: true, HealthyCount: 0, TotalCount: 0 },
				Log: ['No endpoints to check']
			});
		}

		tmpEndpoints.forEach((pEndpoint, pIndex) =>
		{
			let tmpCheckSettings = {
				URL: pEndpoint.URL || pEndpoint,
				Method: pEndpoint.Method || 'GET',
				ExpectedStatus: pEndpoint.ExpectedStatus || 200,
				TimeoutMs: pSettings.TimeoutMs || 10000,
				Headers: pEndpoint.Headers || {}
			};

			this.actionCheckEndpoint(tmpCheckSettings, pWorkItem, (pError, pResult) =>
			{
				tmpCompleted++;
				tmpResults.push(pResult ? pResult.Outputs : { URL: tmpCheckSettings.URL, Healthy: false, Error: 'Check failed' });

				fReportProgress({
					Percent: Math.round((tmpCompleted / tmpTotal) * 100),
					Message: `Checked ${tmpCompleted} / ${tmpTotal} endpoints`
				});

				if (tmpCompleted === tmpTotal)
				{
					let tmpHealthyCount = tmpResults.filter((pR) => pR.Healthy).length;
					return fCallback(null, {
						Outputs: {
							Results: tmpResults,
							AllHealthy: tmpHealthyCount === tmpTotal,
							HealthyCount: tmpHealthyCount,
							UnhealthyCount: tmpTotal - tmpHealthyCount,
							TotalCount: tmpTotal
						},
						Log: [`Health check complete: ${tmpHealthyCount}/${tmpTotal} healthy`]
					});
				}
			});
		});
	}
}

// --- Startup ---

let tmpFable = new libFable({ Product: 'RESTHealthCheck', ProductVersion: '1.0.0' });
tmpFable.addServiceType('RESTHealthCheck', RESTHealthCheck);
let tmpCap = tmpFable.instantiateServiceProvider('RESTHealthCheck');

tmpCap.connect(
	{
		ServerURL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
		Name: 'rest-health-checker'
	},
	(pError) =>
	{
		if (pError) throw pError;
		console.log('REST health check beacon online');
	});

process.on('SIGTERM', () => { tmpCap.disconnect(() => process.exit(0)); });
```

## Registered Task Types

- `beacon-resthealthcheck-checkendpoint`
- `beacon-resthealthcheck-checkmultiple`

## Key Points

- **No external HTTP library** -- uses Node.js built-in `http`/`https` modules
- **Timeout handling** returns results (not errors) so the work item always completes
- **CheckMultiple** runs all checks in parallel for speed, with progress reporting
- **Response body** is truncated to 2KB to avoid excessive output
- Schedule `CheckMultiple` on a cron in Ultravisor to get continuous monitoring with history
