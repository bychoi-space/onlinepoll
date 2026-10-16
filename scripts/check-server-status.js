async function checkServers() {
  console.log('1. Checking local http://localhost:3000/api/quota/list...');
  try {
    const res = await fetch('http://localhost:3000/api/quota/list', { signal: AbortSignal.timeout(3000) });
    console.log('Local status:', res.status);
    const data = await res.json();
    console.log('Local quota count:', data.length);
  } catch (e) {
    console.log('Local failed:', e.message);
  }

  console.log('\n2. Checking GCP http://34.64.233.77:3000/api/quota/list...');
  try {
    const res = await fetch('http://34.64.233.77:3000/api/quota/list', { signal: AbortSignal.timeout(3000) });
    console.log('GCP status:', res.status);
    const data = await res.json();
    console.log('GCP quota count:', data.length);
  } catch (e) {
    console.log('GCP failed:', e.message);
  }
}

checkServers().catch(console.error);
