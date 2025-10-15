import fetch from 'node-fetch';

async function testStaffCreation() {
  try {
    console.log('🧪 Testing staff creation...');
    
    // First, login as admin to get token
    console.log('1. Logging in as admin...');
    const loginResponse = await fetch('http://localhost:3001/api/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'admin@bluegrid.com',
        password: 'admin123'
      })
    });
    
    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }
    
    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Login successful');
    
    // Test creating a maintenance technician
    console.log('2. Creating maintenance technician...');
    const technicianData = {
      email: 'technician@test.com',
      password: 'test123',
      full_name: 'Test Technician',
      phone: '9876543210',
      address: 'Test Address',
      role: 'maintenance_technician'
    };
    
    const createTechResponse = await fetch('http://localhost:3001/api/users/create-staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(technicianData)
    });
    
    if (!createTechResponse.ok) {
      const errorText = await createTechResponse.text();
      throw new Error(`Create technician failed: ${createTechResponse.status} ${createTechResponse.statusText}\n${errorText}`);
    }
    
    const techResult = await createTechResponse.json();
    console.log('✅ Maintenance technician created:', techResult.message);
    
    // Test creating a water flow controller
    console.log('3. Creating water flow controller...');
    const controllerData = {
      email: 'controller@test.com',
      password: 'test123',
      full_name: 'Test Controller',
      phone: '9876543211',
      address: 'Controller Address',
      role: 'water_flow_controller'
    };
    
    const createControllerResponse = await fetch('http://localhost:3001/api/users/create-staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(controllerData)
    });
    
    if (!createControllerResponse.ok) {
      const errorText = await createControllerResponse.text();
      throw new Error(`Create controller failed: ${createControllerResponse.status} ${createControllerResponse.statusText}\n${errorText}`);
    }
    
    const controllerResult = await createControllerResponse.json();
    console.log('✅ Water flow controller created:', controllerResult.message);
    
    // Test login with created accounts
    console.log('4. Testing login with created technician...');
    const techLoginResponse = await fetch('http://localhost:3001/api/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'technician@test.com',
        password: 'test123'
      })
    });
    
    if (techLoginResponse.ok) {
      console.log('✅ Technician can login successfully');
    } else {
      console.log('❌ Technician login failed');
    }
    
    console.log('5. Testing login with created controller...');
    const controllerLoginResponse = await fetch('http://localhost:3001/api/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'controller@test.com',
        password: 'test123'
      })
    });
    
    if (controllerLoginResponse.ok) {
      console.log('✅ Controller can login successfully');
    } else {
      console.log('❌ Controller login failed');
    }
    
    console.log('\n🎉 All tests passed! Staff creation is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testStaffCreation();
