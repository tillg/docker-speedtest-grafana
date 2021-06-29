const execa = require("execa");
const Influx = require("influx");
const delay = require("delay");

process.env.INFLUXDB_HOST = (process.env.INFLUXDB_HOST) ? process.env.INFLUXDB_HOST : 'influxdb';
process.env.INFLUXDB_DB = (process.env.INFLUXDB_DB) ? process.env.INFLUXDB_DB : 'speedtest';
process.env.INFLUXDB_USERNAME = (process.env.INFLUXDB_USERNAME) ? process.env.INFLUXDB_USERNAME : 'root';
process.env.INFLUXDB_PASSWORD = (process.env.INFLUXDB_PASSWORD) ? process.env.INFLUXDB_PASSWORD : 'root';
process.env.SPEEDTEST_HOST = (process.env.SPEEDTEST_HOST) ? process.env.SPEEDTEST_HOST : 'local';
process.env.SPEEDTEST_INTERVAL = (process.env.SPEEDTEST_INTERVAL) ? process.env.SPEEDTEST_INTERVAL : 3600;

const bitToMbps = bit => (bit / 1000 / 1000) * 8;

const log = (message, severity = "Info") =>
  console.log(`[${severity.toUpperCase()}][${new Date()}] ${message}`);

const getSpeedMetrics = async () => {
  const args = (process.env.SPEEDTEST_SERVER) ?
    [ "--accept-license", "--accept-gdpr", "-f", "json", "--server-id=" + process.env.SPEEDTEST_SERVER] :
    [ "--accept-license", "--accept-gdpr", "-f", "json" ];

  try {
    const { stdout } = await execa("speedtest", args);
    const result = JSON.parse(stdout);
    return {
      upload: bitToMbps(result.upload.bandwidth),
      download: bitToMbps(result.download.bandwidth),
      ping: result.ping.latency
    };
  } catch (err) {
    log("getSpeedMetrics: Error when trying to execute speedtest.")
    throw err;
  }
};

const pushToInflux = async (influx, metrics) => {
  const points = Object.entries(metrics).map(([measurement, value]) => ({
    measurement,
    tags: { host: process.env.SPEEDTEST_HOST },
    fields: { value }
  }));

  await influx.writePoints(points);
};

(async () => {
  try {
    const influx = new Influx.InfluxDB({
      host: process.env.INFLUXDB_HOST,
      database: process.env.INFLUXDB_DB,
      username: process.env.INFLUXDB_USERNAME,
      password: process.env.INFLUXDB_PASSWORD,
    });

    while (true) {
      log("Starting speedtest...");
      // If the speedtest fails, we write 0 in the influxdb so the graph shows it didn't work
      let speedMetrics = {
        download: 0,
        upload: 0,
        ping: 0
      };
      try {
        speedMetrics = await getSpeedMetrics();
      } catch (err) {
        log ("Main loop: Error when executing speedtest. Setting return vars to 0.")
      }
      log(
        `Speedtest results - Download: ${speedMetrics.download}, Upload: ${speedMetrics.upload}, Ping: ${speedMetrics.ping}`
      );
      await pushToInflux(influx, speedMetrics);

      log(`Sleeping for ${process.env.SPEEDTEST_INTERVAL} seconds...`);
      await delay(process.env.SPEEDTEST_INTERVAL * 1000);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
