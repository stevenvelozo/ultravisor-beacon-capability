# isConnected()

Check whether the beacon is currently connected to an Ultravisor server.

## Signature

```javascript
isConnected() => boolean
```

### Returns

`true` if the beacon service exists and is enabled; `false` otherwise.

## Example

```javascript
if (tmpCapability.isConnected())
{
	console.log('Beacon is online and accepting work items');
}
else
{
	console.log('Beacon is offline');
	tmpCapability.connect({ ServerURL: 'http://ultravisor:54321' }, (pError) => { });
}
```

## Notes

- Returns `false` before `connect()` is called
- Returns `false` after `disconnect()` completes
- During auto-reconnection (after a connection drop), the beacon service remains enabled internally, so this may return `true` even while reconnecting
