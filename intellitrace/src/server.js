const app = require('./app');
const env = require('./config/env');
const connectDB = require('./config/db');
const startMetricsCollector = require('./services/metricsCollector');

connectDB().then(() => {
    app.listen(env.PORT, () => {
        console.log(`IntelliTrace backend running on http://localhost:${env.PORT}`);
        startMetricsCollector();
    });
});
