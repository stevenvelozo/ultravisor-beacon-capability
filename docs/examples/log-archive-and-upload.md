# Example: Log Archive and Upload

A capability that compresses log directories into tar.gz archives and optionally uploads them to S3. Useful for archiving logs before cleanup or for centralized log storage.

## Full Source

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const libChildProcess = require('child_process');
const libPath = require('path');
const libFS = require('fs');

class LogArchive extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'LogArchive';
		this.capabilityName = 'LogArchive';
	}

	// --- Action: CompressLogs ---

	get actionCompressLogs_Description()
	{
		return 'Compress a log directory into a timestamped tar.gz archive';
	}

	get actionCompressLogs_Schema()
	{
		return [
			{ Name: 'SourceDirectory', DataType: 'String', Required: true },
			{ Name: 'OutputDirectory', DataType: 'String', Required: true },
			{ Name: 'ArchivePrefix', DataType: 'String', Required: false, Default: 'logs' },
			{ Name: 'Pattern', DataType: 'String', Required: false, Default: '*.log', Description: 'File pattern to include' },
			{ Name: 'OlderThanDays', DataType: 'Integer', Required: false, Description: 'Only archive files older than N days' },
			{ Name: 'DeleteOriginals', DataType: 'Boolean', Required: false, Default: false }
		];
	}

	actionCompressLogs(pSettings, pWorkItem, fCallback, fReportProgress)
	{
		let tmpTimestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
		let tmpArchiveName = `${pSettings.ArchivePrefix || 'logs'}-${tmpTimestamp}.tar.gz`;
		let tmpOutputPath = libPath.join(pSettings.OutputDirectory, tmpArchiveName);

		// Build the find command to collect files
		let tmpFindCmd = `find ${pSettings.SourceDirectory} -name '${pSettings.Pattern || '*.log'}' -type f`;
		if (pSettings.OlderThanDays)
		{
			tmpFindCmd += ` -mtime +${pSettings.OlderThanDays}`;
		}

		fReportProgress({ Percent: 10, Message: 'Scanning for files to archive...' });

		// Count files first
		libChildProcess.exec(`${tmpFindCmd} | wc -l`, (pCountError, pCountOut) =>
		{
			if (pCountError) return fCallback(pCountError);

			let tmpFileCount = parseInt(pCountOut.trim(), 10);
			if (tmpFileCount === 0)
			{
				return fCallback(null, {
					Outputs: { FileCount: 0, ArchivePath: null },
					Log: ['No files matched the criteria']
				});
			}

			fReportProgress({ Percent: 20, Message: `Found ${tmpFileCount} files, compressing...` });

			// Create the archive
			let tmpTarCmd = `${tmpFindCmd} | tar -czf ${tmpOutputPath} -T -`;

			libChildProcess.exec(tmpTarCmd, { timeout: 600000 }, (pTarError) =>
			{
				if (pTarError) return fCallback(pTarError);

				fReportProgress({ Percent: 70, Message: 'Archive created, checking size...' });

				// Get archive size
				libFS.stat(tmpOutputPath, (pStatError, pStats) =>
				{
					if (pStatError) return fCallback(pStatError);

					let tmpSizeMB = (pStats.size / (1024 * 1024)).toFixed(2);

					if (pSettings.DeleteOriginals)
					{
						fReportProgress({ Percent: 80, Message: 'Deleting original files...' });
						libChildProcess.exec(`${tmpFindCmd} -delete`, (pDelError) =>
						{
							if (pDelError) this.log.warn(`Delete error: ${pDelError.message}`);

							return fCallback(null, {
								Outputs: {
									ArchivePath: tmpOutputPath,
									ArchiveName: tmpArchiveName,
									ArchiveSizeMB: parseFloat(tmpSizeMB),
									FileCount: tmpFileCount,
									OriginalsDeleted: true
								},
								Log: [`Archived ${tmpFileCount} files to ${tmpArchiveName} (${tmpSizeMB}MB), originals deleted`]
							});
						});
					}
					else
					{
						return fCallback(null, {
							Outputs: {
								ArchivePath: tmpOutputPath,
								ArchiveName: tmpArchiveName,
								ArchiveSizeMB: parseFloat(tmpSizeMB),
								FileCount: tmpFileCount,
								OriginalsDeleted: false
							},
							Log: [`Archived ${tmpFileCount} files to ${tmpArchiveName} (${tmpSizeMB}MB)`]
						});
					}
				});
			});
		});
	}

	// --- Action: UploadToS3 ---

	get actionUploadToS3_Description()
	{
		return 'Upload a file to an S3 bucket using the AWS CLI';
	}

	get actionUploadToS3_Schema()
	{
		return [
			{ Name: 'FilePath', DataType: 'String', Required: true },
			{ Name: 'Bucket', DataType: 'String', Required: true },
			{ Name: 'Prefix', DataType: 'String', Required: false, Default: 'logs/' },
			{ Name: 'StorageClass', DataType: 'String', Required: false, Default: 'STANDARD_IA' },
			{ Name: 'DeleteAfterUpload', DataType: 'Boolean', Required: false, Default: false }
		];
	}

	actionUploadToS3(pSettings, pWorkItem, fCallback, fReportProgress)
	{
		let tmpFileName = libPath.basename(pSettings.FilePath);
		let tmpS3Key = `${pSettings.Prefix || 'logs/'}${tmpFileName}`;
		let tmpS3URI = `s3://${pSettings.Bucket}/${tmpS3Key}`;

		fReportProgress({ Percent: 10, Message: `Uploading to ${tmpS3URI}...` });

		let tmpCmd = `aws s3 cp ${pSettings.FilePath} ${tmpS3URI} --storage-class ${pSettings.StorageClass || 'STANDARD_IA'}`;

		libChildProcess.exec(tmpCmd, { timeout: 600000 }, (pUploadError, pStdOut) =>
		{
			if (pUploadError) return fCallback(pUploadError);

			fReportProgress({ Percent: 90, Message: 'Upload complete' });

			if (pSettings.DeleteAfterUpload)
			{
				libFS.unlink(pSettings.FilePath, (pUnlinkError) =>
				{
					if (pUnlinkError) this.log.warn(`Could not delete ${pSettings.FilePath}: ${pUnlinkError.message}`);

					return fCallback(null, {
						Outputs: { S3URI: tmpS3URI, LocalDeleted: !pUnlinkError },
						Log: [`Uploaded ${tmpFileName} to ${tmpS3URI}, local file deleted`]
					});
				});
			}
			else
			{
				return fCallback(null, {
					Outputs: { S3URI: tmpS3URI, LocalDeleted: false },
					Log: [`Uploaded ${tmpFileName} to ${tmpS3URI}`]
				});
			}
		});
	}
}

// --- Startup ---

let tmpFable = new libFable({ Product: 'LogArchive', ProductVersion: '1.0.0' });
tmpFable.addServiceType('LogArchive', LogArchive);
let tmpCap = tmpFable.instantiateServiceProvider('LogArchive');

tmpCap.connect(
	{
		ServerURL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
		Name: `log-archive-${require('os').hostname()}`
	},
	(pError) =>
	{
		if (pError) throw pError;
		console.log('Log archive beacon online');
	});

process.on('SIGTERM', () => { tmpCap.disconnect(() => process.exit(0)); });
```

## Registered Task Types

- `beacon-logarchive-compresslogs`
- `beacon-logarchive-uploadtos3`

## Key Points

- **CompressLogs** and **UploadToS3** can be composed into an operation graph: compress first, then upload
- **Timestamped archive names** prevent collisions
- **OlderThanDays** filter lets you archive only stale logs while leaving recent ones in place
- **StorageClass** defaults to `STANDARD_IA` for cost-effective long-term storage
- The S3 upload uses the AWS CLI, so credentials must be configured on the host (environment variables or IAM role)
