# Architecture

Ultravisor Beacon Capability is a thin convention layer on top of `ultravisor-beacon`. It discovers action methods on your subclass, builds the capability descriptor that `ultravisor-beacon` expects, and delegates all transport and execution to the underlying beacon service.

## Class Hierarchy

```mermaid
graph TD
    FSPB[fable-serviceproviderbase<br/><small>Fable service base class</small>]
    UBC[UltravisorBeaconCapability<br/><small>Convention-based base class</small>]
    YOUR[YourCapability<br/><small>Your subclass with action methods</small>]

    AM[ActionMap<br/><small>Prototype chain walker</small>]
    UBS[UltravisorBeaconService<br/><small>ultravisor-beacon</small>]

    CM[CapabilityManager<br/><small>Descriptor store</small>]
    BC[BeaconClient<br/><small>Transport + polling</small>]
    PR[ProviderRegistry<br/><small>Provider index</small>]
    CA[CapabilityAdapter<br/><small>Descriptor to provider bridge</small>]

    FSPB -->|extends| UBC
    UBC -->|extends| YOUR
    UBC -->|uses| AM
    UBC -->|composes| UBS

    UBS --> CM
    UBS --> BC
    CM -->|buildProviderDescriptors| CA
    CA -->|registerProvider| PR
    BC --> PR

    style UBC fill:#e1f5fe
    style YOUR fill:#c8e6c9
    style AM fill:#fff3e0
```

## Module Composition

The capability base class composes three internal concerns:

| Component | Source | Responsibility |
|-----------|--------|----------------|
| **ActionMap** | `Ultravisor-Beacon-Capability-ActionMap.cjs` | Discovers `action*` methods on the prototype chain; resolves companion `_Schema` and `_Description` properties; builds bound handlers |
| **UltravisorBeaconCapability** | `Ultravisor-Beacon-Capability.cjs` | Base class; merges discovered and explicit actions; builds the capability descriptor; manages beacon lifecycle |
| **UltravisorBeaconService** | `ultravisor-beacon` (external) | Handles authentication, transport negotiation, polling, heartbeat, work item execution |

## Connect Flow

When you call `connect()`, the following sequence executes:

```mermaid
sequenceDiagram
    participant Dev as Your Code
    participant Cap as BeaconCapability
    participant AM as ActionMap
    participant BS as BeaconService
    participant UV as Ultravisor Server

    Dev->>Cap: connect({ ServerURL, Name, ... })
    Cap->>AM: buildActionMap(this)
    AM-->>Cap: { ActionName: { Handler, Schema, Description } }
    Cap->>Cap: Merge explicit actions (addAction)
    Cap->>Cap: Build capability descriptor
    Cap->>BS: new UltravisorBeaconService(config)
    Cap->>BS: registerCapability(descriptor)
    Cap->>BS: enable()
    BS->>UV: POST /1.0/Authenticate
    UV-->>BS: session cookie
    BS->>UV: POST /Beacon/Register
    UV-->>BS: { BeaconID }
    UV->>UV: Create task types for each action
    BS-->>Cap: callback(null, beaconInfo)
    Cap-->>Dev: callback(null, beaconInfo)

    Note over UV: Task types now available:<br/>beacon-{capability}-{action}
```

## Action Discovery

The `buildActionMap()` function walks the prototype chain of your capability instance to find action methods:

```mermaid
flowchart TD
    START([Start]) --> PROTO[Get prototype of instance]
    PROTO --> CHECK{prototype !== Object.prototype?}
    CHECK -->|No| DONE([Return action map])
    CHECK -->|Yes| PROPS[Get own property names]
    PROPS --> EACH{Next property name}
    EACH -->|None left| NEXT[Get parent prototype]
    NEXT --> CHECK

    EACH -->|Has name| VISITED{Already visited?}
    VISITED -->|Yes| EACH
    VISITED -->|No| PREFIX{Starts with 'action'?}
    PREFIX -->|No| EACH
    PREFIX -->|Yes| SUFFIX{Ends with '_Schema' or '_Description'?}
    SUFFIX -->|Yes| EACH
    SUFFIX -->|No| FUNC{Is a function?}
    FUNC -->|No| EACH
    FUNC -->|Yes| EXTRACT[Strip 'action' prefix to get action name]
    EXTRACT --> SCHEMA[Resolve companion _Schema]
    SCHEMA --> DESC[Resolve companion _Description]
    DESC --> HANDLER[Create bound handler with Settings extraction]
    HANDLER --> ADD[Add to action map]
    ADD --> EACH

    style EXTRACT fill:#c8e6c9
    style HANDLER fill:#c8e6c9
```

