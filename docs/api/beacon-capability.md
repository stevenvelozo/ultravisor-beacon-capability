# UltravisorBeaconCapability

The base class for all convention-based beacon capabilities. Extend this class, set `capabilityName`, define action methods with the `action` prefix, and call `connect()`.

## Import

```javascript
const libBeaconCapability = require('ultravisor-beacon-capability');
```

## Constructor

```javascript
class MyCapability extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'MyCapability';
		this.capabilityName = 'MyCapability';
		this.providerName = 'MyCapabilityProvider'; // optional
	}
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pFable` | `Fable` | Fable instance (provided by the framework) |
| `pOptions` | `object` | Service options (provided by the framework) |
| `pServiceHash` | `string` | Service hash identifier (provided by the framework) |

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `capabilityName` | `string` | `''` | **Required.** The capability name registered with Ultravisor. Must be set before calling `connect()`. |
| `providerName` | `string` | `''` | Optional display name. Defaults to `{capabilityName}Provider` if not set. |
| `serviceType` | `string` | `'UltravisorBeaconCapability'` | Fable service type identifier. Set to your class name. |

## Methods

| Method | Description |
|--------|-------------|
| [`connect(pBeaconConfig, fCallback)`](connect.md) | Connect to Ultravisor server |
| [`disconnect(fCallback)`](disconnect.md) | Disconnect from Ultravisor server |
| [`addAction(pName, pDefinition)`](add-action.md) | Register an explicit action |
| [`isConnected()`](is-connected.md) | Check connection status |

## Lifecycle Hooks

| Hook | Description |
|------|-------------|
| [`onInitialize(fCallback)`](lifecycle-hooks.md) | Called after beacon connects, before polling |
| [`onShutdown(fCallback)`](lifecycle-hooks.md) | Called when beacon disconnects |

## Usage with Fable

```javascript
const libFable = require('fable');

let tmpFable = new libFable({ Product: 'MyApp' });

// Register the service type
tmpFable.addServiceType('MyCapability', MyCapability);

// Instantiate
let tmpCap = tmpFable.instantiateServiceProvider('MyCapability');

// Connect
tmpCap.connect({ ServerURL: 'http://ultravisor:54321' }, (pError) =>
{
	if (pError) throw pError;
	console.log('Connected');
});
```

## Inheritance

`UltravisorBeaconCapability` extends `fable-serviceproviderbase`, which means your capability instance has access to all standard Fable service features:

- `this.fable` — the Fable instance
- `this.log` — the Fable logger (`this.log.info()`, `this.log.error()`, etc.)
- `this.options` — the service options
- `this.fable.settings` — application settings
- `this.fable.services` — other registered services

Multi-level inheritance is supported. Actions defined on base classes are discovered alongside those on derived classes, with derived classes taking precedence on name collision.
