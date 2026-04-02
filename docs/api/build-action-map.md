# buildActionMap

Discovers action methods on a capability instance by walking its prototype chain. This is an internal function used by `UltravisorBeaconCapability.connect()`, but it is exported for testing and advanced use cases.

## Import

```javascript
const { buildActionMap } = require('ultravisor-beacon-capability/source/Ultravisor-Beacon-Capability-ActionMap.cjs');
```

## Signature

```javascript
buildActionMap(pInstance) => object
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pInstance` | `object` | A capability instance to inspect |

### Returns

An object mapping action names to action definitions:

```javascript
{
	'ActionName':
	{
		Description: 'Human-readable description',
		SettingsSchema: [{ Name: 'Param', DataType: 'String', Required: true }],
		Handler: function (pWorkItem, pContext, fCallback, fReportProgress) { ... }
	}
}
```

The `Handler` function uses the raw `ultravisor-beacon` signature (not the convention signature). It wraps the bound action method with Settings pre-extraction.

## Example

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const { buildActionMap } = require('ultravisor-beacon-capability/source/Ultravisor-Beacon-Capability-ActionMap.cjs');

class MyCapability extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.capabilityName = 'Test';
	}

	get actionPing_Description() { return 'Respond with pong'; }
	actionPing(pSettings, pWorkItem, fCallback)
	{
		return fCallback(null, { Outputs: { Response: 'pong' } });
	}
}

let tmpFable = new libFable({});
let tmpCap = new MyCapability(tmpFable, {}, 'test');
let tmpMap = buildActionMap(tmpCap);

console.log(Object.keys(tmpMap));
// ['Ping']

console.log(tmpMap.Ping.Description);
// 'Respond with pong'
```

## Algorithm

1. Get the first prototype of the instance
2. While the prototype is not `Object.prototype`:
   a. For each own property name on the prototype:
      - Skip if already visited (subclass overrides win)
      - Skip if not starting with `action` or too short
      - Skip if ending with `_Schema` or `_Description`
      - Skip if not a function (via `Object.getOwnPropertyDescriptor`)
      - Strip `action` prefix to get the action name
      - Resolve `_Schema` companion (getter, value, or method)
      - Resolve `_Description` companion
      - Create bound handler with Settings extraction wrapper
      - Add to the action map
   b. Move to the next prototype in the chain
3. Return the action map
