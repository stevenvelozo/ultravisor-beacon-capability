# Example: REST Endpoint Sync

A capability that fetches data from one REST API and pushes it to another. Common use case: syncing records between services, pulling data from a vendor API into an internal system, or replicating configuration between environments.

## Full Source

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const libHTTPS = require('https');
const libHTTP = require('http');
const libURL = require('url');

class RESTSync extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'RESTSync';
		this.capabilityName = 'RESTSync';
	}

	/**
	 * Internal helper: make an HTTP request and return parsed JSON.
	 */
	_request(pURL, pMethod, pHeaders, pBody, fCallback)
	{
		let tmpParsed = libURL.parse(pURL);
		let tmpLib = (tmpParsed.protocol === 'https:') ? libHTTPS : libHTTP;

		let tmpHeaders = Object.assign({ 'Content-Type': 'application/json' }, pHeaders || {});

		let tmpOptions = {
			hostname: tmpParsed.hostname,
			port: tmpParsed.port,
			path: tmpParsed.path,
			method: pMethod,
			headers: tmpHeaders,
			timeout: 30000
		};

		let tmpReq = tmpLib.request(tmpOptions, (pRes) =>
		{
			let tmpData = '';
			pRes.on('data', (pChunk) => { tmpData += pChunk; });
			pRes.on('end', () =>
			{
				let tmpParsedBody = null;
				try { tmpParsedBody = JSON.parse(tmpData); }
				catch (pParseError) { tmpParsedBody = tmpData; }

				if (pRes.statusCode >= 400)
				{
					return fCallback(new Error(`HTTP ${pRes.statusCode}: ${tmpData.substring(0, 500)}`));
				}
				return fCallback(null, { StatusCode: pRes.statusCode, Body: tmpParsedBody });
			});
		});

		tmpReq.on('error', (pError) => fCallback(pError));
		tmpReq.on('timeout', () => { tmpReq.destroy(); fCallback(new Error('Request timed out')); });

		if (pBody)
		{
			tmpReq.write(typeof pBody === 'string' ? pBody : JSON.stringify(pBody));
		}
		tmpReq.end();
	}

	// --- Action: FetchAndPost ---

	get actionFetchAndPost_Description()
	{
		return 'Fetch records from a source API and POST each to a destination API';
	}

	get actionFetchAndPost_Schema()
	{
		return [
			{ Name: 'SourceURL', DataType: 'String', Required: true, Description: 'GET endpoint that returns an array of records' },
			{ Name: 'SourceHeaders', DataType: 'Object', Required: false },
			{ Name: 'DestinationURL', DataType: 'String', Required: true, Description: 'POST endpoint for each record' },
			{ Name: 'DestinationHeaders', DataType: 'Object', Required: false },
			{ Name: 'RecordsPath', DataType: 'String', Required: false, Description: 'Dot-path to the array in the source response (e.g. "data.items")' },
			{ Name: 'DryRun', DataType: 'Boolean', Required: false, Default: false }
		];
	}

	actionFetchAndPost(pSettings, pWorkItem, fCallback, fReportProgress)
	{
		fReportProgress({ Percent: 5, Message: 'Fetching from source...' });

		this._request(pSettings.SourceURL, 'GET', pSettings.SourceHeaders, null, (pFetchError, pFetchResult) =>
		{
			if (pFetchError)
			{
				return fCallback(pFetchError);
			}

			// Extract records array
			let tmpRecords = pFetchResult.Body;
			if (pSettings.RecordsPath)
			{
				let tmpParts = pSettings.RecordsPath.split('.');
				for (let i = 0; i < tmpParts.length; i++)
				{
					tmpRecords = tmpRecords ? tmpRecords[tmpParts[i]] : undefined;
				}
			}

			if (!Array.isArray(tmpRecords))
			{
				return fCallback(new Error(`Source did not return an array at path "${pSettings.RecordsPath || '(root)'}"`));
			}

			fReportProgress({ Percent: 20, Message: `Fetched ${tmpRecords.length} records` });

			if (pSettings.DryRun)
			{
				return fCallback(null, {
					Outputs: { DryRun: true, RecordCount: tmpRecords.length, SampleRecord: tmpRecords[0] || null },
					Log: [`DRY RUN: Would POST ${tmpRecords.length} records to ${pSettings.DestinationURL}`]
				});
			}

			// POST each record sequentially
			let tmpIndex = 0;
			let tmpSuccessCount = 0;
			let tmpErrors = [];

			let fnPostNext = () =>
			{
				if (tmpIndex >= tmpRecords.length)
				{
					return fCallback(null, {
						Outputs: {
							TotalRecords: tmpRecords.length,
							SuccessCount: tmpSuccessCount,
							ErrorCount: tmpErrors.length,
							Errors: tmpErrors.slice(0, 20)
						},
						Log: [`Synced ${tmpSuccessCount}/${tmpRecords.length} records to ${pSettings.DestinationURL}`]
					});
				}

				let tmpRecord = tmpRecords[tmpIndex];
				tmpIndex++;

				this._request(pSettings.DestinationURL, 'POST', pSettings.DestinationHeaders, tmpRecord, (pPostError) =>
				{
					if (pPostError)
					{
						tmpErrors.push({ Index: tmpIndex - 1, Error: pPostError.message });
					}
					else
					{
						tmpSuccessCount++;
					}

					let tmpPercent = 20 + Math.round((tmpIndex / tmpRecords.length) * 75);
					fReportProgress({ Percent: tmpPercent, Message: `Posted ${tmpIndex} / ${tmpRecords.length}` });

					setImmediate(fnPostNext);
				});
			};

			fnPostNext();
		});
	}

	// --- Action: MirrorEndpoint ---

	get actionMirrorEndpoint_Description()
	{
		return 'GET from source and PUT the entire response body to a destination';
	}

	get actionMirrorEndpoint_Schema()
	{
		return [
			{ Name: 'SourceURL', DataType: 'String', Required: true },
			{ Name: 'SourceHeaders', DataType: 'Object', Required: false },
			{ Name: 'DestinationURL', DataType: 'String', Required: true },
			{ Name: 'DestinationHeaders', DataType: 'Object', Required: false }
		];
	}

	actionMirrorEndpoint(pSettings, pWorkItem, fCallback)
	{
		this._request(pSettings.SourceURL, 'GET', pSettings.SourceHeaders, null, (pFetchError, pFetchResult) =>
		{
			if (pFetchError) return fCallback(pFetchError);

			this._request(pSettings.DestinationURL, 'PUT', pSettings.DestinationHeaders, pFetchResult.Body, (pPutError, pPutResult) =>
			{
				if (pPutError) return fCallback(pPutError);
				return fCallback(null, {
					Outputs: {
						SourceStatus: pFetchResult.StatusCode,
						DestinationStatus: pPutResult.StatusCode
					},
					Log: [`Mirrored ${pSettings.SourceURL} -> ${pSettings.DestinationURL}`]
				});
			});
		});
	}
}

// --- Startup ---

let tmpFable = new libFable({ Product: 'RESTSync', ProductVersion: '1.0.0' });
tmpFable.addServiceType('RESTSync', RESTSync);
let tmpCap = tmpFable.instantiateServiceProvider('RESTSync');

tmpCap.connect(
	{
		ServerURL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
		Name: 'rest-sync-worker'
	},
	(pError) =>
	{
		if (pError) throw pError;
		console.log('REST sync beacon online');
	});

process.on('SIGTERM', () => { tmpCap.disconnect(() => process.exit(0)); });
```

## Registered Task Types

- `beacon-restsync-fetchandpost`
- `beacon-restsync-mirrorendpoint`

## Key Points

- **No external HTTP library** — uses Node.js built-in modules
- **RecordsPath** supports dot-notation for extracting arrays from nested JSON (e.g. `data.results`)
- **Sequential POSTs** avoid overwhelming the destination API; use `MaxConcurrent` on the beacon config for parallelism at the work item level
- **DryRun** fetches from source but skips destination writes
- **Error collection** is capped at 20 entries to avoid massive outputs
