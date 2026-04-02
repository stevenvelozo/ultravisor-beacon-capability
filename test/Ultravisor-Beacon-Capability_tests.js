/**
 * Unit tests for ultravisor-beacon-capability
 *
 * @license MIT
 */

const libAssert = require('assert');
const libFable = require('fable');

const libActionMap = require('../source/Ultravisor-Beacon-Capability-ActionMap.cjs');
const libBeaconCapability = require('../source/Ultravisor-Beacon-Capability.cjs');

suite
(
	'Ultravisor Beacon Capability',
	() =>
	{
		// ============================================================
		// ActionMap Discovery
		// ============================================================
		suite
		(
			'ActionMap Discovery',
			() =>
			{
				test
				(
					'Should discover action methods on a class prototype',
					(fDone) =>
					{
						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Test';
							}

							actionDoWork(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, { Outputs: { Done: true } });
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');
						let tmpMap = libActionMap.buildActionMap(tmpCap);

						libAssert.strictEqual(Object.keys(tmpMap).length, 1, 'Should discover one action');
						libAssert.ok(tmpMap.DoWork, 'Action name should be "DoWork"');
						libAssert.strictEqual(typeof tmpMap.DoWork.Handler, 'function', 'Handler should be a function');
						libAssert.strictEqual(tmpMap.DoWork.Description, '', 'Missing description should default to empty string');
						libAssert.deepStrictEqual(tmpMap.DoWork.Schema || tmpMap.DoWork.SettingsSchema, [], 'Missing schema should default to empty array');

						return fDone();
					}
				);

				test
				(
					'Should resolve _Schema and _Description companions (getters)',
					(fDone) =>
					{
						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Test';
							}

							get actionTransform_Description()
							{
								return 'Transform some data';
							}

							get actionTransform_Schema()
							{
								return [
									{ Name: 'InputData', DataType: 'Object', Required: true },
									{ Name: 'Format', DataType: 'String', Required: false }
								];
							}

							actionTransform(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, { Outputs: { Transformed: true } });
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');
						let tmpMap = libActionMap.buildActionMap(tmpCap);

						libAssert.strictEqual(tmpMap.Transform.Description, 'Transform some data');
						libAssert.strictEqual(tmpMap.Transform.SettingsSchema.length, 2);
						libAssert.strictEqual(tmpMap.Transform.SettingsSchema[0].Name, 'InputData');
						libAssert.strictEqual(tmpMap.Transform.SettingsSchema[1].Name, 'Format');

						return fDone();
					}
				);

				test
				(
					'Should discover multiple actions',
					(fDone) =>
					{
						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Multi';
							}

							actionAlpha(pSettings, pWorkItem, fCallback) { return fCallback(null, {}); }
							actionBeta(pSettings, pWorkItem, fCallback) { return fCallback(null, {}); }
							actionGamma(pSettings, pWorkItem, fCallback) { return fCallback(null, {}); }
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');
						let tmpMap = libActionMap.buildActionMap(tmpCap);

						libAssert.strictEqual(Object.keys(tmpMap).length, 3);
						libAssert.ok(tmpMap.Alpha);
						libAssert.ok(tmpMap.Beta);
						libAssert.ok(tmpMap.Gamma);

						return fDone();
					}
				);

				test
				(
					'Should walk prototype chain (multi-level inheritance)',
					(fDone) =>
					{
						class BaseCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Chain';
							}

							actionBaseAction(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, { Outputs: { Source: 'base' } });
							}
						}

						class DerivedCapability extends BaseCapability
						{
							actionDerivedAction(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, { Outputs: { Source: 'derived' } });
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new DerivedCapability(tmpFable, {}, 'TestCap');
						let tmpMap = libActionMap.buildActionMap(tmpCap);

						libAssert.strictEqual(Object.keys(tmpMap).length, 2);
						libAssert.ok(tmpMap.BaseAction, 'Should discover base class action');
						libAssert.ok(tmpMap.DerivedAction, 'Should discover derived class action');

						return fDone();
					}
				);

				test
				(
					'Subclass overrides should win over base class',
					(fDone) =>
					{
						class BaseCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Override';
							}

							get actionDoWork_Description() { return 'base description'; }
							actionDoWork(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, { Outputs: { Source: 'base' } });
							}
						}

						class DerivedCapability extends BaseCapability
						{
							get actionDoWork_Description() { return 'derived description'; }
							actionDoWork(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, { Outputs: { Source: 'derived' } });
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new DerivedCapability(tmpFable, {}, 'TestCap');
						let tmpMap = libActionMap.buildActionMap(tmpCap);

						libAssert.strictEqual(Object.keys(tmpMap).length, 1);
						libAssert.strictEqual(tmpMap.DoWork.Description, 'derived description');

						// Verify handler calls the derived version
						let tmpWorkItem = { Settings: {} };
						tmpMap.DoWork.Handler(tmpWorkItem, {}, (pError, pResult) =>
						{
							libAssert.strictEqual(pResult.Outputs.Source, 'derived');
							return fDone();
						});
					}
				);

				test
				(
					'Should not discover non-action methods or companion properties',
					(fDone) =>
					{
						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Filter';
							}

							// This IS an action
							actionValidAction(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, {});
							}

							// These are NOT actions
							get actionValidAction_Schema() { return []; }
							get actionValidAction_Description() { return 'valid'; }
							helperMethod() { return 'not an action'; }
							someOtherFunction() { return 'also not'; }
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');
						let tmpMap = libActionMap.buildActionMap(tmpCap);

						libAssert.strictEqual(Object.keys(tmpMap).length, 1, 'Should only discover actionValidAction');
						libAssert.ok(tmpMap.ValidAction);

						return fDone();
					}
				);
			}
		);

		// ============================================================
		// Handler Delegation
		// ============================================================
		suite
		(
			'Handler Delegation',
			() =>
			{
				test
				(
					'Handler should pre-extract pSettings from pWorkItem.Settings',
					(fDone) =>
					{
						let tmpReceivedSettings = null;

						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Extract';
							}

							actionProcess(pSettings, pWorkItem, fCallback)
							{
								tmpReceivedSettings = pSettings;
								return fCallback(null, { Outputs: {} });
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');
						let tmpMap = libActionMap.buildActionMap(tmpCap);

						let tmpWorkItem = { Settings: { Name: 'test', Value: 42 } };
						tmpMap.Process.Handler(tmpWorkItem, {}, (pError) =>
						{
							libAssert.strictEqual(tmpReceivedSettings.Name, 'test');
							libAssert.strictEqual(tmpReceivedSettings.Value, 42);
							return fDone();
						});
					}
				);

				test
				(
					'Handler should default to empty object when Settings is missing',
					(fDone) =>
					{
						let tmpReceivedSettings = null;

						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Empty';
							}

							actionProcess(pSettings, pWorkItem, fCallback)
							{
								tmpReceivedSettings = pSettings;
								return fCallback(null, { Outputs: {} });
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');
						let tmpMap = libActionMap.buildActionMap(tmpCap);

						tmpMap.Process.Handler({}, {}, (pError) =>
						{
							libAssert.deepStrictEqual(tmpReceivedSettings, {});
							return fDone();
						});
					}
				);

				test
				(
					'Handler should preserve this context (access to instance members)',
					(fDone) =>
					{
						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Context';
								this._ConnectionString = 'mysql://localhost/test';
							}

							actionQuery(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, { Outputs: { ConnectionUsed: this._ConnectionString } });
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');
						let tmpMap = libActionMap.buildActionMap(tmpCap);

						tmpMap.Query.Handler({ Settings: {} }, {}, (pError, pResult) =>
						{
							libAssert.strictEqual(pResult.Outputs.ConnectionUsed, 'mysql://localhost/test');
							return fDone();
						});
					}
				);

				test
				(
					'Handler should pass fReportProgress to action method',
					(fDone) =>
					{
						let tmpProgressReceived = false;

						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Progress';
							}

							actionLongTask(pSettings, pWorkItem, fCallback, fReportProgress)
							{
								fReportProgress({ Percent: 50, Message: 'halfway' });
								return fCallback(null, { Outputs: {} });
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');
						let tmpMap = libActionMap.buildActionMap(tmpCap);

						let tmpProgressFn = (pData) =>
						{
							tmpProgressReceived = true;
							libAssert.strictEqual(pData.Percent, 50);
							libAssert.strictEqual(pData.Message, 'halfway');
						};

						tmpMap.LongTask.Handler({ Settings: {} }, {}, (pError) =>
						{
							libAssert.ok(tmpProgressReceived, 'Progress function should have been called');
							return fDone();
						}, tmpProgressFn);
					}
				);
			}
		);

		// ============================================================
		// Explicit Action Registration
		// ============================================================
		suite
		(
			'Explicit Action Registration',
			() =>
			{
				test
				(
					'addAction should register an action',
					(fDone) =>
					{
						let tmpFable = new libFable({});
						let tmpCap = new libBeaconCapability(tmpFable, {}, 'TestCap');
						tmpCap.capabilityName = 'Explicit';

						tmpCap.addAction('ManualAction',
							{
								Description: 'A manually registered action',
								SettingsSchema: [{ Name: 'Input', DataType: 'String', Required: true }],
								Handler: function (pWorkItem, pContext, fCallback)
								{
									return fCallback(null, { Outputs: { Manual: true } });
								}
							});

						let tmpActions = tmpCap._buildActions();

						libAssert.ok(tmpActions.ManualAction, 'Should have ManualAction');
						libAssert.strictEqual(tmpActions.ManualAction.Description, 'A manually registered action');
						libAssert.strictEqual(tmpActions.ManualAction.SettingsSchema.length, 1);
						libAssert.strictEqual(typeof tmpActions.ManualAction.Handler, 'function');

						return fDone();
					}
				);

				test
				(
					'Explicit action should override discovered action on name collision',
					(fDone) =>
					{
						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Collision';
							}

							get actionDoWork_Description() { return 'discovered'; }
							actionDoWork(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, { Outputs: { Source: 'discovered' } });
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');

						tmpCap.addAction('DoWork',
							{
								Description: 'explicit override',
								Handler: function (pWorkItem, pContext, fCallback)
								{
									return fCallback(null, { Outputs: { Source: 'explicit' } });
								}
							});

						let tmpActions = tmpCap._buildActions();

						libAssert.strictEqual(tmpActions.DoWork.Description, 'explicit override');

						return fDone();
					}
				);

				test
				(
					'addAction should reject missing name or handler',
					(fDone) =>
					{
						let tmpFable = new libFable({});
						let tmpCap = new libBeaconCapability(tmpFable, {}, 'TestCap');

						// Missing name
						tmpCap.addAction('', { Handler: () => {} });
						libAssert.strictEqual(Object.keys(tmpCap._ExplicitActions).length, 0);

						// Missing handler
						tmpCap.addAction('NoHandler', { Description: 'oops' });
						libAssert.strictEqual(Object.keys(tmpCap._ExplicitActions).length, 0);

						return fDone();
					}
				);
			}
		);

		// ============================================================
		// Capability Descriptor Shape
		// ============================================================
		suite
		(
			'Descriptor Building',
			() =>
			{
				test
				(
					'connect should fail without ServerURL',
					(fDone) =>
					{
						let tmpFable = new libFable({});
						let tmpCap = new libBeaconCapability(tmpFable, {}, 'TestCap');
						tmpCap.capabilityName = 'Test';

						tmpCap.connect({}, (pError) =>
						{
							libAssert.ok(pError, 'Should return an error');
							libAssert.ok(pError.message.includes('ServerURL'));
							return fDone();
						});
					}
				);

				test
				(
					'connect should fail without capabilityName',
					(fDone) =>
					{
						let tmpFable = new libFable({});
						let tmpCap = new libBeaconCapability(tmpFable, {}, 'TestCap');

						tmpCap.connect({ ServerURL: 'http://localhost:54321' }, (pError) =>
						{
							libAssert.ok(pError, 'Should return an error');
							libAssert.ok(pError.message.includes('capabilityName'));
							return fDone();
						});
					}
				);

				test
				(
					'_buildActions should produce correct descriptor shape',
					(fDone) =>
					{
						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'ShapeTest';
							}

							get actionCreate_Description() { return 'Create a record'; }
							get actionCreate_Schema()
							{
								return [
									{ Name: 'Name', DataType: 'String', Required: true }
								];
							}
							actionCreate(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, { Outputs: {} });
							}

							actionDelete(pSettings, pWorkItem, fCallback)
							{
								return fCallback(null, { Outputs: {} });
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');
						let tmpActions = tmpCap._buildActions();

						// Verify shape matches what CapabilityManager.registerCapability expects
						libAssert.ok(tmpActions.Create, 'Should have Create action');
						libAssert.ok(tmpActions.Delete, 'Should have Delete action');

						// Create action should have full metadata
						libAssert.strictEqual(tmpActions.Create.Description, 'Create a record');
						libAssert.ok(Array.isArray(tmpActions.Create.SettingsSchema));
						libAssert.strictEqual(tmpActions.Create.SettingsSchema[0].Name, 'Name');
						libAssert.strictEqual(typeof tmpActions.Create.Handler, 'function');

						// Delete action should have defaults
						libAssert.strictEqual(tmpActions.Delete.Description, '');
						libAssert.deepStrictEqual(tmpActions.Delete.SettingsSchema, []);
						libAssert.strictEqual(typeof tmpActions.Delete.Handler, 'function');

						return fDone();
					}
				);
			}
		);

		// ============================================================
		// Lifecycle
		// ============================================================
		suite
		(
			'Lifecycle',
			() =>
			{
				test
				(
					'Default onInitialize and onShutdown should be no-ops',
					(fDone) =>
					{
						let tmpFable = new libFable({});
						let tmpCap = new libBeaconCapability(tmpFable, {}, 'TestCap');

						tmpCap.onInitialize((pInitError) =>
						{
							libAssert.ifError(pInitError);
							tmpCap.onShutdown((pShutdownError) =>
							{
								libAssert.ifError(pShutdownError);
								return fDone();
							});
						});
					}
				);

				test
				(
					'Custom onInitialize and onShutdown should be called',
					(fDone) =>
					{
						let tmpInitCalled = false;
						let tmpShutdownCalled = false;

						class TestCapability extends libBeaconCapability
						{
							constructor(pFable, pOptions, pServiceHash)
							{
								super(pFable, pOptions, pServiceHash);
								this.capabilityName = 'Lifecycle';
							}

							onInitialize(fCallback)
							{
								tmpInitCalled = true;
								return fCallback(null);
							}

							onShutdown(fCallback)
							{
								tmpShutdownCalled = true;
								return fCallback(null);
							}
						}

						let tmpFable = new libFable({});
						let tmpCap = new TestCapability(tmpFable, {}, 'TestCap');

						tmpCap.onInitialize((pInitError) =>
						{
							libAssert.ok(tmpInitCalled, 'onInitialize should have been called');
							tmpCap.onShutdown((pShutdownError) =>
							{
								libAssert.ok(tmpShutdownCalled, 'onShutdown should have been called');
								return fDone();
							});
						});
					}
				);

				test
				(
					'isConnected should return false when not connected',
					(fDone) =>
					{
						let tmpFable = new libFable({});
						let tmpCap = new libBeaconCapability(tmpFable, {}, 'TestCap');

						libAssert.strictEqual(tmpCap.isConnected(), false);

						return fDone();
					}
				);

				test
				(
					'disconnect should be safe to call when not connected',
					(fDone) =>
					{
						let tmpFable = new libFable({});
						let tmpCap = new libBeaconCapability(tmpFable, {}, 'TestCap');

						tmpCap.disconnect((pError) =>
						{
							libAssert.ifError(pError);
							return fDone();
						});
					}
				);
			}
		);

		// ============================================================
		// Module Export
		// ============================================================
		suite
		(
			'Module Export',
			() =>
			{
				test
				(
					'Module should export the base class',
					(fDone) =>
					{
						libAssert.ok(libBeaconCapability, 'Module should export');
						libAssert.strictEqual(typeof libBeaconCapability, 'function', 'Export should be a constructor');

						let tmpFable = new libFable({});
						let tmpCap = new libBeaconCapability(tmpFable, {}, 'TestCap');

						libAssert.strictEqual(tmpCap.serviceType, 'UltravisorBeaconCapability');
						libAssert.strictEqual(tmpCap.capabilityName, '');
						libAssert.strictEqual(tmpCap.providerName, '');

						return fDone();
					}
				);
			}
		);
	}
);
