const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ecommerceUri = process.env.ECOMMERCE_MONGO_URI || process.env.MONGO_URI || 'mongodb://mongodb:27017/ecommerce';
const intellitraceUri = process.env.INTELLITRACE_MONGO_URI || 'mongodb://mongodb:27017/intellitrace';

const products = [
    {
        name: 'MacBook Pro 16" M3 Max',
        description: 'Apple M3 Max chip with 16-core CPU and 40-core GPU, 48GB unified memory, 1TB SSD storage.',
        price: 199999,
        category: 'Laptops',
        brand: 'Apple',
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80',
        stock: 15,
        rating: 4.9
    },
    {
        name: 'Dell XPS 15 OLED',
        description: '13th Gen Intel Core i9, 32GB DDR5, 1TB NVMe SSD, NVIDIA GeForce RTX 4070, 3.5K OLED touch.',
        price: 149999,
        category: 'Laptops',
        brand: 'Dell',
        image: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=600&q=80',
        stock: 20,
        rating: 4.8
    },
    {
        name: 'iPhone 15 Pro Max',
        description: 'Titanium design with A17 Pro chip, Action button, 48MP main camera system, 256GB.',
        price: 134999,
        category: 'Smartphones',
        brand: 'Apple',
        image: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=600&q=80',
        stock: 35,
        rating: 4.9
    },
    {
        name: 'Samsung Galaxy S24 Ultra',
        description: 'Galaxy AI with Snapdragon 8 Gen 3, 200MP camera with Quad Telephoto, S Pen, 512GB.',
        price: 129999,
        category: 'Smartphones',
        brand: 'Samsung',
        image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=600&q=80',
        stock: 25,
        rating: 4.7
    },
    {
        name: 'Sony WH-1000XM5',
        description: 'Industry-leading noise canceling with two processors, 8 mics, Auto NC Optimizer, 30h battery.',
        price: 29999,
        category: 'Audio',
        brand: 'Sony',
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
        stock: 50,
        rating: 4.8
    },
    {
        name: 'Bose QuietComfort Ultra',
        description: 'CustomTune sound calibration, world-class active noise cancellation, revolutionary spatial audio.',
        price: 34999,
        category: 'Audio',
        brand: 'Bose',
        image: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80',
        stock: 40,
        rating: 4.6
    },
    {
        name: 'Apple Watch Ultra 2',
        description: 'Rugged 49mm titanium case, precision dual-frequency GPS, up to 36 hours battery life.',
        price: 89999,
        category: 'Wearables',
        brand: 'Apple',
        image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80',
        stock: 18,
        rating: 4.9
    },
    {
        name: 'Samsung Galaxy Watch 6 Pro',
        description: 'Advanced sleep coaching, ECG and heart rate sensors, sapphire crystal glass, rotating bezel.',
        price: 36999,
        category: 'Wearables',
        brand: 'Samsung',
        image: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=600&q=80',
        stock: 30,
        rating: 4.5
    }
];

async function seed() {
    console.log('--- Starting Database Seeding ---');
    console.log('Ecommerce URI:', ecommerceUri);
    console.log('IntelliTrace URI:', intellitraceUri);

    // 1. Seed Ecommerce DB
    try {
        const ecomConn = await mongoose.createConnection(ecommerceUri, { serverSelectionTimeoutMS: 8000 }).asPromise();
        console.log('Connected to Ecommerce database');

        const productCount = await ecomConn.db.collection('products').countDocuments();
        if (productCount === 0) {
            await ecomConn.db.collection('products').insertMany(products.map(p => ({
                ...p,
                createdAt: new Date(),
                updatedAt: new Date()
            })));
            console.log(`Inserted ${products.length} products`);
        } else {
            console.log(`Products already exist (${productCount} found)`);
        }

        const hash = await bcrypt.hash('password123', 12);
        const users = [
            { firstName: 'Gaurav', lastName: 'Sutar', email: 'gaurav@example.com', password: hash, userType: 'customer' },
            { firstName: 'Admin', lastName: 'User', email: 'admin@intellishop.com', password: hash, userType: 'admin' },
            { firstName: 'Customer', lastName: 'Demo', email: 'customer@intellishop.com', password: hash, userType: 'customer' },
            { firstName: 'Gaurav', lastName: 'Developer', email: 'gravenux@gmail.com', password: hash, userType: 'admin' }
        ];

        for (const u of users) {
            const existing = await ecomConn.db.collection('users').findOne({
                email: { $regex: new RegExp('^' + u.email + '$', 'i') }
            });
            if (!existing) {
                await ecomConn.db.collection('users').insertOne({ ...u, createdAt: new Date(), updatedAt: new Date() });
                console.log(`Created ecommerce user: ${u.email}`);
            } else {
                await ecomConn.db.collection('users').updateOne({ _id: existing._id }, { $set: { password: hash } });
            }
        }
        await ecomConn.close();
    } catch (err) {
        console.error('Ecommerce seeding error:', err.message);
    }

    // 2. Seed IntelliTrace DB
    try {
        const traceConn = await mongoose.createConnection(intellitraceUri, { serverSelectionTimeoutMS: 8000 }).asPromise();
        console.log('Connected to IntelliTrace database');

        const hash = await bcrypt.hash('password123', 10);
        const devs = [
            { email: 'admin@intellitrace.com', password: hash },
            { email: 'admin@intellitrace.dev', password: hash }
        ];

        for (const d of devs) {
            const existing = await traceConn.db.collection('developers').findOne({
                email: { $regex: new RegExp('^' + d.email + '$', 'i') }
            });
            if (!existing) {
                await traceConn.db.collection('developers').insertOne({ ...d, createdAt: new Date(), updatedAt: new Date() });
                console.log(`Created developer: ${d.email}`);
            } else {
                await traceConn.db.collection('developers').updateOne({ _id: existing._id }, { $set: { password: hash } });
            }
        }
        await traceConn.close();
    } catch (err) {
        console.error('IntelliTrace seeding error:', err.message);
    }

    console.log('--- Database Seeding Complete ---');
}

seed().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
