# disconnect()

Disconnect from the Ultravisor server. Deregisters the beacon and cleans up the connection.

## Signature

```javascript
disconnect(fCallback)
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fCallback` | `function` | `function(pError)` -- called when disconnection completes |

## Behavior

1. If not currently connected, calls `fCallback(null)` immediately
2. Calls `disable()` on the underlying beacon service, which:
   - Sends a deregistration message to the server
   - Closes the WebSocket connection (if open)
   - Stops HTTP polling (if active)
   - Calls `onShutdown()` on the capability
3. Clears the internal beacon service reference
4. Calls `fCallback`

## Example

```javascript
// Graceful shutdown on SIGTERM
process.on('SIGTERM', () =>
{
	tmpCapability.disconnect((pError) =>
	{
		if (pError)
		{
			console.error('Disconnect error:', pError.message);
		}
		console.log('Beacon disconnected.');
		process.exit(0);
	});
});
```

## Notes

- Safe to call when not connected -- it is a no-op
- Safe to call without a callback -- errors are silently ignored
- After disconnecting, you can call `connect()` again to reconnect
