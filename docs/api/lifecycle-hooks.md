# onInitialize / onShutdown

Lifecycle hooks for resource management. Override these methods in your subclass to set up and tear down resources that your actions depend on.

## onInitialize

Called after the beacon connects to the Ultravisor server, before it begins accepting work items.

### Signature

```javascript
onInitialize(fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `fCallback` | `function` | `function(pError)` — call with `null` on success, or an error to abort |

### Default

No-op — calls `fCallback(null)` immediately.

### Example

```javascript
onInitialize(fCallback)
{
	// Create a database connection pool
	this._Pool = require('mysql2').createPool({
		host: this.fable.settings.DatabaseHost || 'localhost',
		user: this.fable.settings.DatabaseUser || 'root',
		database: this.fable.settings.DatabaseName || 'mydb'
	});

	// Verify the connection
	this._Pool.query('SELECT 1', (pError) =>
	{
		if (pError)
		{
			this.log.error('Database connection failed:', pError.message);
			return fCallback(pError);
		}
		this.log.info('Database connection pool ready');
		return fCallback(null);
	});
}
```

## onShutdown

Called when the beacon disconnects from the Ultravisor server.

### Signature

```javascript
onShutdown(fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `fCallback` | `function` | `function(pError)` — call with `null` on success |

### Default

No-op — calls `fCallback(null)` immediately.

### Example

```javascript
onShutdown(fCallback)
{
	if (this._Pool)
	{
		this._Pool.end((pError) =>
		{
			if (pError)
			{
				this.log.warn('Error closing database pool:', pError.message);
			}
			this.log.info('Database connection pool closed');
			return fCallback(null);
		});
	}
	else
	{
		return fCallback(null);
	}
}
```

## Lifecycle Sequence

```
connect() called
  -> Beacon authenticates with Ultravisor server
  -> Beacon registers capabilities
  -> onInitialize() called
  -> Beacon begins accepting work items
  -> ... actions execute ...
disconnect() called
  -> Beacon stops accepting work items
  -> onShutdown() called
  -> Beacon deregisters from server
  -> Connection closed
```

## Common Use Cases

| Resource | onInitialize | onShutdown |
|----------|-------------|------------|
| Database connection pool | Create pool, test connection | Close pool |
| HTTP client / API token | Fetch auth token, create client | Revoke token |
| Temporary directory | Create staging directory | Remove directory |
| File handle / stream | Open file | Close file |
| External service handle | Connect to service | Disconnect |
