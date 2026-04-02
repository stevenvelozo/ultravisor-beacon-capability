# Example: Docker Container Management

A capability for listing, restarting, and pruning Docker containers and images. Wraps Docker CLI commands as beacon actions for remote orchestration through Ultravisor.

## Full Source

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const libChildProcess = require('child_process');

class DockerManagement extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'DockerManagement';
		this.capabilityName = 'DockerManagement';
	}

	/**
	 * Internal: run a docker command and return the output.
	 */
	_exec(pCmd, pTimeout, fCallback)
	{
		libChildProcess.exec(pCmd, { timeout: pTimeout || 60000, maxBuffer: 5 * 1024 * 1024 }, (pError, pStdOut, pStdErr) =>
		{
			if (pError)
			{
				return fCallback(new Error(`${pCmd}: ${pStdErr || pError.message}`));
			}
			return fCallback(null, pStdOut.trim());
		});
	}

	// --- Action: ListContainers ---

	get actionListContainers_Description()
	{
		return 'List Docker containers with status, ports, and resource usage';
	}

	get actionListContainers_Schema()
	{
		return [
			{ Name: 'All', DataType: 'Boolean', Required: false, Default: false, Description: 'Include stopped containers' },
			{ Name: 'Filter', DataType: 'String', Required: false, Description: 'Docker filter expression (e.g. "status=running")' }
		];
	}

	actionListContainers(pSettings, pWorkItem, fCallback)
	{
		let tmpFlags = pSettings.All ? '-a' : '';
		let tmpFilter = pSettings.Filter ? `--filter "${pSettings.Filter}"` : '';
		let tmpFormat = '{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Size}}';

		let tmpCmd = `docker ps ${tmpFlags} ${tmpFilter} --format '${tmpFormat}' --size`;

		this._exec(tmpCmd, 30000, (pError, pOutput) =>
		{
			if (pError) return fCallback(pError);

			let tmpContainers = pOutput.split('\n').filter(Boolean).map((pLine) =>
			{
				let tmpParts = pLine.split('\t');
				return {
					ID: tmpParts[0],
					Name: tmpParts[1],
					Image: tmpParts[2],
					Status: tmpParts[3],
					Ports: tmpParts[4],
					Size: tmpParts[5]
				};
			});

			return fCallback(null, {
				Outputs: { Containers: tmpContainers, Count: tmpContainers.length },
				Log: [`Found ${tmpContainers.length} containers`]
			});
		});
	}

	// --- Action: RestartContainer ---

	get actionRestartContainer_Description()
	{
		return 'Restart a Docker container by name or ID';
	}

	get actionRestartContainer_Schema()
	{
		return [
			{ Name: 'Container', DataType: 'String', Required: true, Description: 'Container name or ID' },
			{ Name: 'TimeoutSeconds', DataType: 'Integer', Required: false, Default: 10 }
		];
	}

	actionRestartContainer(pSettings, pWorkItem, fCallback)
	{
		let tmpTimeout = parseInt(pSettings.TimeoutSeconds, 10) || 10;
		let tmpCmd = `docker restart --time ${tmpTimeout} ${pSettings.Container}`;

		this.log.info(`Restarting container: ${pSettings.Container}`);

		this._exec(tmpCmd, 120000, (pError, pOutput) =>
		{
			if (pError) return fCallback(pError);

			// Verify it's running
			this._exec(`docker inspect --format '{{.State.Status}}' ${pSettings.Container}`, 10000, (pInspectError, pStatus) =>
			{
				return fCallback(null, {
					Outputs: {
						Container: pSettings.Container,
						Status: pStatus || 'unknown',
						Restarted: true
					},
					Log: [`Restarted ${pSettings.Container}, status: ${pStatus || 'unknown'}`]
				});
			});
		});
	}

	// --- Action: PruneSystem ---

	get actionPruneSystem_Description()
	{
		return 'Remove unused containers, images, networks, and volumes';
	}

	get actionPruneSystem_Schema()
	{
		return [
			{ Name: 'Volumes', DataType: 'Boolean', Required: false, Default: false, Description: 'Also prune unused volumes' },
			{ Name: 'OlderThanHours', DataType: 'Integer', Required: false, Description: 'Only prune resources older than N hours' }
		];
	}

	actionPruneSystem(pSettings, pWorkItem, fCallback, fReportProgress)
	{
		let tmpFilter = pSettings.OlderThanHours ? `--filter "until=${pSettings.OlderThanHours}h"` : '';
		let tmpVolumes = pSettings.Volumes ? '--volumes' : '';
		let tmpResults = {};

		fReportProgress({ Percent: 10, Message: 'Pruning containers...' });

		// Prune stopped containers
		this._exec(`docker container prune -f ${tmpFilter}`, 60000, (pContainerError, pContainerOut) =>
		{
			tmpResults.ContainerPrune = pContainerOut || (pContainerError ? pContainerError.message : 'done');

			fReportProgress({ Percent: 30, Message: 'Pruning images...' });

			// Prune dangling images
			this._exec(`docker image prune -f ${tmpFilter}`, 120000, (pImageError, pImageOut) =>
			{
				tmpResults.ImagePrune = pImageOut || (pImageError ? pImageError.message : 'done');

				fReportProgress({ Percent: 60, Message: 'Pruning networks...' });

				// Prune networks
				this._exec(`docker network prune -f ${tmpFilter}`, 30000, (pNetError, pNetOut) =>
				{
					tmpResults.NetworkPrune = pNetOut || (pNetError ? pNetError.message : 'done');

					if (pSettings.Volumes)
					{
						fReportProgress({ Percent: 80, Message: 'Pruning volumes...' });

						this._exec('docker volume prune -f', 60000, (pVolError, pVolOut) =>
						{
							tmpResults.VolumePrune = pVolOut || (pVolError ? pVolError.message : 'done');

							return fCallback(null, {
								Outputs: tmpResults,
								Log: ['Docker system prune complete (including volumes)']
							});
						});
					}
					else
					{
						return fCallback(null, {
							Outputs: tmpResults,
							Log: ['Docker system prune complete (volumes skipped)']
						});
					}
				});
			});
		});
	}

	// --- Action: ContainerLogs ---

	get actionContainerLogs_Description()
	{
		return 'Retrieve recent logs from a Docker container';
	}

	get actionContainerLogs_Schema()
	{
		return [
			{ Name: 'Container', DataType: 'String', Required: true },
			{ Name: 'TailLines', DataType: 'Integer', Required: false, Default: 100 },
			{ Name: 'Since', DataType: 'String', Required: false, Description: 'Show logs since timestamp or relative (e.g. "1h", "2024-01-01")' }
		];
	}

	actionContainerLogs(pSettings, pWorkItem, fCallback)
	{
		let tmpTail = parseInt(pSettings.TailLines, 10) || 100;
		let tmpSince = pSettings.Since ? `--since ${pSettings.Since}` : '';

		let tmpCmd = `docker logs --tail ${tmpTail} ${tmpSince} ${pSettings.Container} 2>&1`;

		this._exec(tmpCmd, 30000, (pError, pOutput) =>
		{
			if (pError) return fCallback(pError);
			return fCallback(null, {
				Outputs: {
					Container: pSettings.Container,
					Logs: pOutput,
					LineCount: pOutput.split('\n').length
				},
				Log: [`Retrieved ${tmpTail} tail lines from ${pSettings.Container}`]
			});
		});
	}
}

