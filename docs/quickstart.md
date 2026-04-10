# Quick Start

This guide walks through building your first beacon capability, connecting it to an Ultravisor server, and verifying the actions are registered.

## Prerequisites

- Node.js 18+
- An Ultravisor server running (default: `http://localhost:54321`)

## Installation

```bash
npm install ultravisor-beacon-capability
```

This installs `ultravisor-beacon-capability` along with its dependencies `ultravisor-beacon` and `fable-serviceproviderbase`.

## Step 1: Define a Capability Class

Create a file `my-capability.js`:

```javascript
const libBeaconCapability = require('ultravisor-beacon-capability');

class FileOperations extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'FileOperations';
		this.capabilityName = 'FileOperations';
	}

	// --- Action: ListFiles ---

	get actionListFiles_Description()
	{
		return 'List files in a directory with optional pattern filter';
	}

	get actionListFiles_Schema()
	{
		return [
			{ Name: 'Directory', DataType: 'String', Required: true },
			{ Name: 'Pattern', DataType: 'String', Required: false }
		];
	}

	actionListFiles(pSettings, pWorkItem, fCallback)
	{
		let tmpCmd = `ls -la ${pSettings.Directory}`;
		if (pSettings.Pattern)
		{
			tmpCmd += ` | grep '${pSettings.Pattern}'`;
		}
		require('child_process').exec(tmpCmd, (pError, pStdOut) =>
		{
			if (pError) return fCallback(pError);
			return fCallback(null, {
				Outputs: { FileList: pStdOut },
				Log: [`Listed files in ${pSettings.Directory}`]
			});
		});
	}

	// --- Action: DiskUsage ---

	get actionDiskUsage_Description()
	{
		return 'Report disk usage for a path';
	}

	get actionDiskUsage_Schema()
	{
		return [
			{ Name: 'Path', DataType: 'String', Required: true },
			{ Name: 'MaxDepth', DataType: 'Integer', Required: false }
		];
	}

	actionDiskUsage(pSettings, pWorkItem, fCallback)
	{
		let tmpDepth = pSettings.MaxDepth || 1;
		let tmpCmd = `du -h --max-depth=${tmpDepth} ${pSettings.Path}`;
		require('child_process').exec(tmpCmd, (pError, pStdOut) =>
		{
			if (pError) return fCallback(pError);
			return fCallback(null, {
				Outputs: { Usage: pStdOut },
				Log: [`Disk usage for ${pSettings.Path}`]
			});
		});
	}
}

module.exports = FileOperations;
```

## Step 2: Connect to Ultravisor

Create a file `start.js`:

```javascript
const libFable = require('fable');
const libFileOperations = require('./my-capability.js');

let tmpFable = new libFable({
	Product: 'FileOps',
	ProductVersion: '1.0.0'
});

// Register and instantiate the capability
tmpFable.addServiceType('FileOperations', libFileOperations);
let tmpCapability = tmpFable.instantiateServiceProvider('FileOperations');

// Connect to Ultravisor
tmpCapability.connect(
	{
		ServerURL: 'http://localhost:54321',
		Name: 'file-ops-worker',
		MaxConcurrent: 2,
		Tags: { host: require('os').hostname() }
	},
	(pError, pBeaconInfo) =>
	{
		if (pError)
		{
			console.error('Connection failed:', pError.message);
			process.exit(1);
		}
		console.log('Beacon online:', pBeaconInfo.BeaconID);
		console.log('Registered actions: ListFiles, DiskUsage');
	});

// Graceful shutdown
process.on('SIGTERM', () =>
{
	tmpCapability.disconnect(() =>
	{
		console.log('Beacon disconnected.');
		process.exit(0);
	});
});
```

Run it:

```bash
node start.js
```

## Step 3: Verify Registration

Once connected, the Ultravisor server creates two task types:

- `beacon-fileoperations-listfiles`
- `beacon-fileoperations-diskusage`

You can verify by querying the Ultravisor API:

```bash
curl http://localhost:54321/Beacon/Actions | jq
```

The response will include your actions with their schemas and descriptions.

## Step 4: Trigger an Action

From the Ultravisor dashboard or via the API:

```bash
curl -X POST http://localhost:54321/Beacon/Work/Dispatch \
  -H 'Content-Type: application/json' \
  -d '{
    "Capability": "FileOperations",
    "Action": "ListFiles",
    "Settings": { "Directory": "/var/log", "Pattern": ".log" }
  }'
```

The result will contain the output in `Outputs.FileList`.

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ServerURL` | `string` | -- | Ultravisor server endpoint (required) |
| `Name` | `string` | `capabilityName` | Beacon name for registration |
| `Password` | `string` | `''` | Authentication password |
| `MaxConcurrent` | `number` | `1` | Maximum parallel work items |
| `StagingPath` | `string` | `process.cwd()` | Working directory for file transfer |
| `Tags` | `object` | `{}` | Metadata tags sent to coordinator |
| `BindAddresses` | `array` | `[]` | Network addresses to advertise |

## Next Steps

- [Architecture](architecture.md) -- Understand the component design
- [API Reference](api/README.md) -- Complete method documentation
- [Examples](examples/README.md) -- Real-world usage patterns
