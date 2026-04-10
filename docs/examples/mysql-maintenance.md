# Example: MySQL Maintenance

A capability for recurring MySQL database maintenance tasks -- purging old records, optimizing tables, and exporting query results.

## Full Source

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const libMySQL = require('mysql2');

class MySQLMaintenance extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'MySQLMaintenance';
		this.capabilityName = 'MySQLMaintenance';

		this._Pool = null;
	}

	onInitialize(fCallback)
	{
		this._Pool = libMySQL.createPool({
			host: this.fable.settings.MySQL.Host || 'localhost',
			port: this.fable.settings.MySQL.Port || 3306,
			user: this.fable.settings.MySQL.User || 'root',
			password: this.fable.settings.MySQL.Password || '',
			database: this.fable.settings.MySQL.Database || 'myapp',
			connectionLimit: 5
		});

		// Verify connectivity
		this._Pool.query('SELECT 1 AS alive', (pError) =>
		{
			if (pError)
			{
				this.log.error(`MySQL connection failed: ${pError.message}`);
				return fCallback(pError);
			}
			this.log.info('MySQL connection pool ready');
			return fCallback(null);
		});
	}

	onShutdown(fCallback)
	{
		if (this._Pool)
		{
			this._Pool.end((pError) =>
			{
				if (pError) this.log.warn(`Pool close error: ${pError.message}`);
				this._Pool = null;
				return fCallback(null);
			});
		}
		else
		{
			return fCallback(null);
		}
	}

	// --- Action: PurgeOldRecords ---

	get actionPurgeOldRecords_Description()
	{
		return 'Delete records older than a specified number of days from a table';
	}

	get actionPurgeOldRecords_Schema()
	{
		return [
			{ Name: 'TableName', DataType: 'String', Required: true },
			{ Name: 'DateColumn', DataType: 'String', Required: true },
			{ Name: 'MaxAgeDays', DataType: 'Integer', Required: true },
			{ Name: 'BatchSize', DataType: 'Integer', Required: false, Default: 1000 },
			{ Name: 'DryRun', DataType: 'Boolean', Required: false, Default: true }
		];
	}

	actionPurgeOldRecords(pSettings, pWorkItem, fCallback, fReportProgress)
	{
		let tmpTable = this._Pool.escapeId(pSettings.TableName);
		let tmpColumn = this._Pool.escapeId(pSettings.DateColumn);
		let tmpDays = parseInt(pSettings.MaxAgeDays, 10);
		let tmpBatch = parseInt(pSettings.BatchSize, 10) || 1000;

		// Step 1: Count records to delete
		let tmpCountSQL = `SELECT COUNT(*) AS cnt FROM ${tmpTable} WHERE ${tmpColumn} < DATE_SUB(NOW(), INTERVAL ? DAY)`;

		this._Pool.query(tmpCountSQL, [tmpDays], (pCountError, pCountRows) =>
		{
			if (pCountError) return fCallback(pCountError);

			let tmpCount = pCountRows[0].cnt;
			fReportProgress({ Percent: 10, Message: `Found ${tmpCount} records to purge` });

			if (pSettings.DryRun)
			{
				return fCallback(null, {
					Outputs: { RecordsFound: tmpCount, DryRun: true, Deleted: 0 },
					Log: [`DRY RUN: Would delete ${tmpCount} records from ${pSettings.TableName}`]
				});
			}

			// Step 2: Delete in batches
			let tmpDeleteSQL = `DELETE FROM ${tmpTable} WHERE ${tmpColumn} < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT ?`;
			let tmpTotalDeleted = 0;

			let fnDeleteBatch = () =>
			{
				this._Pool.query(tmpDeleteSQL, [tmpDays, tmpBatch], (pDelError, pDelResult) =>
				{
					if (pDelError) return fCallback(pDelError);

					tmpTotalDeleted += pDelResult.affectedRows;
					let tmpPercent = Math.min(90, Math.round((tmpTotalDeleted / tmpCount) * 80) + 10);
					fReportProgress({ Percent: tmpPercent, Message: `Deleted ${tmpTotalDeleted} / ${tmpCount}` });

					if (pDelResult.affectedRows < tmpBatch)
					{
						return fCallback(null, {
							Outputs: { RecordsFound: tmpCount, Deleted: tmpTotalDeleted, DryRun: false },
							Log: [`Purged ${tmpTotalDeleted} records from ${pSettings.TableName}`]
						});
					}

					// Continue batching
					setImmediate(fnDeleteBatch);
				});
			};

			fnDeleteBatch();
		});
	}

	// --- Action: OptimizeTable ---

	get actionOptimizeTable_Description()
	{
		return 'Run OPTIMIZE TABLE to reclaim space and rebuild indexes';
	}

	get actionOptimizeTable_Schema()
	{
		return [
			{ Name: 'TableName', DataType: 'String', Required: true }
		];
	}

	actionOptimizeTable(pSettings, pWorkItem, fCallback)
	{
		let tmpTable = this._Pool.escapeId(pSettings.TableName);
		let tmpSQL = `OPTIMIZE TABLE ${tmpTable}`;

		this.log.info(`Optimizing table ${pSettings.TableName}...`);

		this._Pool.query(tmpSQL, (pError, pResults) =>
		{
			if (pError) return fCallback(pError);
			return fCallback(null, {
				Outputs: { Result: pResults },
				Log: [`Optimized table ${pSettings.TableName}`]
			});
		});
	}

	// --- Action: ExportQuery ---

	get actionExportQuery_Description()
	{
		return 'Execute a SELECT query and return the results as JSON';
	}

	get actionExportQuery_Schema()
	{
		return [
			{ Name: 'Query', DataType: 'String', Required: true },
			{ Name: 'MaxRows', DataType: 'Integer', Required: false, Default: 10000 }
		];
	}

	actionExportQuery(pSettings, pWorkItem, fCallback)
	{
		let tmpQuery = pSettings.Query;

		// Safety: reject non-SELECT queries
		if (!tmpQuery.trim().toUpperCase().startsWith('SELECT'))
		{
			return fCallback(new Error('ExportQuery only supports SELECT statements'));
		}

		let tmpMaxRows = parseInt(pSettings.MaxRows, 10) || 10000;
		let tmpSQL = `${tmpQuery} LIMIT ${tmpMaxRows}`;

		this._Pool.query(tmpSQL, (pError, pRows) =>
		{
			if (pError) return fCallback(pError);
			return fCallback(null, {
				Outputs: { Rows: pRows, RowCount: pRows.length, Truncated: pRows.length >= tmpMaxRows },
				Log: [`Exported ${pRows.length} rows`]
			});
		});
	}
}

