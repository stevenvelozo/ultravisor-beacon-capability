# Example: Shell Commands

Wrap basic shell commands as beacon actions. This is the simplest possible capability -- each action executes a shell command and returns the output.

## Full Source

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const libChildProcess = require('child_process');

class ShellCommands extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'ShellCommands';
		this.capabilityName = 'ShellCommands';
	}

	// --- Action: Ping ---

	get actionPing_Description()
	{
		return 'Ping a host and return the result';
	}

	get actionPing_Schema()
	{
		return [
			{ Name: 'Host', DataType: 'String', Required: true },
			{ Name: 'Count', DataType: 'Integer', Required: false, Default: 4 }
		];
	}

	actionPing(pSettings, pWorkItem, fCallback)
	{
		let tmpCount = pSettings.Count || 4;
		let tmpCmd = `ping -c ${tmpCount} ${pSettings.Host}`;

		this.log.info(`Pinging ${pSettings.Host} (${tmpCount} packets)...`);

		libChildProcess.exec(tmpCmd, { timeout: 30000 }, (pError, pStdOut, pStdErr) =>
		{
			if (pError)
			{
				return fCallback(null, {
					Outputs: { Success: false, StdOut: pStdOut || '', StdErr: pStdErr || '', ExitCode: pError.code },
					Log: [`Ping failed: ${pError.message}`]
				});
			}
			return fCallback(null, {
				Outputs: { Success: true, StdOut: pStdOut, ExitCode: 0 },
				Log: [`Pinged ${pSettings.Host} successfully`]
			});
		});
	}

	// --- Action: Uptime ---

	get actionUptime_Description()
	{
		return 'Return the system uptime';
	}

	actionUptime(pSettings, pWorkItem, fCallback)
	{
		libChildProcess.exec('uptime', (pError, pStdOut) =>
		{
			if (pError) return fCallback(pError);
			return fCallback(null, {
				Outputs: { Uptime: pStdOut.trim() },
				Log: ['Retrieved system uptime']
			});
		});
	}

	// --- Action: Whoami ---

	get actionWhoami_Description()
	{
		return 'Return the current user and hostname';
	}

	actionWhoami(pSettings, pWorkItem, fCallback)
	{
		libChildProcess.exec('whoami && hostname', (pError, pStdOut) =>
		{
			if (pError) return fCallback(pError);
			let tmpLines = pStdOut.trim().split('\n');
			return fCallback(null, {
				Outputs: { User: tmpLines[0], Hostname: tmpLines[1] || '' },
				Log: ['Retrieved user and hostname']
			});
		});
	}

	// --- Action: RunCommand ---

	get actionRunCommand_Description()
	{
		return 'Execute an arbitrary shell command with a timeout';
	}

	get actionRunCommand_Schema()
	{
		return [
			{ Name: 'Command', DataType: 'String', Required: true },
			{ Name: 'TimeoutSeconds', DataType: 'Integer', Required: false, Default: 60 },
			{ Name: 'WorkingDirectory', DataType: 'String', Required: false }
		];
	}

	actionRunCommand(pSettings, pWorkItem, fCallback)
	{
		let tmpOptions = {
			timeout: (pSettings.TimeoutSeconds || 60) * 1000,
			maxBuffer: 10 * 1024 * 1024
		};

		if (pSettings.WorkingDirectory)
		{
			tmpOptions.cwd = pSettings.WorkingDirectory;
		}

		this.log.info(`Executing: ${pSettings.Command}`);

		libChildProcess.exec(pSettings.Command, tmpOptions, (pError, pStdOut, pStdErr) =>
		{
			let tmpExitCode = pError ? (pError.code || 1) : 0;
			return fCallback(null, {
				Outputs: {
					StdOut: pStdOut || '',
					StdErr: pStdErr || '',
					ExitCode: tmpExitCode,
					Success: tmpExitCode === 0
				},
				Log: [`Command exited with code ${tmpExitCode}`]
			});
		});
	}
}

// --- Startup ---

let tmpFable = new libFable({ Product: 'ShellCommands', ProductVersion: '1.0.0' });
tmpFable.addServiceType('ShellCommands', ShellCommands);
let tmpCap = tmpFable.instantiateServiceProvider('ShellCommands');

tmpCap.connect(
	{
		ServerURL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
		Name: `shell-${require('os').hostname()}`,
		MaxConcurrent: 4
	},
	(pError, pInfo) =>
	{
		if (pError) throw pError;
		console.log(`Shell commands beacon online: ${pInfo.BeaconID}`);
	});

process.on('SIGTERM', () => { tmpCap.disconnect(() => process.exit(0)); });
```

## Registered Task Types

- `beacon-shellcommands-ping`
- `beacon-shellcommands-uptime`
- `beacon-shellcommands-whoami`
- `beacon-shellcommands-runcommand`

## Key Points

- `exec` timeout prevents long-running commands from hanging
- Failed commands return results with `Success: false` rather than calling `fCallback(pError)` -- this ensures the work item completes (with error data in Outputs) rather than being marked as a hard failure
- `maxBuffer` is raised to 10MB for commands that produce large output
