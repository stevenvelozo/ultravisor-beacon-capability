# Action Convention

Actions are discovered automatically by examining method names on your class. Any method starting with `action` (and longer than just the word "action") is treated as an action handler. Companion getters provide metadata.

## Defining an Action

An action named `DoSomething` consists of up to three members:

### Handler (required)

```javascript
actionDoSomething(pSettings, pWorkItem, fCallback, fReportProgress)
{
	// pSettings — pre-extracted from pWorkItem.Settings (defaults to {} if missing)
	// pWorkItem — the full work item object from Ultravisor
	// fCallback — function(pError, pResult) where pResult = { Outputs: {...}, Log: [...] }
	// fReportProgress — optional function({ Percent, Message, Step, TotalSteps })

	return fCallback(null, { Outputs: { Result: 'done' } });
}
```

### Schema (optional)

```javascript
get actionDoSomething_Schema()
{
	return [
		{ Name: 'InputFile', DataType: 'String', Required: true },
		{ Name: 'OutputFormat', DataType: 'String', Required: false },
		{ Name: 'MaxRows', DataType: 'Integer', Required: false }
	];
}
```

The schema is an array of field definitions. Each field has:

| Property | Type | Description |
|----------|------|-------------|
| `Name` | `string` | Parameter name |
| `DataType` | `string` | Type: `String`, `Integer`, `Boolean`, `Object`, `Array`, `DateTime` |
| `Required` | `boolean` | Whether the parameter is required |
| `Default` | `any` | Optional default value |
| `Description` | `string` | Optional human-readable description |

### Description (optional)

```javascript
get actionDoSomething_Description()
{
	return 'Process an input file and produce output in the specified format';
}
```

## Handler Signature

The convention handler signature differs from the raw `ultravisor-beacon` handler:

| Parameter | Convention | Raw beacon |
|-----------|-----------|------------|
| 1st | `pSettings` (pre-extracted) | `pWorkItem` |
| 2nd | `pWorkItem` (full object) | `pContext` |
| 3rd | `fCallback` | `fCallback` |
| 4th | `fReportProgress` | `fReportProgress` |

The base class wraps your method so that `ultravisor-beacon` receives the raw signature it expects.

## Result Format

The callback expects:

```javascript
// Success
fCallback(null, {
	Outputs: { Key: 'value', AnotherKey: 123 },
	Log: ['Step 1 complete', 'Step 2 complete']
});

// Error
fCallback(new Error('Something went wrong'));
```

- `Outputs` — key-value pairs available as task state outputs on the Ultravisor server
- `Log` — array of log strings recorded with the work item result

## Progress Reporting

For long-running actions, use `fReportProgress`:

```javascript
actionLongTask(pSettings, pWorkItem, fCallback, fReportProgress)
{
	fReportProgress({ Percent: 0, Message: 'Starting...', Step: 1, TotalSteps: 3 });

	// ... do step 1 ...

	fReportProgress({ Percent: 33, Message: 'Step 1 complete', Step: 2, TotalSteps: 3 });

	// ... do step 2 ...

	fReportProgress({ Percent: 66, Message: 'Step 2 complete', Step: 3, TotalSteps: 3 });

	// ... do step 3 ...

	return fCallback(null, { Outputs: { Result: 'all done' } });
}
```

## Discovery Rules

1. Method name must start with `action` and be longer than 6 characters
2. Methods ending with `_Schema` or `_Description` are companions, not actions
3. Only actual functions are considered (not getters or plain properties)
4. The prototype chain is walked from the derived class up to (but not including) `Object.prototype`
5. If a method name appears on both a derived and base class, the derived version wins
6. Missing `_Schema` defaults to `[]`; missing `_Description` defaults to `''`

## `this` Context

Action methods are bound to the capability instance. You have full access to:

```javascript
actionQuery(pSettings, pWorkItem, fCallback)
{
	// Access Fable services
	this.fable.services.SomeService.doWork();

	// Access the logger
	this.log.info('Processing query...');

	// Access instance state set in onInitialize
	this._DatabaseConnection.query(pSettings.SQL, (pError, pRows) =>
	{
		if (pError) return fCallback(pError);
		return fCallback(null, { Outputs: { Rows: pRows } });
	});
}
```

## Naming Conventions

The action name is derived by stripping the `action` prefix. The casing is preserved:

| Method Name | Action Name | Task Type Hash |
|-------------|-------------|----------------|
| `actionPurgeRecords` | `PurgeRecords` | `beacon-{cap}-purgerecords` |
| `actionRunBackup` | `RunBackup` | `beacon-{cap}-runbackup` |
| `actionSyncData` | `SyncData` | `beacon-{cap}-syncdata` |
