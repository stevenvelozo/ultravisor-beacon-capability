# Example: PostgreSQL Aggregation

A capability for running aggregation queries, refreshing materialized views, and collecting table statistics on a PostgreSQL database.

## Full Source

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const { Client } = require('pg');

class PostgresAggregation extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'PostgresAggregation';
		this.capabilityName = 'PostgresAggregation';

		this._Client = null;
	}

	onInitialize(fCallback)
	{
		this._Client = new Client({
			host: this.fable.settings.Postgres.Host || 'localhost',
			port: this.fable.settings.Postgres.Port || 5432,
			user: this.fable.settings.Postgres.User || 'postgres',
			password: this.fable.settings.Postgres.Password || '',
			database: this.fable.settings.Postgres.Database || 'analytics'
		});

		this._Client.connect((pError) =>
		{
			if (pError)
			{
				this.log.error(`PostgreSQL connection failed: ${pError.message}`);
				return fCallback(pError);
			}
			this.log.info('PostgreSQL client connected');
			return fCallback(null);
		});
	}

	onShutdown(fCallback)
	{
		if (this._Client)
		{
			this._Client.end()
				.then(() =>
				{
					this._Client = null;
					return fCallback(null);
				})
				.catch((pError) =>
				{
					this.log.warn(`PG disconnect error: ${pError.message}`);
					this._Client = null;
					return fCallback(null);
				});
		}
		else
		{
			return fCallback(null);
		}
	}

	// --- Action: RefreshMaterializedView ---

	get actionRefreshMaterializedView_Description()
	{
		return 'Refresh a materialized view, optionally concurrently';
	}

	get actionRefreshMaterializedView_Schema()
	{
		return [
			{ Name: 'ViewName', DataType: 'String', Required: true },
			{ Name: 'Concurrently', DataType: 'Boolean', Required: false, Default: true }
		];
	}

	actionRefreshMaterializedView(pSettings, pWorkItem, fCallback)
	{
		let tmpConcurrently = (pSettings.Concurrently !== false) ? 'CONCURRENTLY' : '';
		let tmpSQL = `REFRESH MATERIALIZED VIEW ${tmpConcurrently} ${pSettings.ViewName}`;

		this.log.info(`Refreshing view: ${pSettings.ViewName}`);
		let tmpStart = Date.now();

		this._Client.query(tmpSQL, (pError) =>
		{
			if (pError) return fCallback(pError);
			let tmpDuration = Date.now() - tmpStart;
			return fCallback(null, {
				Outputs: { ViewName: pSettings.ViewName, DurationMs: tmpDuration },
				Log: [`Refreshed ${pSettings.ViewName} in ${tmpDuration}ms`]
			});
		});
	}

	// --- Action: RunAggregation ---

	get actionRunAggregation_Description()
	{
		return 'Execute an aggregation query and return the results';
	}

	get actionRunAggregation_Schema()
	{
		return [
			{ Name: 'Query', DataType: 'String', Required: true },
			{ Name: 'Parameters', DataType: 'Array', Required: false }
		];
	}

	actionRunAggregation(pSettings, pWorkItem, fCallback)
	{
		let tmpQuery = pSettings.Query;

		// Safety: only allow read-only queries
		let tmpUpper = tmpQuery.trim().toUpperCase();
		if (!tmpUpper.startsWith('SELECT') && !tmpUpper.startsWith('WITH'))
		{
			return fCallback(new Error('RunAggregation only supports SELECT and CTE queries'));
		}

		let tmpParams = pSettings.Parameters || [];
		let tmpStart = Date.now();

		this._Client.query(tmpQuery, tmpParams, (pError, pResult) =>
		{
			if (pError) return fCallback(pError);
			let tmpDuration = Date.now() - tmpStart;
			return fCallback(null, {
				Outputs: {
					Rows: pResult.rows,
					RowCount: pResult.rowCount,
					DurationMs: tmpDuration,
					Fields: pResult.fields.map((pField) => pField.name)
				},
				Log: [`Aggregation returned ${pResult.rowCount} rows in ${tmpDuration}ms`]
			});
		});
	}

	// --- Action: TableStatistics ---

	get actionTableStatistics_Description()
	{
		return 'Collect size, row count, and index statistics for specified tables';
	}

	get actionTableStatistics_Schema()
	{
		return [
			{ Name: 'SchemaName', DataType: 'String', Required: false, Default: 'public' },
			{ Name: 'Tables', DataType: 'Array', Required: false }
		];
	}

	actionTableStatistics(pSettings, pWorkItem, fCallback)
	{
		let tmpSchema = pSettings.SchemaName || 'public';

		let tmpSQL = `
			SELECT
				relname AS table_name,
				pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
				pg_size_pretty(pg_relation_size(c.oid)) AS data_size,
				pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
				n_live_tup AS estimated_rows,
				last_vacuum,
				last_autovacuum,
				last_analyze
			FROM pg_class c
			JOIN pg_stat_user_tables s ON c.relname = s.relname
			WHERE c.relkind = 'r'
			AND s.schemaname = $1
			ORDER BY pg_total_relation_size(c.oid) DESC
		`;

		this._Client.query(tmpSQL, [tmpSchema], (pError, pResult) =>
		{
			if (pError) return fCallback(pError);

			let tmpRows = pResult.rows;

			// Filter to specific tables if requested
			if (pSettings.Tables && pSettings.Tables.length > 0)
			{
				let tmpTableSet = new Set(pSettings.Tables);
				tmpRows = tmpRows.filter((pRow) => tmpTableSet.has(pRow.table_name));
			}

			return fCallback(null, {
				Outputs: { Tables: tmpRows, Schema: tmpSchema },
				Log: [`Collected statistics for ${tmpRows.length} tables in ${tmpSchema}`]
			});
		});
	}
}

// --- Startup ---

let tmpFable = new libFable({
	Product: 'PostgresAggregation',
	ProductVersion: '1.0.0',
	Postgres:
	{
		Host: process.env.PGHOST || 'localhost',
		Port: parseInt(process.env.PGPORT, 10) || 5432,
		User: process.env.PGUSER || 'postgres',
		Password: process.env.PGPASSWORD || '',
		Database: process.env.PGDATABASE || 'analytics'
	}
});

tmpFable.addServiceType('PostgresAggregation', PostgresAggregation);
let tmpCap = tmpFable.instantiateServiceProvider('PostgresAggregation');

tmpCap.connect(
	{
		ServerURL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
		Name: 'postgres-aggregation'
	},
	(pError) =>
	{
		if (pError) throw pError;
		console.log('PostgreSQL aggregation beacon online');
	});

process.on('SIGTERM', () => { tmpCap.disconnect(() => process.exit(0)); });
```

## Registered Task Types

- `beacon-postgresaggregation-refreshmaterializedview`
- `beacon-postgresaggregation-runaggregation`
- `beacon-postgresaggregation-tablestatistics`

## Key Points

- **Materialized view refresh** supports `CONCURRENTLY` for zero-downtime refreshes
- **RunAggregation** accepts parameterized queries via `Parameters` array to prevent SQL injection
- **TableStatistics** uses PostgreSQL system catalogs for accurate size and vacuum information
- Query duration is measured and included in outputs for performance monitoring
