# API Reference

> Complete reference for ultravisor-beacon-capability

## Module Export

```javascript
const libBeaconCapability = require('ultravisor-beacon-capability');
```

The module exports `UltravisorBeaconCapability`, a class that extends `fable-serviceproviderbase`. You extend this class to define your capability.

## Classes

| Class | Description |
|-------|-------------|
| [UltravisorBeaconCapability](beacon-capability.md) | Base class -- extend to define capabilities with action methods |

## Convention

| Reference | Description |
|-----------|-------------|
| [Action Convention](action-convention.md) | How actions are discovered via the `action` prefix |

## Methods

| Method | Description |
|--------|-------------|
| [connect()](connect.md) | Connect to an Ultravisor server, register actions, begin accepting work |
| [disconnect()](disconnect.md) | Disconnect from the Ultravisor server |
| [addAction()](add-action.md) | Explicitly register an action (escape hatch for dynamic actions) |
| [isConnected()](is-connected.md) | Check whether the beacon is currently connected |

## Lifecycle Hooks

| Hook | Description |
|------|-------------|
| [onInitialize() / onShutdown()](lifecycle-hooks.md) | Setup and teardown hooks for resource management |

## Internal

| Function | Description |
|----------|-------------|
| [buildActionMap()](build-action-map.md) | Discovers action methods on a capability instance's prototype chain |