// --- Startup ---

let tmpFable = new libFable({
	Product: 'MySQLMaintenance',
	ProductVersion: '1.0.0',
	MySQL:
	{
		Host: process.env.MYSQL_HOST || 'localhost',
		Port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
		User: process.env.MYSQL_USER || 'root',
		Password: process.env.MYSQL_PASSWORD || '',
		Database: process.env.MYSQL_DATABASE || 'myapp'
	}
});

tmpFable.addServiceType('MySQLMaintenance', MySQLMaintenance);
let tmpCap = tmpFable.instantiateServiceProvider('MySQLMaintenance');

tmpCap.connect(
	{
		ServerURL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
		Name: 'mysql-maintenance'
	},
	(pError) =>
	{
		if (pError) throw pError;
		console.log('MySQL maintenance beacon online');
	});

process.on('SIGTERM', () => { tmpCap.disconnect(() => process.exit(0)); });
```

## Registered Task Types

- `beacon-mysqlmaintenance-purgeoldrecords`
- `beacon-mysqlmaintenance-optimizetable`
- `beacon-mysqlmaintenance-exportquery`

## Key Points

- **Connection pool** is created in `onInitialize` and closed in `onShutdown`
- **Batch deletion** uses `LIMIT` and `setImmediate` to avoid locking the table for too long
- **Progress reporting** gives visibility into long-running purge operations
- **DryRun mode** counts affected records without deleting (defaults to `true` for safety)
- **ExportQuery** rejects non-SELECT statements to prevent accidental mutations
- Database credentials come from Fable settings, which can be sourced from environment variables
