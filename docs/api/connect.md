# connect()

Connect to an Ultravisor server, discover and register actions, and begin accepting work items.

## Signature

```javascript
connect(pBeaconConfig, fCallback)
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pBeaconConfig` | `object` | Connection configuration (see below) |
| `fCallback` | `function` | `function(pError, pBeaconInfo)` — called when connection completes or fails |

### Configuration

| Property | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `ServerURL` | `string` | — | Yes | Ultravisor server URL (e.g. `http://localhost:54321`) |
| `Name` | `string` | `capabilityName` | No | Beacon worker name for registration |
| `Password` | `string` | `''` | No | Authentication password |
| `MaxConcurrent` | `number` | `1` | No | Maximum number of work items to execute in parallel |
| `StagingPath` | `string` | `process.cwd()` | No | Directory for file transfer staging |
| `Tags` | `object` | `{}` | No | Metadata tags sent to the coordinator |
| `BindAddresses` | `array` | `[]` | No | Network addresses to advertise for direct access |

### Callback

On success, `fCallback` receives `(null, pBeaconInfo)` where `pBeaconInfo` contains:

| Property | Type | Description |
|----------|------|-------------|
| `BeaconID` | `string` | Unique identifier assigned by the server |

On failure, `fCallback` receives `(pError)`.

## Behavior

1. Validates that `ServerURL` is present in the config
2. Validates that `capabilityName` is set on the instance
3. Discovers action methods via `buildActionMap()`
4. Merges any explicitly registered actions (from `addAction()`)
5. Builds a capability descriptor
6. Registers the `UltravisorBeacon` service type with Fable (if not already registered)
7. Instantiates a beacon service with the provided config
8. Registers the capability descriptor with the beacon service
9. Enables the beacon (authenticates, registers with server, begins polling)

## Example

```javascript
tmpCapability.connect(
	{
		ServerURL: 'http://ultravisor.local:54321',
		Name: 'my-worker',
		Password: 'secret',
		MaxConcurrent: 4,
		Tags: { environment: 'production', host: require('os').hostname() }
	},
	(pError, pBeaconInfo) =>
	{
		if (pError)
		{
			console.error('Failed to connect:', pError.message);
			return;
		}
		console.log('Beacon online:', pBeaconInfo.BeaconID);
	});
```

## Error Cases

| Error | Cause |
|-------|-------|
| `ServerURL is required` | `pBeaconConfig.ServerURL` is missing or falsy |
| `capabilityName must be set` | `this.capabilityName` is empty |
| Authentication failure | Server rejected credentials |
| Network error | Server unreachable (beacon will auto-reconnect) |
