# Examples

> Real-world usage patterns for ultravisor-beacon-capability

Each example below is a complete, self-contained capability class that demonstrates a practical automation scenario. These replace ad-hoc scripts that developers would otherwise run manually from their workstations.

## Examples

| Example | Description |
|---------|-------------|
| [Shell Commands](shell-commands.md) | Wrap basic shell commands (ping, uptime, whoami) as beacon actions |
| [MySQL Maintenance](mysql-maintenance.md) | Purge old records, run table optimization, export query results |
| [PostgreSQL Aggregation](postgresql-aggregation.md) | Run aggregation queries and materialized view refreshes |
| [REST API Health Check](rest-api-health-check.md) | Monitor multiple REST endpoints and report status |
| [REST Endpoint Sync](rest-endpoint-sync.md) | Fetch data from one API and push to another |
| [Log File Cleanup](log-file-cleanup.md) | Find and delete old log files by age and size |
| [Log Archive and Upload](log-archive-and-upload.md) | Compress log directories into archives and upload to S3 |
| [Server Metrics Collection](server-metrics-collection.md) | Collect CPU, memory, and disk metrics from the host |
| [Certificate Expiry Monitor](certificate-expiry-monitor.md) | Check TLS certificate expiry dates for a list of domains |
| [Docker Container Management](docker-container-management.md) | List, restart, and prune Docker containers and images |

## Pattern

Every example follows the same structure:

```javascript
const libBeaconCapability = require('ultravisor-beacon-capability');

class MyCapability extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'MyCapability';
		this.capabilityName = 'MyCapability';
	}

	// Optional: setup resources
	onInitialize(fCallback) { ... }

	// Optional: teardown resources
	onShutdown(fCallback) { ... }

	// Action with schema and description
	get actionDoWork_Description() { return '...'; }
	get actionDoWork_Schema() { return [...]; }
	actionDoWork(pSettings, pWorkItem, fCallback, fReportProgress) { ... }
}
```

## Running an Example

1. Copy the example code into a file
2. Install dependencies: `npm install ultravisor-beacon-capability fable`
3. Start an Ultravisor server
4. Run: `node my-example.js`

The capability connects as a beacon and its actions appear as task types in the Ultravisor dashboard.