Key behaviors:
- **Subclass wins** -- If a method name is seen on a derived class, the base class version is skipped
- **Getters supported** -- `_Schema` and `_Description` companions can be ES class getters, plain properties, or methods
- **Bound handlers** -- Each handler is bound to the instance, preserving `this` context for access to services, connections, and state

## Handler Wrapping

The convention-based handler signature differs from the raw `ultravisor-beacon` handler signature. The ActionMap creates a wrapper that bridges the two:

```
Convention (your code):
  actionDoWork(pSettings, pWorkItem, fCallback, fReportProgress)

Raw beacon (what ultravisor-beacon expects):
  Handler(pWorkItem, pContext, fCallback, fReportProgress)

Wrapper (created by ActionMap):
  function(pWorkItem, pContext, fCallback, fReportProgress)
  {
      let tmpSettings = (pWorkItem && pWorkItem.Settings) ? pWorkItem.Settings : {};
      return boundMethod(tmpSettings, pWorkItem, fCallback, fReportProgress);
  }
```

The `pContext` parameter (containing `{ StagingPath }`) is not forwarded because it is unused in practice. If needed, it is available via `this.options.StagingPath` on the capability instance.

## Capability Descriptor

The base class produces a descriptor matching the shape documented in `ultravisor-beacon`'s `CapabilityManager`:

```javascript
{
    Capability: 'YourCapabilityName',
    Name: 'YourCapabilityNameProvider',
    actions:
    {
        'ActionOne':
        {
            Description: 'What it does',
            SettingsSchema: [{ Name: 'Param', DataType: 'String', Required: true }],
            Handler: function (pWorkItem, pContext, fCallback, fReportProgress) { ... }
        },
        'ActionTwo': { ... }
    },
    initialize: function (fCallback) { /* delegates to onInitialize */ },
    shutdown: function (fCallback) { /* delegates to onShutdown */ }
}
```

The `initialize` and `shutdown` functions delegate to `onInitialize()` and `onShutdown()` on your subclass.

## Server-Side Task Registration

When the Ultravisor server receives the beacon registration, its coordinator automatically creates task types for each action:

```mermaid
graph LR
    REG[Beacon registers<br/>Capability: DBMaint<br/>Actions: PurgeOld, Vacuum] --> COORD[Coordinator]
    COORD --> T1[Task Type:<br/>beacon-dbmaint-purgeold]
    COORD --> T2[Task Type:<br/>beacon-dbmaint-vacuum]

    T1 --> UI[Ultravisor Dashboard]
    T2 --> UI
    T1 --> SCHED[Scheduler]
    T2 --> SCHED
    T1 --> GRAPH[Operation Graphs]
    T2 --> GRAPH

    style T1 fill:#e1f5fe
    style T2 fill:#e1f5fe
```

Each task type includes:
- **SettingsInputs** derived from the action's `SettingsSchema`
- **EventInputs/Outputs** for graph wiring (Trigger, Complete, Error)
- **StateOutputs** for capturing results (Result, StdOut)

## Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: new YourCapability(fable, options)
    Created --> Connecting: connect(config)
    Connecting --> Initializing: onInitialize()
    Initializing --> Connected: Beacon enabled
    Connected --> Executing: Work item received
    Executing --> Connected: Work item complete
    Connected --> ShuttingDown: disconnect()
    ShuttingDown --> Disconnected: onShutdown()
    Disconnected --> [*]

    Connected --> Reconnecting: Connection lost
    Reconnecting --> Connected: Auto-reconnect

    note right of Initializing
        Override onInitialize() to set up
        database connections, service handles,
        or other resources your actions need
    end note

    note right of ShuttingDown
        Override onShutdown() to close
        connections and release resources
    end note
```

## File Layout

```
ultravisor-beacon-capability/
  package.json
  README.md
  source/
    Ultravisor-Beacon-Capability.cjs          # Base class (main export)
    Ultravisor-Beacon-Capability-ActionMap.cjs # Action discovery helper
  test/
    Ultravisor-Beacon-Capability_tests.js     # Mocha TDD tests
  docs/
    README.md                                  # Overview
    _cover.md                                  # Landing page
    _sidebar.md                                # Navigation
    _topbar.md                                 # Top bar
    quickstart.md                              # Step-by-step guide
    architecture.md                            # This file
    api/                                       # API reference
    examples/                                  # Real-world examples
```
