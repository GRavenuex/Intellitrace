const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const atlasEcommerceUri = 'mongodb+srv://root:root@cluster1.mwwv0wt.mongodb.net/ecommerce?appName=Cluster1';
const localEcommerceUri = 'mongodb://127.0.0.1:27017/shop';

const atlasIntelliTraceUri = 'mongodb+srv://root:root@cluster1.mwwv0wt.mongodb.net/intellitrace?appName=Cluster1';
const localIntelliTraceUri = 'mongodb://127.0.0.1:27017/intellitrace';

async function seedEcommerce(uri, label) {
    console.log(`[Ecommerce] Seeding ${label}...`);
    try {
        const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 8000 }).asPromise();
        const hash = await bcrypt.hash('password123', 12);
        
        const testUsers = [
            { firstName: 'Gaurav', lastName: 'Sutar', email: 'gaurav@example.com', password: hash, userType: 'customer' },
            { firstName: 'Admin', lastName: 'User', email: 'admin@intellishop.com', password: hash, userType: 'admin' },
            { firstName: 'Customer', lastName: 'Demo', email: 'customer@intellishop.com', password: hash, userType: 'customer' },
            { firstName: 'Gaurav', lastName: 'Developer', email: 'gravenux@gmail.com', password: hash, userType: 'admin' },
            { firstName: 'Gaurav', lastName: 'Sutar', email: 'gauravsutar369@gmail.com', password: hash, userType: 'customer' }
        ];

        for (const u of testUsers) {
            const existing = await conn.db.collection('users').findOne({ 
                email: { $regex: new RegExp('^' + u.email + '$', 'i') } 
            });
            if (existing) {
                await conn.db.collection('users').updateOne(
                    { _id: existing._id },
                    { $set: { password: hash, userType: u.userType } }
                );
                console.log(`  [Ecommerce - ${label}] Updated password for ${u.email}`);
            } else {
                await conn.db.collection('users').insertOne({
                    ...u,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                console.log(`  [Ecommerce - ${label}] Created user ${u.email}`);
            }
        }
        await conn.close();
    } catch (err) {
        console.error(`  [Ecommerce - ${label}] Failed:`, err.message);
    }
}

async function seedIntelliTrace(uri, label) {
    console.log(`[IntelliTrace] Seeding ${label}...`);
    try {
        const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 8000 }).asPromise();
        const hash = await bcrypt.hash('password123', 10);

        const devs = [
            { email: 'admin@intellitrace.com', password: hash },
            { email: 'admin@intellitrace.dev', password: hash },
            { email: 'gravenux@gmail.com', password: hash },
            { email: 'gaurav@example.com', password: hash }
        ];

        for (const d of devs) {
            const existing = await conn.db.collection('developers').findOne({
                email: { $regex: new RegExp('^' + d.email + '$', 'i') }
            });
            if (existing) {
                await conn.db.collection('developers').updateOne(
                    { _id: existing._id },
                    { $set: { password: hash } }
                );
                console.log(`  [IntelliTrace - ${label}] Updated password for ${d.email}`);
            } else {
                await conn.db.collection('developers').insertOne({
                    ...d,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                console.log(`  [IntelliTrace - ${label}] Created dev ${d.email}`);
            }
        }
        await conn.close();
    } catch (err) {
        console.error(`  [IntelliTrace - ${label}] Failed:`, err.message);
    }
}

async function main() {
    console.log('=== SEEDING USERS ACROSS ALL DATABASES ===');
    await seedEcommerce(atlasEcommerceUri, 'Atlas');
    await seedEcommerce(localEcommerceUri, 'Local');
    await seedIntelliTrace(atlasIntelliTraceUri, 'Atlas');
    await seedIntelliTrace(localIntelliTraceUri, 'Local');
    console.log('=== SEEDING COMPLETE ===');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
