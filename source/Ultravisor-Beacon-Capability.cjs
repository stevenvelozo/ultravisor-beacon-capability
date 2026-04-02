/**
 * Ultravisor Beacon Capability
 *
 * Convention-based base class for building Ultravisor beacon
 * capabilities with minimal boilerplate.  Extend this class,
 * define action methods with the `action` prefix, and call
 * connect() to register with an Ultravisor server.
 *
 * Action Convention:
 *   actionDoSomething(pSettings, pWorkItem, fCallback, fReportProgress)
 *   get actionDoSomething_Schema()       // optional: SettingsSchema array
 *   get actionDoSomething_Description()  // optional: description string
 *
 * Lifecycle Hooks (override as needed):
 *   onInitialize(fCallback)  // called after beacon connects
 *   onShutdown(fCallback)    // called when beacon disconnects
 *
 * Usage:
 *   class MyCapability extends UltravisorBeaconCapability
 *   {
 *       constructor(pFable, pOptions, pServiceHash)
 *       {
 *           super(pFable, pOptions, pServiceHash);
 *           this.serviceType = 'MyCapability';
 *           this.capabilityName = 'MyCapability';
 *       }
 *
 *       actionDoWork(pSettings, pWorkItem, fCallback)
 *       {
 *           return fCallback(null, { Outputs: { Result: 'done' } });
 *       }
 *   }
 *
 *   let tmpCap = tmpFable.instantiateServiceProvider('MyCapability');
 *   tmpCap.connect({ ServerURL: 'http://ultravisor:54321' }, (pErr) => {});
 */

const libFableServiceProviderBase = require('fable-serviceproviderbase');
const libBeaconService = require('ultravisor-beacon');
const libActionMap = require('./Ultravisor-Beacon-Capability-ActionMap.cjs');

