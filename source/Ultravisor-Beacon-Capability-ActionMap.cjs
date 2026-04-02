/**
 * Ultravisor Beacon Capability Action Map
 *
 * Discovers action methods on a UltravisorBeaconCapability instance
 * by walking its prototype chain and matching the `action` prefix
 * convention.
 *
 * An action named "DoSomething" is defined by:
 *   - actionDoSomething(pSettings, pWorkItem, fCallback, fReportProgress)
 *   - actionDoSomething_Schema  (getter/property: SettingsSchema array)
 *   - actionDoSomething_Description  (getter/property: description string)
 *
 * Returns a map of ActionName -> { Description, SettingsSchema, Handler }
 * where Handler matches the ultravisor-beacon registerCapability() shape:
 *   Handler(pWorkItem, pContext, fCallback, fReportProgress)
 */

const ACTION_PREFIX = 'action';
const ACTION_PREFIX_LENGTH = ACTION_PREFIX.length;

/**
 * Build an action map from an instance's prototype chain.
 *
 * @param {object} pInstance - The capability instance to inspect
 * @returns {object} Map of ActionName -> { Description, SettingsSchema, Handler }
 */
function buildActionMap(pInstance)
{
	let tmpActionMap = {};
	let tmpVisited = new Set();

	// Walk the prototype chain, stopping before Object.prototype
	let tmpProto = Object.getPrototypeOf(pInstance);
	while (tmpProto && tmpProto !== Object.prototype)
	{
		let tmpPropertyNames = Object.getOwnPropertyNames(tmpProto);

		for (let i = 0; i < tmpPropertyNames.length; i++)
		{
			let tmpName = tmpPropertyNames[i];

			// Skip already visited (subclass overrides win)
			if (tmpVisited.has(tmpName))
			{
				continue;
			}
			tmpVisited.add(tmpName);

			// Must start with 'action' and be longer than just the prefix
			if (tmpName.length <= ACTION_PREFIX_LENGTH)
			{
				continue;
			}
			if (tmpName.substring(0, ACTION_PREFIX_LENGTH) !== ACTION_PREFIX)
			{
				continue;
			}

			// Skip companion suffixes
			if (tmpName.endsWith('_Schema') || tmpName.endsWith('_Description'))
			{
				continue;
			}

			// Must be a function (not a getter or plain property)
			let tmpDescriptor = Object.getOwnPropertyDescriptor(tmpProto, tmpName);
			if (!tmpDescriptor || typeof tmpDescriptor.value !== 'function')
			{
				continue;
			}

			// Extract the action name by stripping the prefix
			let tmpActionName = tmpName.substring(ACTION_PREFIX_LENGTH);

			// Look up companion schema
			let tmpSchema = resolveCompanion(pInstance, `${tmpName}_Schema`, []);

			// Look up companion description
			let tmpDescription = resolveCompanion(pInstance, `${tmpName}_Description`, '');

			// Create bound handler that wraps the call with pre-extracted Settings
			let tmpBoundMethod = pInstance[tmpName].bind(pInstance);
			let tmpHandler = function (pWorkItem, pContext, fCallback, fReportProgress)
			{
				let tmpSettings = (pWorkItem && pWorkItem.Settings) ? pWorkItem.Settings : {};
				return tmpBoundMethod(tmpSettings, pWorkItem, fCallback, fReportProgress);
			};

			tmpActionMap[tmpActionName] = {
				Description: tmpDescription,
				SettingsSchema: tmpSchema,
				Handler: tmpHandler
			};
		}

		tmpProto = Object.getPrototypeOf(tmpProto);
	}

	return tmpActionMap;
}

/**
 * Resolve a companion property (schema or description) from an instance.
 * Supports getters, plain values, and methods.
 *
 * @param {object} pInstance - The instance to read from
 * @param {string} pKey - The property name to look up
 * @param {*} pDefault - Default value if not found
 * @returns {*} The resolved value
 */
function resolveCompanion(pInstance, pKey, pDefault)
{
	try
	{
		let tmpValue = pInstance[pKey];
		if (typeof tmpValue === 'undefined')
		{
			return pDefault;
		}
		if (typeof tmpValue === 'function')
		{
			return tmpValue.call(pInstance);
		}
		return tmpValue;
	}
	catch (pError)
	{
		return pDefault;
	}
}

module.exports = { buildActionMap };
