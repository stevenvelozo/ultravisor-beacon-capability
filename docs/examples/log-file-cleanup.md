# Example: Log File Cleanup

A capability for finding and deleting old log files by age and size. Replaces the cron-job-plus-bash-script pattern with observable, auditable cleanup operations.

## Full Source

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const libChildProcess = require('child_process');
const libFS = require('fs');
const libPath = require('path');

class LogFileCleanup extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'LogFileCleanup';
		this.capabilityName = 'LogFileCleanup';
	}

	// --- Action: PurgeByAge ---

	get actionPurgeByAge_Description()
	{
		return 'Delete log files older than a specified number of days';
	}

	get actionPurgeByAge_Schema()
	{
		return [
			{ Name: 'Directory', DataType: 'String', Required: true },
			{ Name: 'Pattern', DataType: 'String', Required: false, Default: '*.log' },
			{ Name: 'MaxAgeDays', DataType: 'Integer', Required: true },
			{ Name: 'Recursive', DataType: 'Boolean', Required: false, Default: false },
			{ Name: 'DryRun', DataType: 'Boolean', Required: false, Default: true }
		];
	}

	actionPurgeByAge(pSettings, pWorkItem, fCallback, fReportProgress)
	{
		let tmpDir = pSettings.Directory;
		let tmpPattern = pSettings.Pattern || '*.log';
		let tmpDays = parseInt(pSettings.MaxAgeDays, 10);
		let tmpRecursive = pSettings.Recursive ? '' : '-maxdepth 1';
		let tmpAction = pSettings.DryRun ? '-print' : '-print -delete';

		let tmpCmd = `find ${tmpDir} ${tmpRecursive} -name '${tmpPattern}' -type f -mtime +${tmpDays} ${tmpAction}`;

		fReportProgress({ Percent: 10, Message: `Scanning ${tmpDir} for files older than ${tmpDays} days...` });

		libChildProcess.exec(tmpCmd, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (pError, pStdOut, pStdErr) =>
		{
			if (pError && pError.code !== 0)
			{
				return fCallback(pError);
			}

			let tmpFiles = pStdOut.trim().split('\n').filter((pLine) => pLine.length > 0);

			return fCallback(null, {
				Outputs: {
					FilesFound: tmpFiles.length,
					Files: tmpFiles.slice(0, 200),
					DryRun: !!pSettings.DryRun,
					Truncated: tmpFiles.length > 200
				},
				Log: [
					pSettings.DryRun
						? `DRY RUN: Found ${tmpFiles.length} files to delete`
						: `Deleted ${tmpFiles.length} files`
				]
			});
		});
	}

	// --- Action: PurgeBySize ---

	get actionPurgeBySize_Description()
	{
		return 'Delete log files larger than a specified size';
	}

	get actionPurgeBySize_Schema()
	{
		return [
			{ Name: 'Directory', DataType: 'String', Required: true },
			{ Name: 'Pattern', DataType: 'String', Required: false, Default: '*.log' },
			{ Name: 'MaxSizeMB', DataType: 'Integer', Required: true },
			{ Name: 'DryRun', DataType: 'Boolean', Required: false, Default: true }
		];
	}

	actionPurgeBySize(pSettings, pWorkItem, fCallback)
	{
		let tmpDir = pSettings.Directory;
		let tmpPattern = pSettings.Pattern || '*.log';
		let tmpSizeMB = parseInt(pSettings.MaxSizeMB, 10);
		let tmpAction = pSettings.DryRun ? '-print' : '-print -delete';

		let tmpCmd = `find ${tmpDir} -name '${tmpPattern}' -type f -size +${tmpSizeMB}M ${tmpAction}`;

		libChildProcess.exec(tmpCmd, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (pError, pStdOut) =>
		{
			if (pError && pError.code !== 0) return fCallback(pError);

			let tmpFiles = pStdOut.trim().split('\n').filter((pLine) => pLine.length > 0);

			return fCallback(null, {
				Outputs: {
					FilesFound: tmpFiles.length,
					Files: tmpFiles.slice(0, 200),
					DryRun: !!pSettings.DryRun
				},
				Log: [
					pSettings.DryRun
						? `DRY RUN: Found ${tmpFiles.length} files larger than ${tmpSizeMB}MB`
						: `Deleted ${tmpFiles.length} files larger than ${tmpSizeMB}MB`
				]
			});
		});
	}

	// --- Action: ScanUsage ---

	get actionScanUsage_Description()
	{
		return 'Report total log directory size and file count by extension';
	}

	get actionScanUsage_Schema()
	{
		return [
			{ Name: 'Directory', DataType: 'String', Required: true }
		];
	}

	actionScanUsage(pSettings, pWorkItem, fCallback)
	{
		let tmpDir = pSettings.Directory;

		// Get total size
		let tmpSizeCmd = `du -sh ${tmpDir} 2>/dev/null | cut -f1`;
		// Get file count by extension
		let tmpCountCmd = `find ${tmpDir} -type f | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -20`;

		libChildProcess.exec(`${tmpSizeCmd} && echo '---SEPARATOR---' && ${tmpCountCmd}`, { timeout: 60000 }, (pError, pStdOut) =>
		{
			if (pError) return fCallback(pError);

			let tmpParts = pStdOut.split('---SEPARATOR---');
			let tmpTotalSize = tmpParts[0].trim();
			let tmpExtensions = tmpParts[1] ? tmpParts[1].trim().split('\n').map((pLine) =>
			{
				let tmpMatch = pLine.trim().match(/(\d+)\s+(.*)/);
				return tmpMatch ? { Count: parseInt(tmpMatch[1], 10), Extension: tmpMatch[2] } : null;
			}).filter(Boolean) : [];

			return fCallback(null, {
				Outputs: { TotalSize: tmpTotalSize, Extensions: tmpExtensions, Directory: tmpDir },
				Log: [`Log directory ${tmpDir}: ${tmpTotalSize} total`]
			});
		});
	}
}

// --- Startup ---

let tmpFable = new libFable({ Product: 'LogFileCleanup', ProductVersion: '1.0.0' });
tmpFable.addServiceType('LogFileCleanup', LogFileCleanup);
let tmpCap = tmpFable.instantiateServiceProvider('LogFileCleanup');

tmpCap.connect(
	{
		ServerURL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
		Name: `log-cleanup-${require('os').hostname()}`
	},
	(pError) =>
	{
		if (pError) throw pError;
		console.log('Log file cleanup beacon online');
	});

process.on('SIGTERM', () => { tmpCap.disconnect(() => process.exit(0)); });
```

## Registered Task Types

- `beacon-logfilecleanup-purgebyage`
- `beacon-logfilecleanup-purgebysize`
- `beacon-logfilecleanup-scanusage`

## Key Points

- **DryRun defaults to `true`** — a safe default that shows what would be deleted without actually deleting
- **File list is capped** at 200 entries in the output to prevent excessive payload sizes
- **ScanUsage** provides a quick overview of disk consumption by file type before deciding what to clean
- Schedule `PurgeByAge` weekly to keep log directories from growing unbounded
