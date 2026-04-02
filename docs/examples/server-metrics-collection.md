# Example: Server Metrics Collection

A capability that collects CPU, memory, disk, and process metrics from the host machine. Schedule it to run every few minutes to build a lightweight time series of infrastructure health in Ultravisor.

## Full Source

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const libChildProcess = require('child_process');
const libOS = require('os');

class ServerMetrics extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'ServerMetrics';
		this.capabilityName = 'ServerMetrics';
	}

	// --- Action: CollectAll ---

	get actionCollectAll_Description()
	{
		return 'Collect CPU, memory, disk, and load average metrics from the host';
	}

	actionCollectAll(pSettings, pWorkItem, fCallback)
	{
		let tmpMetrics = {
			Timestamp: new Date().toISOString(),
			Hostname: libOS.hostname(),
			Platform: libOS.platform(),
			Arch: libOS.arch(),
			Uptime: libOS.uptime(),
			LoadAverage: libOS.loadavg(),
			CPUs: libOS.cpus().length,
			TotalMemoryMB: Math.round(libOS.totalmem() / (1024 * 1024)),
			FreeMemoryMB: Math.round(libOS.freemem() / (1024 * 1024)),
			MemoryUsagePercent: Math.round((1 - libOS.freemem() / libOS.totalmem()) * 100)
		};

		// Get disk usage
		libChildProcess.exec("df -h / | tail -1 | awk '{print $2, $3, $4, $5}'", (pError, pStdOut) =>
		{
			if (!pError && pStdOut.trim())
			{
				let tmpParts = pStdOut.trim().split(/\s+/);
				tmpMetrics.DiskTotal = tmpParts[0] || 'unknown';
				tmpMetrics.DiskUsed = tmpParts[1] || 'unknown';
				tmpMetrics.DiskAvailable = tmpParts[2] || 'unknown';
				tmpMetrics.DiskUsagePercent = tmpParts[3] || 'unknown';
			}

			return fCallback(null, {
				Outputs: tmpMetrics,
				Log: [
					`${tmpMetrics.Hostname}: CPU load ${tmpMetrics.LoadAverage[0].toFixed(2)}, ` +
					`Memory ${tmpMetrics.MemoryUsagePercent}%, ` +
					`Disk ${tmpMetrics.DiskUsagePercent || 'N/A'}`
				]
			});
		});
	}

	// --- Action: TopProcesses ---

	get actionTopProcesses_Description()
	{
		return 'List the top processes by CPU or memory usage';
	}

	get actionTopProcesses_Schema()
	{
		return [
			{ Name: 'SortBy', DataType: 'String', Required: false, Default: 'cpu', Description: '"cpu" or "memory"' },
			{ Name: 'Count', DataType: 'Integer', Required: false, Default: 10 }
		];
	}

	actionTopProcesses(pSettings, pWorkItem, fCallback)
	{
		let tmpSortFlag = (pSettings.SortBy === 'memory') ? '-m' : '-r';
		let tmpCount = parseInt(pSettings.Count, 10) || 10;

		// macOS and Linux have different ps flags; use a portable approach
		let tmpCmd = `ps aux --sort=${(pSettings.SortBy === 'memory') ? '-%mem' : '-%cpu'} | head -${tmpCount + 1}`;

		libChildProcess.exec(tmpCmd, (pError, pStdOut) =>
		{
			if (pError)
			{
				// Fallback for macOS
				let tmpFallback = `ps aux | sort -nrk ${(pSettings.SortBy === 'memory') ? '4' : '3'} | head -${tmpCount}`;
				libChildProcess.exec(tmpFallback, (pFallbackError, pFallbackOut) =>
				{
					if (pFallbackError) return fCallback(pFallbackError);
					return fCallback(null, {
						Outputs: { Processes: pFallbackOut, SortedBy: pSettings.SortBy || 'cpu' },
						Log: [`Top ${tmpCount} processes by ${pSettings.SortBy || 'cpu'}`]
					});
				});
				return;
			}

			return fCallback(null, {
				Outputs: { Processes: pStdOut, SortedBy: pSettings.SortBy || 'cpu' },
				Log: [`Top ${tmpCount} processes by ${pSettings.SortBy || 'cpu'}`]
			});
		});
	}

	// --- Action: NetworkConnections ---

	get actionNetworkConnections_Description()
	{
		return 'Count active network connections by state';
	}

	actionNetworkConnections(pSettings, pWorkItem, fCallback)
	{
		let tmpCmd = "netstat -an 2>/dev/null | awk '/tcp/ {print $6}' | sort | uniq -c | sort -rn";

		libChildProcess.exec(tmpCmd, (pError, pStdOut) =>
		{
			if (pError)
			{
				// Fallback: try ss on Linux
				let tmpFallback = "ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn";
				libChildProcess.exec(tmpFallback, (pFallbackError, pFallbackOut) =>
				{
					if (pFallbackError) return fCallback(pFallbackError);
					return this._parseConnectionCounts(pFallbackOut, fCallback);
				});
				return;
			}

			this._parseConnectionCounts(pStdOut, fCallback);
		});
	}

	_parseConnectionCounts(pOutput, fCallback)
	{
		let tmpStates = {};
		let tmpTotal = 0;
		let tmpLines = pOutput.trim().split('\n');

		for (let i = 0; i < tmpLines.length; i++)
		{
			let tmpMatch = tmpLines[i].trim().match(/(\d+)\s+(.*)/);
			if (tmpMatch)
			{
				let tmpCount = parseInt(tmpMatch[1], 10);
				tmpStates[tmpMatch[2]] = tmpCount;
				tmpTotal += tmpCount;
			}
		}

		return fCallback(null, {
			Outputs: { States: tmpStates, TotalConnections: tmpTotal },
			Log: [`Network connections: ${tmpTotal} total`]
		});
	}
}

// --- Startup ---

let tmpFable = new libFable({ Product: 'ServerMetrics', ProductVersion: '1.0.0' });
tmpFable.addServiceType('ServerMetrics', ServerMetrics);
let tmpCap = tmpFable.instantiateServiceProvider('ServerMetrics');

tmpCap.connect(
	{
		ServerURL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
		Name: `metrics-${libOS.hostname()}`
	},
	(pError) =>
	{
		if (pError) throw pError;
		console.log('Server metrics beacon online');
	});

process.on('SIGTERM', () => { tmpCap.disconnect(() => process.exit(0)); });
```

## Registered Task Types

- `beacon-servermetrics-collectall`
- `beacon-servermetrics-topprocesses`
- `beacon-servermetrics-networkconnections`

## Key Points

- **CollectAll** uses the Node.js `os` module for cross-platform metrics, with `df` for disk info
- **TopProcesses** includes a macOS fallback when Linux-style `ps --sort` is unavailable
- **NetworkConnections** tries `netstat` first, then falls back to `ss`
- Schedule `CollectAll` every 5 minutes in Ultravisor to build a lightweight metrics history
- The beacon name includes the hostname, so multiple servers can register the same capability