// --- Startup ---

let tmpFable = new libFable({ Product: 'DockerManagement', ProductVersion: '1.0.0' });
tmpFable.addServiceType('DockerManagement', DockerManagement);
let tmpCap = tmpFable.instantiateServiceProvider('DockerManagement');

tmpCap.connect(
	{
		ServerURL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
		Name: `docker-mgmt-${require('os').hostname()}`,
		MaxConcurrent: 2
	},
	(pError) =>
	{
		if (pError) throw pError;
		console.log('Docker management beacon online');
	});

process.on('SIGTERM', () => { tmpCap.disconnect(() => process.exit(0)); });
```

## Registered Task Types

- `beacon-dockermanagement-listcontainers`
- `beacon-dockermanagement-restartcontainer`
- `beacon-dockermanagement-prunesystem`
- `beacon-dockermanagement-containerlogs`

## Key Points

- **Wraps Docker CLI** — requires `docker` to be available on the host
- **RestartContainer** verifies the container is running after restart
- **PruneSystem** is sequential (containers → images → networks → volumes) with progress reporting
- **OlderThanHours** filter prevents pruning of recently used resources
- **ContainerLogs** captures both stdout and stderr via `2>&1`
- Useful for managing Docker hosts where you want centralized visibility and control through Ultravisor
