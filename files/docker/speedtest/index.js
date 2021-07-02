const execa = require('execa');
const Influx = require('influx');
const delay = require('delay');
const ping = require('ping');

process.env.INFLUXDB_HOST = process.env.INFLUXDB_HOST
	? process.env.INFLUXDB_HOST
	: 'influxdb';
process.env.INFLUXDB_DB = process.env.INFLUXDB_DB
	? process.env.INFLUXDB_DB
	: 'speedtest';
process.env.INFLUXDB_USERNAME = process.env.INFLUXDB_USERNAME
	? process.env.INFLUXDB_USERNAME
	: 'root';
process.env.INFLUXDB_PASSWORD = process.env.INFLUXDB_PASSWORD
	? process.env.INFLUXDB_PASSWORD
	: 'root';
process.env.SPEEDTEST_HOST = process.env.SPEEDTEST_HOST
	? process.env.SPEEDTEST_HOST
	: 'local';
process.env.SPEEDTEST_INTERVAL = process.env.SPEEDTEST_INTERVAL
	? process.env.SPEEDTEST_INTERVAL
	: 3600;
process.env.GOOGLE_PING_INTERVAL = process.env.GOOGLE_PING_INTERVAL
	? process.env.GOOGLE_PING_INTERVAL
	: 10;

const bitToMbps = (bit) => (bit / 1000 / 1000) * 8;

const log = (message, severity = 'Info') =>
	console.log(`[${severity.toUpperCase()}][${new Date()}] ${message}`);

const getSpeedMetrics = async () => {
	const args = process.env.SPEEDTEST_SERVER
		? [
				'--accept-license',
				'--accept-gdpr',
				'-f',
				'json',
				'--server-id=' + process.env.SPEEDTEST_SERVER,
		  ]
		: ['--accept-license', '--accept-gdpr', '-f', 'json'];

	try {
		const { stdout } = await execa('speedtest', args);
		const result = JSON.parse(stdout);
		return {
			upload: bitToMbps(result.upload.bandwidth),
			download: bitToMbps(result.download.bandwidth),
			ping: result.ping.latency,
		};
	} catch (err) {
		log('getSpeedMetrics: Error when trying to execute speedtest.', 'ERROR');
		throw err;
	}
};

const getGooglePingMetrics = async () => {
	const host = 'google.com';
	const pingResult = await ping.promise.probe(host);
	return { googlePing: pingResult.time };
};

const pushToInflux = async (influx, metrics) => {
	const points = Object.entries(metrics).map(([measurement, value]) => ({
		measurement,
		tags: { host: process.env.SPEEDTEST_HOST },
		fields: { value },
	}));

	await influx.writePoints(points);
};

const cycleSpeedtests = async (influx) => {
	try {
		while (true) {
			log('Starting speedtest...');
			// If the speedtest fails, we write 0 in the influxdb so the graph shows it didn't work
			let speedMetrics = {
				download: 0,
				upload: 0,
				ping: 0,
			};
			try {
				speedMetrics = await getSpeedMetrics();
			} catch (err) {
				log(
					'Main loop: Error when executing speedtest. Setting return vars to 0.',
					'ERROR'
				);
			}
			log(
				`Speedtest results - Download: ${speedMetrics.download}, Upload: ${speedMetrics.upload}, Ping: ${speedMetrics.ping}`
			);
			await pushToInflux(influx, speedMetrics);
			log(
				`cycleSpeedtests: Sleeping for ${process.env.SPEEDTEST_INTERVAL} seconds...`
			);
			await delay(process.env.SPEEDTEST_INTERVAL * 1000);
		}
	} catch (err) {
		console.error(err.message);
		process.exit(1);
	}
};

const cycleGooglePing = async (influx) => {
	while (true) {
		log('Starting GooglePing...');
		let googlePingResult = { googlePing: 0 };
		try {
			googlePingResult = await getGooglePingMetrics();
			if (isNaN(googlePingResult.googlePing)) googlePingResult.googlePing = 0;
		} catch (err) {
			log(
				`cycleGooglePing: Error when pinging Google: ${JSON.stringify(
					err,
					null,
					2
				)}`,
				'ERROR'
			);
		}
		log(`GooglePing results - googlePing: ${googlePingResult.googlePing}`);
		log(`GooglePing results - googlePing: ${JSON.stringify(googlePingResult,null,2)}`);
		await pushToInflux(influx, googlePingResult);
		log(
			`cycleGooglePing: Sleeping for ${process.env.GOOGLE_PING_INTERVAL} seconds...`
		);
		await delay(process.env.GOOGLE_PING_INTERVAL * 1000);
	}
};

const influx = new Influx.InfluxDB({
	host: process.env.INFLUXDB_HOST,
	database: process.env.INFLUXDB_DB,
	username: process.env.INFLUXDB_USERNAME,
	password: process.env.INFLUXDB_PASSWORD,
});

(async () => {
	cycleSpeedtests(influx);
	cycleGooglePing(influx);
})();
