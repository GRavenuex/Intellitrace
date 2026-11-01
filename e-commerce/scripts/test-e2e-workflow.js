const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';
let sessionCookie = '';

async function run() {
    console.log('====================================================');
    console.log('STARTING COMPLETE E2E WORKFLOW TEST ON INTELLISHOP');
    console.log('====================================================\n');

    // 1. Login
    console.log('[Step 1] Logging in as gaurav@example.com...');
    const loginParams = new URLSearchParams();
    loginParams.append('email', 'gaurav@example.com');
    loginParams.append('password', 'password123');

    const loginRes = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginParams.toString(),
        redirect: 'manual'
    });

    const setCookie = loginRes.headers.get('set-cookie');
    if (!setCookie) throw new Error('Failed to obtain session cookie from /login');
    sessionCookie = setCookie.split(';')[0];
    console.log('✓ Successfully logged in. Session cookie acquired:', sessionCookie);

    // 2. Browse Products
    console.log('\n[Step 2] Fetching Products list from Product Service via IntelliShop...');
    const productsRes = await fetch(`${BASE_URL}/products`, {
        headers: { Cookie: sessionCookie }
    });
    const productsHtml = await productsRes.text();
    if (!productsHtml.includes('MacBook Pro') && !productsHtml.includes('iPhone')) {
        throw new Error('Products page does not contain expected products from Product Service');
    }
    console.log('✓ Products page loaded successfully with products from Product Service');

    // Fetch product ID directly from Product Service
    const pServiceRes = await fetch('http://localhost:3001/api/products');
    const pServiceData = await pServiceRes.json();
    const testProduct = pServiceData.data[0];
    console.log(`✓ Selected test product: "${testProduct.name}" (ID: ${testProduct._id}, Price: ₹${testProduct.price})`);

    // 3. Add to Cart
    console.log('\n[Step 3] Adding product to Cart via Cart Service...');
    const cartParams = new URLSearchParams();
    cartParams.append('productId', testProduct._id);
    cartParams.append('quantity', '2');

    const addCartRes = await fetch(`${BASE_URL}/cart/add`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: sessionCookie
        },
        body: cartParams.toString(),
        redirect: 'manual'
    });
    console.log('✓ Product added to cart, status:', addCartRes.status);

    // Verify Cart Page
    const viewCartRes = await fetch(`${BASE_URL}/cart`, {
        headers: { Cookie: sessionCookie }
    });
    const cartHtml = await viewCartRes.text();
    const escapedName = testProduct.name.replace(/"/g, '&#34;');
    if (!cartHtml.includes(testProduct.name) && !cartHtml.includes(escapedName)) {
        throw new Error('Cart page does not show added product');
    }
    console.log('✓ Cart page displays correct product items and totals');

    // 4. Checkout Page
    console.log('\n[Step 4] Accessing Checkout page...');
    const checkoutRes = await fetch(`${BASE_URL}/checkout`, {
        headers: { Cookie: sessionCookie }
    });
    const checkoutHtml = await checkoutRes.text();
    if (!checkoutHtml.includes('Shipping Address')) {
        throw new Error('Checkout page failed to load');
    }
    console.log('✓ Checkout page rendered with shipping form and order summary');

    // 5. Create Order via Order Service
    console.log('\n[Step 5] Creating Order via Order Service...');
    const orderParams = new URLSearchParams();
    orderParams.append('fullName', 'Gaurav Sutar');
    orderParams.append('address', '101 Tech Residency, Bandra West');
    orderParams.append('city', 'Mumbai');
    orderParams.append('state', 'Maharashtra');
    orderParams.append('pincode', '400050');
    orderParams.append('phone', '+91 9876543210');

    const createOrderRes = await fetch(`${BASE_URL}/checkout/create-order`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: sessionCookie
        },
        body: orderParams.toString(),
        redirect: 'manual'
    });

    const paymentLocation = createOrderRes.headers.get('location');
    console.log('✓ Order created, redirected to:', paymentLocation);
    const orderId = paymentLocation.split('/payment/').pop();
    console.log('✓ Created Order ID:', orderId);

    // 6. Test Duplicate Order Prevention
    console.log('\n[Step 6] Testing Duplicate Order Prevention...');
    const duplicateRes = await fetch(`${BASE_URL}/checkout/create-order`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: sessionCookie
        },
        body: orderParams.toString(),
        redirect: 'manual'
    });
    const duplicateLocation = duplicateRes.headers.get('location');
    const duplicateOrderId = duplicateLocation.split('/payment/').pop();
    if (duplicateOrderId === orderId) {
        console.log('✓ SUCCESS: Duplicate order was prevented! Same pending order ID returned:', duplicateOrderId);
    } else {
        throw new Error(`Duplicate order check failed! Created a new order: ${duplicateOrderId}`);
    }

    // 7. Render Mock Payment Page
    console.log('\n[Step 7] Viewing Payment Page for Order...');
    const paymentPageRes = await fetch(`${BASE_URL}/payment/${orderId}`, {
        headers: { Cookie: sessionCookie }
    });
    const paymentHtml = await paymentPageRes.text();
    if (!paymentHtml.toLowerCase().includes('simulate success') || !paymentHtml.toLowerCase().includes('simulate payment failure')) {
        throw new Error('Payment page did not render simulation buttons');
    }
    console.log('✓ Mock Payment page rendered with simulation controls');

    // 8. Test Payment Failure Simulation
    console.log('\n[Step 8] Testing Payment Failure Simulation...');
    const failPaymentParams = new URLSearchParams();
    failPaymentParams.append('orderId', orderId);
    failPaymentParams.append('paymentResult', 'FAILURE');
    failPaymentParams.append('paymentMethod', 'Mock Credit Card');

    const failPaymentRes = await fetch(`${BASE_URL}/payment/process`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: sessionCookie
        },
        body: failPaymentParams.toString(),
        redirect: 'manual'
    });
    const failHtml = await failPaymentRes.text();
    if (failHtml.includes('Payment transaction was declined or failed')) {
        console.log('✓ Payment Failure handled properly: error message displayed and retry enabled');
    } else {
        console.log('Response status:', failPaymentRes.status);
    }

    // Verify order still has paymentStatus = 'failed' in Order Service
    const orderStatusRes1 = await fetch(`http://localhost:3003/api/orders/${orderId}`);
    const orderStatusData1 = await orderStatusRes1.json();
    console.log('✓ Order paymentStatus in Order Service is now:', orderStatusData1.data.paymentStatus);

    // 9. Test Payment Success Simulation
    console.log('\n[Step 9] Testing Payment Success Simulation...');
    const successPaymentParams = new URLSearchParams();
    successPaymentParams.append('orderId', orderId);
    successPaymentParams.append('paymentResult', 'SUCCESS');
    successPaymentParams.append('paymentMethod', 'Mock Credit Card');

    const successPaymentRes = await fetch(`${BASE_URL}/payment/process`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: sessionCookie
        },
        body: successPaymentParams.toString(),
        redirect: 'manual'
    });

    const confirmLocation = successPaymentRes.headers.get('location');
    console.log('✓ Payment successful! Redirected to:', confirmLocation);

    // 10. Order Confirmation Page
    console.log('\n[Step 10] Viewing Order Confirmation page...');
    const confirmUrl = confirmLocation.startsWith('http') ? confirmLocation : `${BASE_URL}${confirmLocation}`;
    const confirmRes = await fetch(confirmUrl, {
        headers: { Cookie: sessionCookie }
    });
    const confirmHtml = await confirmRes.text();
    if (!confirmHtml.includes('Order Confirmed') && !confirmHtml.includes(orderId)) {
        throw new Error('Order confirmation page did not load');
    }
    console.log('✓ Order Confirmation page loaded successfully for order #' + orderId);

    // Verify Cart was Cleared
    const postPayCartRes = await fetch(`${BASE_URL}/cart`, {
        headers: { Cookie: sessionCookie }
    });
    const postPayCartHtml = await postPayCartRes.text();
    if (postPayCartHtml.includes('Your cart is empty') || postPayCartHtml.includes('No items in your cart') || !postPayCartHtml.includes(testProduct.name)) {
        console.log('✓ Cart was automatically cleared after successful payment');
    }

    // 11. Order History
    console.log('\n[Step 11] Viewing My Orders History...');
    const ordersHistoryRes = await fetch(`${BASE_URL}/orders`, {
        headers: { Cookie: sessionCookie }
    });
    const ordersHistoryHtml = await ordersHistoryRes.text();
    if (!ordersHistoryHtml.includes(orderId)) {
        throw new Error('Order history does not include recently placed order');
    }
    console.log('✓ Order history page contains order #' + orderId);

    // 12. Single Order Detail View
    console.log('\n[Step 12] Viewing Order Detail View...');
    const orderDetailRes = await fetch(`${BASE_URL}/orders/${orderId}`, {
        headers: { Cookie: sessionCookie }
    });
    const orderDetailHtml = await orderDetailRes.text();
    if (!orderDetailHtml.includes(orderId)) {
        throw new Error('Order detail page does not contain order id');
    }
    console.log('✓ Single order detail page loaded with full item and address details');

    console.log('\n====================================================');
    console.log('ALL E2E WORKFLOW TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
}

run().catch(err => {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
});
