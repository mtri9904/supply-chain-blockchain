// Sử dụng fetch tích hợp sẵn trong Node.js 18+ (không cần node-fetch)
const API_URL = 'http://localhost:5000';

async function testAPIEndpoints() {
    console.log('🧪 Testing API endpoints...\n');

    // Test 1: Basic connectivity
    console.log('📝 Test 1: Basic connectivity');
    try {
        const response = await fetch(`${API_URL}/api/blockchain/stats`);
        const data = await response.json();
        console.log('✅ API is running:', data.success ? 'YES' : 'NO');
        console.log('📊 Response:', data);
    } catch (error) {
        console.log('❌ API connection failed:', error.message);
        return;
    }

    // Test 2: User history endpoint
    console.log('\n📝 Test 2: User history endpoint');
    try {
        const response = await fetch(`${API_URL}/api/user-history/testuser`, {
            headers: {
                'Authorization': 'Bearer test-token'
            }
        });
        
        console.log('📊 Status:', response.status);
        console.log('📊 Content-Type:', response.headers.get('content-type'));
        
        if (response.headers.get('content-type')?.includes('application/json')) {
            const data = await response.json();
            console.log('✅ JSON response:', data);
        } else {
            const text = await response.text();
            console.log('❌ Non-JSON response:', text.substring(0, 200));
        }
    } catch (error) {
        console.log('❌ User history test failed:', error.message);
    }

    // Test 3: Record endpoint
    console.log('\n📝 Test 3: Record endpoint');
    try {
        const response = await fetch(`${API_URL}/api/record`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-token'
            },
            body: JSON.stringify({
                productId: 'TEST123',
                action: 'harvest',
                role: 'farmer',
                actor: 'testuser'
            })
        });
        
        console.log('📊 Status:', response.status);
        console.log('📊 Content-Type:', response.headers.get('content-type'));
        
        if (response.headers.get('content-type')?.includes('application/json')) {
            const data = await response.json();
            console.log('✅ JSON response:', data);
        } else {
            const text = await response.text();
            console.log('❌ Non-JSON response:', text.substring(0, 200));
        }
    } catch (error) {
        console.log('❌ Record test failed:', error.message);
    }

    console.log('\n🎉 API testing completed!');
}

testAPIEndpoints();