class UltravisorBeaconCapability extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'UltravisorBeaconCapability';

		/** @type {string} Capability name registered with Ultravisor */
		this.capabilityName = '';

		/** @type {string} Optional provider display name */
		this.providerName = '';

		/** @type {object|null} The underlying beacon service instance */
		this._BeaconService = null;

		/** @type {object} Explicitly registered actions (via addAction) */
		this._ExplicitActions = {};
	}

	// ================================================================
	// Lifecycle Hooks (override in subclass)
	// ================================================================

	/**
	 * Called after the beacon connects, before polling begins.
	 * Override to perform async setup (e.g. database connections).
	 *
	 * @param {function} fCallback - function(pError)
	 */
	onInitialize(fCallback)
	{
		return fCallback(null);
	}

	/**
	 * Called when the beacon disconnects.
	 * Override to perform cleanup.
	 *
	 * @param {function} fCallback - function(pError)
	 */
	onShutdown(fCallback)
	{
		return fCallback(null);
	}

	// ================================================================
	// Public API
	// ================================================================

	/**
	 * Explicitly register an action (escape hatch for dynamic actions).
	 * Uses the raw registerCapability handler signature.
	 *
	 * @param {string} pName - Action name
	 * @param {object} pDefinition - { Description, SettingsSchema, Handler }
	 */
	addAction(pName, pDefinition)
	{
		if (!pName || typeof pName !== 'string')
		{
			this.log.error('[BeaconCapability] addAction requires a string name.');
			return;
		}
		if (!pDefinition || typeof pDefinition.Handler !== 'function')
		{
			this.log.error(`[BeaconCapability] addAction "${pName}" requires a Handler function.`);
			return;
		}

		this._ExplicitActions[pName] = {
			Description: pDefinition.Description || '',
			SettingsSchema: pDefinition.SettingsSchema || [],
			Handler: pDefinition.Handler
		};
	}

	/**
	 * Connect to an Ultravisor server, discover actions, and begin
	 * accepting work items.
	 *
	 * @param {object} pBeaconConfig - Connection configuration
	 * @param {string} pBeaconConfig.ServerURL - Ultravisor server URL
	 * @param {string} [pBeaconConfig.Name] - Beacon name
	 * @param {string} [pBeaconConfig.Password] - Auth password
	 * @param {number} [pBeaconConfig.MaxConcurrent] - Max parallel work items
	 * @param {string} [pBeaconConfig.StagingPath] - File staging directory
	 * @param {object} [pBeaconConfig.Tags] - Metadata tags
	 * @param {Array}  [pBeaconConfig.BindAddresses] - Network addresses to advertise
	 * @param {function} fCallback - function(pError, pBeaconInfo)
	 */
	connect(pBeaconConfig, fCallback)
	{
		if (typeof fCallback !== 'function')
		{
			fCallback = (pError) =>
			{
				if (pError)
				{
					this.log.error(`[BeaconCapability] connect error: ${pError.message}`);
				}
			};
		}

		if (!pBeaconConfig || !pBeaconConfig.ServerURL)
		{
			return fCallback(new Error('[BeaconCapability] ServerURL is required in beacon config.'));
		}

		if (!this.capabilityName)
		{
			return fCallback(new Error('[BeaconCapability] capabilityName must be set before calling connect().'));
		}

		// Build the action map from convention + explicit registrations
		let tmpActions = this._buildActions();

		if (Object.keys(tmpActions).length === 0)
		{
			this.log.warn(`[BeaconCapability] Capability "${this.capabilityName}" has no actions.`);
		}

		// Build the capability descriptor
		let tmpSelf = this;
		let tmpDescriptor = {
			Capability: this.capabilityName,
			Name: this.providerName || `${this.capabilityName}Provider`,
			actions: tmpActions,
			initialize: function (fInitCallback)
			{
				tmpSelf.onInitialize(fInitCallback);
			},
			shutdown: function (fShutdownCallback)
			{
				tmpSelf.onShutdown(fShutdownCallback);
			}
		};

		// Register the beacon service type with Fable
		this.fable.addServiceTypeIfNotExists('UltravisorBeacon', libBeaconService);

		// Instantiate the beacon service
		this._BeaconService = this.fable.instantiateServiceProviderWithoutRegistration('UltravisorBeacon',
			{
				ServerURL: pBeaconConfig.ServerURL,
				Name: pBeaconConfig.Name || this.capabilityName,
				Password: pBeaconConfig.Password || '',
				MaxConcurrent: pBeaconConfig.MaxConcurrent || 1,
				StagingPath: pBeaconConfig.StagingPath || process.cwd(),
				Tags: pBeaconConfig.Tags || {},
				BindAddresses: pBeaconConfig.BindAddresses || []
			});

		// Register the capability
		this._BeaconService.registerCapability(tmpDescriptor);

		// Enable the beacon (connects to server)
		this._BeaconService.enable(
			(pEnableError, pBeaconInfo) =>
			{
				if (pEnableError)
				{
					this._BeaconService = null;
					return fCallback(pEnableError);
				}
				return fCallback(null, pBeaconInfo);
			});
	}

	/**
	 * Disconnect from the Ultravisor server.
	 *
	 * @param {function} fCallback - function(pError)
	 */
	disconnect(fCallback)
	{
		if (typeof fCallback !== 'function')
		{
			fCallback = () => {};
		}

		if (!this._BeaconService)
		{
			return fCallback(null);
		}

		this._BeaconService.disable(
			(pDisableError) =>
			{
				this._BeaconService = null;
				return fCallback(pDisableError || null);
			});
	}

	/**
	 * Check whether the beacon is currently connected.
	 *
	 * @returns {boolean}
	 */
	isConnected()
	{
		return (this._BeaconService !== null && this._BeaconService._Enabled === true);
	}

	// ================================================================
	// Internal
	// ================================================================

	/**
	 * Build the merged action map from convention-discovered actions
	 * and explicitly registered actions.
	 *
	 * Explicit registrations take precedence on name collision.
	 *
	 * @returns {object} Action map for the capability descriptor
	 */
	_buildActions()
	{
		// Discover actions from prototype chain
		let tmpDiscoveredActions = libActionMap.buildActionMap(this);

		// Merge explicit actions (explicit wins on collision)
		let tmpExplicitNames = Object.keys(this._ExplicitActions);
		for (let i = 0; i < tmpExplicitNames.length; i++)
		{
			let tmpName = tmpExplicitNames[i];
			tmpDiscoveredActions[tmpName] = this._ExplicitActions[tmpName];
		}

		return tmpDiscoveredActions;
	}
}

module.exports = UltravisorBeaconCapability;
