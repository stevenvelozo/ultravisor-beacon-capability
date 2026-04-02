Ultravisor Beacon Capability
============================

A convention-based base class for building Ultravisor beacon capabilities with minimal boilerplate. Extend the class, define action methods with the `action` prefix, and call `connect()` — the module handles beacon registration, transport, and lifecycle automatically.

## Features

- **Convention Over Configuration** — Define actions as methods prefixed with `action`; schemas and descriptions as companion getters
- **Automatic Discovery** — Actions are discovered by walking the prototype chain, including multi-level inheritance
- **Simplified Handler Signature** — Settings are pre-extracted from work items so handlers receive `(pSettings, pWorkItem, fCallback, fReportProgress)`
- **Lifecycle Hooks** — Override `onInitialize()` and `onShutdown()` for setup and teardown (database connections, service handles, etc.)
- **Explicit Registration Escape Hatch** — Use `addAction()` for dynamic or runtime-generated actions alongside convention-based ones
- **Fable Ecosystem Integration** — Extends `fable-serviceproviderbase`; composes `ultravisor-beacon` internally

## Documentation

Comprehensive documentation is available in the [docs](./docs) folder:

- [Overview](./docs/README.md) — Introduction and getting started
- [Quick Start](./docs/quickstart.md) — Step-by-step setup guide
- [Architecture](./docs/architecture.md) — System design and mermaid diagrams
- [API Reference](./docs/api/README.md) — All classes and methods
- [Examples](./docs/examples/README.md) — Real-world usage patterns

## Install

```sh
$ npm install ultravisor-beacon-capability
```

## Quick Start

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');

class DiskCleanup extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'DiskCleanup';
		this.capabilityName = 'DiskCleanup';
	}

	get actionPurgeTempFiles_Description()
	{
		return 'Remove temporary files older than N days';
	}

	get actionPurgeTempFiles_Schema()
	{
		return [
			{ Name: 'Directory', DataType: 'String', Required: true },
			{ Name: 'MaxAgeDays', DataType: 'Integer', Required: true },
			{ Name: 'DryRun', DataType: 'Boolean', Required: false }
		];
	}

	actionPurgeTempFiles(pSettings, pWorkItem, fCallback)
	{
		let tmpCmd = `find ${pSettings.Directory} -type f -mtime +${pSettings.MaxAgeDays}`;
		if (!pSettings.DryRun)
		{
			tmpCmd += ' -delete';
		}
		require('child_process').exec(tmpCmd, (pError, pStdOut) =>
		{
			if (pError) return fCallback(pError);
			return fCallback(null, { Outputs: { Result: pStdOut, DryRun: !!pSettings.DryRun } });
		});
	}
}

let tmpFable = new libFable({ Product: 'DiskCleanup', ProductVersion: '1.0.0' });
tmpFable.addServiceType('DiskCleanup', DiskCleanup);
let tmpCleanup = tmpFable.instantiateServiceProvider('DiskCleanup');

tmpCleanup.connect(
	{
		ServerURL: 'http://ultravisor.local:54321',
		Name: 'disk-cleanup-worker'
	},
	(pError, pBeaconInfo) =>
	{
		if (pError) throw pError;
		console.log('Beacon online:', pBeaconInfo.BeaconID);
	});
```

Once connected, the Ultravisor server automatically creates a task type `beacon-diskcleanup-purgetempfiles` that can be triggered manually, scheduled, or wired into operation graphs.

## Related Packages

- [ultravisor-beacon](https://github.com/stevenvelozo/ultravisor-beacon) — Underlying beacon client and Fable service
- [ultravisor](https://github.com/stevenvelozo/ultravisor) — Process supervision and orchestration server
- [fable](https://github.com/stevenvelozo/fable) — Service dependency injection framework
- [fable-serviceproviderbase](https://github.com/stevenvelozo/fable-serviceproviderbase) — Service provider base class

## License

MIT

## Contributing

Pull requests are welcome. For details on our code of conduct, contribution process, and testing requirements, see the [Retold Contributing Guide](https://github.com/stevenvelozo/retold/blob/main/docs/contributing.md).
