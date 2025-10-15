import fetch from 'node-fetch';

async function debugStaffCreation() {
  try {
    console.log('🔍 Debugging staff creation...');
    
    // First, test database connection
    console.log('1. Testing database connection...');
    const dbTest = await fetch('http://localhost:3001/api/test-db');
    const dbResult = await dbTest.json();
    console.log('Database test result:', dbResult);
    
    // Test login as admin
    console.log('2. Testing admin login...');
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
    
    console.log('Login response status:', loginResponse.status);
    
    if (!loginResponse.ok) {
      const loginError = await loginResponse.text();
      console.error('Login failed:', loginError);
      return;
    }
    
    const loginData = await loginResponse.json();
    console.log('Login successful, user role:', loginData.user?.role);
    const token = loginData.token;
    
    // Test staff creation
    console.log('3. Testing staff creation...');
    const staffData = {
      email: 'sabareeswarann@gmail.com',
      password: '......',
      full_name: 'SABAREESWARAN S',
      phone: '07867894460',
      address: '92/1, Pattuthurai, dharapuram, Tiruppur 638106.',
      role: 'maintenance_technician'
    };
    
    console.log('Sending staff data:', { ...staffData, password: '***' });
    
    const createResponse = await fetch('http://localhost:3001/api/users/create-staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(staffData)
    });
    
    console.log('Create staff response status:', createResponse.status);
    console.log('Create staff response headers:', Object.fromEntries(createResponse.headers.entries()));
    
    const responseText = await createResponse.text();
    console.log('Create staff response body:', responseText);
    
    if (createResponse.ok) {
      console.log('✅ Staff creation successful!');
    } else {
      console.log('❌ Staff creation failed');
      try {
        const errorData = JSON.parse(responseText);
        console.log('Error details:', errorData);
      } catch {
        console.log('Raw error response:', responseText);
      }
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Full error:', error);
  }
}

debugStaffCreation();
