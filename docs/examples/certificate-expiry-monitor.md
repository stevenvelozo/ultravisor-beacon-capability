# Example: Certificate Expiry Monitor

A capability that checks TLS certificate expiry dates for a list of domains. Schedule it weekly in Ultravisor to get early warning before certificates expire.

## Full Source

```javascript
const libFable = require('fable');
const libBeaconCapability = require('ultravisor-beacon-capability');
const libTLS = require('tls');
const libNet = require('net');

class CertificateMonitor extends libBeaconCapability
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);
		this.serviceType = 'CertificateMonitor';
		this.capabilityName = 'CertificateMonitor';
	}

	/**
	 * Internal: connect to a host and return certificate details.
	 */
	_checkCert(pHost, pPort, fCallback)
	{
		let tmpSocket = libTLS.connect(
			{
				host: pHost,
				port: pPort || 443,
				servername: pHost,
				timeout: 10000,
				rejectUnauthorized: false
			},
			() =>
			{
				let tmpCert = tmpSocket.getPeerCertificate();
				tmpSocket.end();

				if (!tmpCert || !tmpCert.valid_to)
				{
					return fCallback(null, { Host: pHost, Error: 'No certificate returned' });
				}

				let tmpExpiry = new Date(tmpCert.valid_to);
				let tmpNow = new Date();
				let tmpDaysLeft = Math.floor((tmpExpiry - tmpNow) / (1000 * 60 * 60 * 24));

				return fCallback(null, {
					Host: pHost,
					Subject: tmpCert.subject ? tmpCert.subject.CN : 'unknown',
					Issuer: tmpCert.issuer ? tmpCert.issuer.O : 'unknown',
					ValidFrom: tmpCert.valid_from,
					ValidTo: tmpCert.valid_to,
					DaysUntilExpiry: tmpDaysLeft,
					Expired: tmpDaysLeft < 0,
					Warning: tmpDaysLeft >= 0 && tmpDaysLeft <= 30,
					SerialNumber: tmpCert.serialNumber
				});
			});

		tmpSocket.on('error', (pError) =>
		{
			return fCallback(null, { Host: pHost, Error: pError.message, DaysUntilExpiry: -1, Expired: true });
		});

		tmpSocket.on('timeout', () =>
		{
			tmpSocket.destroy();
			return fCallback(null, { Host: pHost, Error: 'Connection timed out', DaysUntilExpiry: -1, Expired: true });
		});
	}

	// --- Action: CheckDomain ---

	get actionCheckDomain_Description()
	{
		return 'Check the TLS certificate expiry for a single domain';
	}

	get actionCheckDomain_Schema()
	{
		return [
			{ Name: 'Host', DataType: 'String', Required: true },
			{ Name: 'Port', DataType: 'Integer', Required: false, Default: 443 }
		];
	}

	actionCheckDomain(pSettings, pWorkItem, fCallback)
	{
		this._checkCert(pSettings.Host, pSettings.Port, (pError, pResult) =>
		{
			if (pError) return fCallback(pError);

			let tmpStatus = pResult.Expired ? 'EXPIRED' : (pResult.Warning ? 'WARNING' : 'OK');

			return fCallback(null, {
				Outputs: pResult,
				Log: [`${pSettings.Host}: ${tmpStatus} (${pResult.DaysUntilExpiry} days remaining)`]
			});
		});
	}

	// --- Action: CheckMultipleDomains ---

	get actionCheckMultipleDomains_Description()
	{
		return 'Check TLS certificate expiry for multiple domains and produce a report';
	}

	get actionCheckMultipleDomains_Schema()
	{
		return [
			{ Name: 'Domains', DataType: 'Array', Required: true, Description: 'Array of domain strings or { Host, Port } objects' },
			{ Name: 'WarningThresholdDays', DataType: 'Integer', Required: false, Default: 30 }
		];
	}

	actionCheckMultipleDomains(pSettings, pWorkItem, fCallback, fReportProgress)
	{
		let tmpDomains = pSettings.Domains || [];
		let tmpThreshold = pSettings.WarningThresholdDays || 30;
		let tmpResults = [];
		let tmpCompleted = 0;

		if (tmpDomains.length === 0)
		{
			return fCallback(null, {
				Outputs: { Results: [], Summary: 'No domains provided' },
				Log: ['No domains to check']
			});
		}

		tmpDomains.forEach((pDomain) =>
		{
			let tmpHost = (typeof pDomain === 'string') ? pDomain : pDomain.Host;
			let tmpPort = (typeof pDomain === 'object') ? pDomain.Port : 443;

			this._checkCert(tmpHost, tmpPort, (pError, pResult) =>
			{
				if (pResult)
				{
					pResult.Warning = pResult.DaysUntilExpiry >= 0 && pResult.DaysUntilExpiry <= tmpThreshold;
				}
				tmpResults.push(pResult || { Host: tmpHost, Error: 'Check failed' });
				tmpCompleted++;

				fReportProgress({
					Percent: Math.round((tmpCompleted / tmpDomains.length) * 100),
					Message: `Checked ${tmpCompleted} / ${tmpDomains.length} domains`
				});

				if (tmpCompleted === tmpDomains.length)
				{
					// Sort by days until expiry (soonest first)
					tmpResults.sort((pA, pB) => (pA.DaysUntilExpiry || -999) - (pB.DaysUntilExpiry || -999));

					let tmpExpired = tmpResults.filter((pR) => pR.Expired).length;
					let tmpWarning = tmpResults.filter((pR) => pR.Warning && !pR.Expired).length;
					let tmpOK = tmpResults.filter((pR) => !pR.Expired && !pR.Warning && !pR.Error).length;

					return fCallback(null, {
						Outputs: {
							Results: tmpResults,
							ExpiredCount: tmpExpired,
							WarningCount: tmpWarning,
							OKCount: tmpOK,
							TotalCount: tmpDomains.length,
							AllHealthy: tmpExpired === 0 && tmpWarning === 0
						},
						Log: [
							`Certificate check: ${tmpOK} OK, ${tmpWarning} warning, ${tmpExpired} expired`
						]
					});
				}
			});
		});
	}
}

// --- Startup ---

let tmpFable = new libFable({ Product: 'CertificateMonitor', ProductVersion: '1.0.0' });
tmpFable.addServiceType('CertificateMonitor', CertificateMonitor);
let tmpCap = tmpFable.instantiateServiceProvider('CertificateMonitor');

tmpCap.connect(
	{
		ServerURL: process.env.ULTRAVISOR_URL || 'http://localhost:54321',
		Name: 'certificate-monitor'
	},
	(pError) =>
	{
		if (pError) throw pError;
		console.log('Certificate monitor beacon online');
	});

process.on('SIGTERM', () => { tmpCap.disconnect(() => process.exit(0)); });
```

## Registered Task Types

- `beacon-certificatemonitor-checkdomain`
- `beacon-certificatemonitor-checkmultipledomains`

## Key Points

- **No external dependencies** — uses Node.js built-in `tls` module
- **Warning threshold** is configurable (default 30 days)
- **Results sorted** by soonest expiry for quick scanning
- **rejectUnauthorized: false** ensures expired or self-signed certs are still inspected (not rejected)
- Schedule `CheckMultipleDomains` weekly to catch renewals before they expire
