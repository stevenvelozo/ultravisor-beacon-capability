# Ultravisor Beacon Capability

> Convention-based base class for building Ultravisor beacon capabilities

Ultravisor Beacon Capability eliminates the boilerplate of wiring up an Ultravisor beacon. Instead of manually creating a beacon service, building capability descriptors, and managing the connection lifecycle, you extend a single base class, write action methods, and call `connect()`. The module discovers your actions by convention, builds the capability descriptor, registers with the Ultravisor server, and manages the full beacon lifecycle.

The Ultravisor server automatically creates task types (cards) for each action your capability exposes. These can be triggered on demand, scheduled for recurring execution, or composed into multi-step operation graphs -- turning ad-hoc scripts into managed, observable automation.

## Features

- **Convention Over Configuration** -- Define actions as methods prefixed with `action`; schemas and descriptions as companion getters
- **Automatic Discovery** -- Actions are discovered by walking the prototype chain, including multi-level inheritance
- **Simplified Handler Signature** -- Settings are pre-extracted from work items so handlers receive `(pSettings, pWorkItem, fCallback, fReportProgress)`
- **Lifecycle Hooks** -- Override `onInitialize()` and `onShutdown()` for setup and teardown (database connections, service handles, etc.)
- **Explicit Registration Escape Hatch** -- Use `addAction()` for dynamic or runtime-generated actions alongside convention-based ones
- **Fable Ecosystem Integration** -- Extends `fable-serviceproviderbase`; composes `ultravisor-beacon` internally

## Quick Start

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');

class HealthCheck extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'HealthCheck';
		this.capabilityName = 'HealthCheck';
	}

	get actionCheckDiskSpace_Description()
	{
		return 'Report available disk space on the host';
	}

	actionCheckDiskSpace(pSettings, pWorkItem, fCallback)
	{
		require('child_process').exec('df -h', (pError, pStdOut) =>
		{
			if (pError) return fCallback(pError);
			return fCallback(null, { Outputs: { DiskUsage: pStdOut } });
		});
	}
}

let tmpFable = new libFable({ Product: 'HealthCheck' });
tmpFable.addServiceType('HealthCheck', HealthCheck);
let tmpCheck = tmpFable.instantiateServiceProvider('HealthCheck');

tmpCheck.connect({ ServerURL: 'http://ultravisor.local:54321' }, (pError) =>
{
	if (pError) throw pError;
	console.log('Health check beacon online');
});
```

## Installation

```bash
npm install ultravisor-beacon-capability
```

## Core Concepts

### The Action Convention

Actions are discovered by method name prefix. An action named `PurgeRecords` is defined by up to three members on your class:

| Member | Required | Purpose |
|--------|----------|---------|
| `actionPurgeRecords(pSettings, pWorkItem, fCallback, fReportProgress)` | Yes | The handler function |
| `get actionPurgeRecords_Schema()` | No | Returns a `SettingsSchema` array describing input parameters |
| `get actionPurgeRecords_Description()` | No | Returns a human-readable description string |

The handler receives `pSettings` pre-extracted from `pWorkItem.Settings` (defaulting to `{}` if absent), eliminating the universal boilerplate of `let tmpSettings = pWorkItem.Settings || {};`.

### Server-Side Integration

When a beacon registers capabilities, the Ultravisor server's coordinator automatically creates task types for each `Capability:Action` pair. The task type hash follows the format `beacon-{capability}-{action}` (e.g. `beacon-healthcheck-checkdiskspace`). These task types appear as cards in the Ultravisor UI and can be:

- **Triggered manually** from the Ultravisor dashboard
- **Scheduled** for recurring execution
- **Composed** into operation graphs with other task types

### Before and After

Without this module, registering a single capability requires approximately 60 lines of framework code (service type registration, beacon instantiation, descriptor building, lifecycle management). With this module, the same result requires approximately 5 lines of framework code -- one class declaration, one `capabilityName` assignment, and one `connect()` call.

## Documentation

- [Quick Start](quickstart.md) -- Step-by-step setup
- [Architecture](architecture.md) -- System design with diagrams
- [API Reference](api/README.md) -- Complete class and method reference
- [Examples](examples/README.md) -- Real-world usage patterns

## Related Packages

- [ultravisor-beacon](https://github.com/stevenvelozo/ultravisor-beacon) -- Underlying beacon client and Fable service
- [ultravisor](https://github.com/stevenvelozo/ultravisor) -- Process supervision and orchestration server
- [fable](https://github.com/stevenvelozo/fable) -- Service dependency injection framework
- [fable-serviceproviderbase](https://github.com/stevenvelozo/fable-serviceproviderbase) -- Service provider base class
