const mongoose = require('mongoose');
const env = require('../src/config/env');
const Developer = require('../src/models/Developer');

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    console.error("Usage: node manageDeveloper.js <email> <password>");
    process.exit(1);
}

mongoose.connect(env.MONGO_URI).then(async () => {
    try {
        let dev = await Developer.findOne({ email });
        if (!dev) {
            dev = new Developer({ email, password });
            await dev.save();
            console.log(`Successfully CREATED new developer account: ${email}`);
        } else {
            dev.password = password;
            await dev.save();
            console.log(`Successfully UPDATED password for existing account: ${email}`);
        }
    } catch (err) {
        console.error("Error managing developer:", err);
    } finally {
        process.exit(0);
    }
}).catch(err => {
    console.error("Database connection failed:", err);
    process.exit(1);
});
