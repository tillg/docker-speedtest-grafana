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

const stringify = (json_thingy) => JSON.stringify(json_thingy, null, 2);

const getSpeedMetrics = async () => {
	log('getSpeedMetrics: Starting speedtest...');
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
		log(
			`getSpeedMetrics: Results - Download: ${result.download.bandwidth}, Upload: ${result.download.bandwidth}, Ping: ${result.ping.latency}`
		);
		return {
			upload: bitToMbps(result.upload.bandwidth),
			download: bitToMbps(result.download.bandwidth),
			ping: result.ping.latency,
		};
	} catch (err) {
		log(`getSpeedMetrics: Error: ${stringify(err)}`, 'ERROR');
		return {
			upload: 0,
			download: 0,
			ping: 0,
		};
	}
};

const getGooglePingMetrics = async () => {
	const host = 'google.com';
	try {
		const pingResult = await ping.promise.probe(host);
		let pingTime = pingResult.time;
		if (isNaN(pingTime)) pingTime = 0 ;
		log (`getGooglePingMetrics: Result: ${pingTime}`)
		return { googlePing: pingTime };
	} catch (err) {
		log(`getGooglePingMetrics: Error: ${stringify(err)}`);
		return { googlePing: 0 }; // If we can't get a google ping we return 0 for proper display
	}
};

const pushToInflux = async (influxDB, metrics) => {
	const points = Object.entries(metrics).map(([measurement, value]) => ({
		measurement,
		tags: { host: process.env.SPEEDTEST_HOST },
		fields: { value },
	}));
	try {
		await influxDB.writePoints(points);
	} catch (err) {
		log(`pushToInflux: Error: ${stringify(err)}`, 'ERROR');
	}
};

const cycleSpeedtests = async (influx) => {
	try {
		while (true) {
			const speedMetrics = await getSpeedMetrics();
			await pushToInflux(influx, speedMetrics);
			log(
				`cycleSpeedtests: Sleeping for ${process.env.SPEEDTEST_INTERVAL} seconds...`
			);
			await delay(process.env.SPEEDTEST_INTERVAL * 1000);
		}
	} catch (err) {
		log(`cycleSpeedtests: Error: ${stringify(err)}`, 'ERROR');
		log('cycleSpeedtests: Aborting cycle.', 'ERROR');
		process.exit(1);
	}
};

const cycleGooglePing = async (influx) => {
	try {
		while (true) {
			const googlePingResult = await getGooglePingMetrics();
			await pushToInflux(influx, googlePingResult);
			log(
				`cycleGooglePing: Sleeping for ${process.env.GOOGLE_PING_INTERVAL} seconds...`
			);
			await delay(process.env.GOOGLE_PING_INTERVAL * 1000);
		}
	} catch (err) {
		log(`cycleGooglePing: Error: ${stringify(err)}`, 'ERROR');
		log('cycleGooglePing: Aborting cycle.', 'ERROR');
		process.exit(1);
	}
};

const influxDB = new Influx.InfluxDB({
	host: process.env.INFLUXDB_HOST,
	database: process.env.INFLUXDB_DB,
	username: process.env.INFLUXDB_USERNAME,
	password: process.env.INFLUXDB_PASSWORD,
});

(async () => {
	cycleSpeedtests(influxDB);
	cycleGooglePing(influxDB);
})();
