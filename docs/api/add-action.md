# addAction()

Explicitly register an action. Use this as an escape hatch for actions that cannot be expressed via the convention (e.g. dynamically generated actions, actions loaded from configuration, or actions with closures over external state).

## Signature

```javascript
addAction(pName, pDefinition)
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pName` | `string` | Action name (e.g. `'ProcessData'`) |
| `pDefinition` | `object` | Action definition (see below) |

### Definition

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `Handler` | `function` | Yes | `function(pWorkItem, pContext, fCallback, fReportProgress)` — uses the **raw** beacon handler signature |
| `Description` | `string` | No | Human-readable description |
| `SettingsSchema` | `array` | No | Array of field definitions |

**Important:** The `Handler` uses the raw `ultravisor-beacon` signature, not the simplified convention signature. This means `pWorkItem` is the first parameter (not `pSettings`).

## Behavior

- Stores the action in an internal map
- Explicit actions are merged with convention-discovered actions when `connect()` is called
- If an explicit action has the same name as a convention-discovered action, the explicit one wins
- Validation: rejects calls with missing/empty `pName` or missing `Handler` function

## Example

```javascript
let tmpFable = new libFable({});
let tmpCap = new MyCapability(tmpFable, {}, 'cap');

// Register a dynamic action
tmpCap.addAction('ImportCSV',
	{
		Description: 'Import data from a CSV file',
		SettingsSchema: [
			{ Name: 'FilePath', DataType: 'String', Required: true },
			{ Name: 'Delimiter', DataType: 'String', Required: false }
		],
		Handler: function (pWorkItem, pContext, fCallback)
		{
			let tmpSettings = pWorkItem.Settings || {};
			// ... process CSV ...
			return fCallback(null, { Outputs: { RowsImported: 42 } });
		}
	});

tmpCap.connect({ ServerURL: 'http://ultravisor:54321' }, (pError) => { });
```

## When to Use

| Scenario | Use Convention | Use addAction |
|----------|---------------|---------------|
| Standard action with known schema | Yes | — |
| Action generated from config at runtime | — | Yes |
| Action wrapping an external library callback | Either | Yes (simpler) |
| Action that needs the raw `pContext` parameter | — | Yes |
| Multiple capabilities sharing a common action | — | Yes |
