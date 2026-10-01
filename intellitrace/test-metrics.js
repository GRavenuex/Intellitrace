const mongoose = require('mongoose'); 
mongoose.connect('mongodb+srv://root:root@cluster1.mwwv0wt.mongodb.net/intellitrace?appName=Cluster1').then(async () => { 
    const MetricSnapshot = mongoose.model('MetricSnapshot', new mongoose.Schema({}, { strict: false })); 
    const past = await MetricSnapshot.findOne({ application: 'intellishop', timestamp: { $lt: new Date(Date.now() - 15*60*1000) } }).sort('-timestamp'); 
    const latest = await MetricSnapshot.findOne({ application: 'intellishop' }).sort('-timestamp'); 
    console.log('Latest Req:', latest.requestsTotal, 'Past Req:', past?.requestsTotal); 
    const reqs = latest.requestsTotal >= (past?.requestsTotal || 0) ? latest.requestsTotal - (past?.requestsTotal || 0) : latest.requestsTotal;
    const errs = latest.errorsTotal >= (past?.errorsTotal || 0) ? latest.errorsTotal - (past?.errorsTotal || 0) : latest.errorsTotal; 
    const countDelta = latest.durationCount >= (past?.durationCount || 0) ? latest.durationCount - (past?.durationCount || 0) : latest.durationCount; 
    const durDelta = latest.durationSum >= (past?.durationSum || 0) ? latest.durationSum - (past?.durationSum || 0) : latest.durationSum; 
    const lat = countDelta > 0 ? (durDelta / countDelta)*1000 : 0; 
    console.log(`Requests: ${reqs}\nErrors: ${errs}\nError Rate: ${(reqs>0 ? errs/reqs*100 : 0).toFixed(2)}%\nAvg Latency: ${lat.toFixed(0)}ms`); 
    process.exit(0); 
});
