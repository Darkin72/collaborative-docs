/**
 * Test Redis Pub/Sub Multi-Server Performance
 * 
 * This test validates that messages are properly broadcast across multiple
 * server instances via Redis Pub/Sub adapter.
 * 
 * Test Cases:
 * 1. Cross-server message delivery
 * 2. Cross-server latency measurement
 * 3. Connection distribution across servers
 * 4. Message delivery success rate
 */

const io = require('socket.io-client');
const { performance } = require('perf_hooks');

// Test configuration
const SERVER_URLS = [
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003'
];
const DOCUMENT_ID = `test-pubsub-${Date.now()}`;
const DOCUMENT_NAME = 'PubSub Test Document';
const NUM_CLIENTS_PER_SERVER = 5;
const NUM_MESSAGES = 50;
const MESSAGE_INTERVAL = 100; // ms between messages

// Metrics storage
const metrics = {
  totalMessagesSent: 0,
  totalMessagesReceived: 0,
  crossServerMessages: 0,
  sameServerMessages: 0,
  latencies: [],
  connectionsByServer: {},
  deliveryFailures: 0,
  clientData: []
};

// Track which client is on which server
const clientServerMap = new Map();

/**
 * Create a socket client connected to a specific server
 */
function createClient(serverUrl, clientId) {
  return new Promise((resolve, reject) => {
    const socket = io(serverUrl, {
      transports: ['websocket'],
      auth: {
        userId: `pubsub-test-user-${clientId}`,
        username: `PubSubUser${clientId}`
      },
      reconnection: false
    });

    socket.on('connect', () => {
      console.log(`✅ Client ${clientId} connected to ${serverUrl}`);
      
      // Track which server this client is on
      clientServerMap.set(clientId, serverUrl);
      metrics.connectionsByServer[serverUrl] = (metrics.connectionsByServer[serverUrl] || 0) + 1;
      
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      console.error(`❌ Client ${clientId} failed to connect to ${serverUrl}:`, error.message);
      reject(error);
    });

    setTimeout(() => {
      if (!socket.connected) {
        reject(new Error(`Client ${clientId} connection timeout`));
      }
    }, 5000);
  });
}

/**
 * Setup document subscription for a client
 */
function subscribeToDocument(socket, clientId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Client ${clientId} document subscription timeout`));
    }, 10000); // 10 second timeout

    socket.emit('get-document', {
      documentId: DOCUMENT_ID,
      documentName: DOCUMENT_NAME
    });

    socket.on('load-document', (data) => {
      clearTimeout(timeout);
      console.log(`📄 Client ${clientId} loaded document (version: ${data.version})`);
      resolve();
    });

    socket.on('access-denied', (error) => {
      clearTimeout(timeout);
      console.error(`❌ Client ${clientId} access denied:`, error);
      reject(new Error(`Access denied: ${error.error}`));
    });
  });
}

/**
 * Setup message receiving handler
 */
function setupMessageReceiver(socket, clientId, senderServerUrl) {
  socket.on('receive-changes', (delta) => {
    const receivedAt = performance.now();
    metrics.totalMessagesReceived++;
    
    if (delta.timestamp && delta.senderId) {
      const latency = receivedAt - delta.timestamp;
      metrics.latencies.push(latency);
      
      const senderServer = clientServerMap.get(delta.senderId);
      const receiverServer = clientServerMap.get(clientId);
      
      if (senderServer !== receiverServer) {
        metrics.crossServerMessages++;
        console.log(`🔄 Cross-server message: ${delta.senderId} (${senderServer}) → ${clientId} (${receiverServer}) | Latency: ${latency.toFixed(2)}ms`);
      } else {
        metrics.sameServerMessages++;
      }
    }
  });
}

/**
 * Send test messages from a client
 */
async function sendMessages(socket, clientId, numMessages) {
  for (let i = 0; i < numMessages; i++) {
    const message = {
      ops: [{ insert: `Message ${i} from client ${clientId}` }],
      timestamp: performance.now(),
      senderId: clientId
    };
    
    socket.emit('send-changes', message);
    metrics.totalMessagesSent++;
    
    // Wait between messages
    await new Promise(resolve => setTimeout(resolve, MESSAGE_INTERVAL));
  }
}

/**
 * Calculate statistics from collected metrics
 */
function calculateStats() {
  const latencies = metrics.latencies;
  
  if (latencies.length === 0) {
    return {
      avgLatency: 0,
      p50Latency: 0,
      p95Latency: 0,
      p99Latency: 0,
      minLatency: 0,
      maxLatency: 0
    };
  }
  
  latencies.sort((a, b) => a - b);
  
  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = sum / latencies.length;
  
  const p50Index = Math.floor(latencies.length * 0.5);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p99Index = Math.floor(latencies.length * 0.99);
  
  return {
    avgLatency: avg,
    p50Latency: latencies[p50Index],
    p95Latency: latencies[p95Index],
    p99Latency: latencies[p99Index],
    minLatency: latencies[0],
    maxLatency: latencies[latencies.length - 1]
  };
}

/**
 * Main test execution
 */
async function runTest() {
  console.log('\n========================================');
  console.log('🧪 Redis Pub/Sub Multi-Server Test');
  console.log('========================================\n');
  
  console.log('📋 Test Configuration:');
  console.log(`   Servers: ${SERVER_URLS.join(', ')}`);
  console.log(`   Clients per server: ${NUM_CLIENTS_PER_SERVER}`);
  console.log(`   Total clients: ${SERVER_URLS.length * NUM_CLIENTS_PER_SERVER}`);
  console.log(`   Messages per client: ${NUM_MESSAGES}`);
  console.log(`   Message interval: ${MESSAGE_INTERVAL}ms`);
  console.log(`   Document: ${DOCUMENT_ID}\n`);
  
  const clients = [];
  let clientIdCounter = 1;
  
  try {
    // Step 1: Create clients distributed across servers
    console.log('📡 Step 1: Connecting clients to servers...\n');
    
    for (const serverUrl of SERVER_URLS) {
      for (let i = 0; i < NUM_CLIENTS_PER_SERVER; i++) {
        const clientId = clientIdCounter++;
        try {
          const socket = await createClient(serverUrl, clientId);
          clients.push({ socket, clientId, serverUrl });
        } catch (error) {
          console.error(`Failed to create client ${clientId}:`, error.message);
          metrics.deliveryFailures++;
        }
      }
    }
    
    console.log(`\n✅ Connected ${clients.length} clients\n`);
    
    // Step 2: Subscribe all clients to the same document
    console.log('📄 Step 2: Subscribing to document...\n');
    
    await Promise.all(
      clients.map(({ socket, clientId }) => subscribeToDocument(socket, clientId))
    );
    
    console.log('✅ All clients subscribed to document\n');
    
    // Step 3: Setup message receivers
    console.log('👂 Step 3: Setting up message receivers...\n');
    
    clients.forEach(({ socket, clientId, serverUrl }) => {
      setupMessageReceiver(socket, clientId, serverUrl);
    });
    
    console.log('✅ Message receivers ready\n');
    
    // Step 4: Send messages from clients
    console.log('📤 Step 4: Sending test messages...\n');
    
    // Only send from clients on the first server to test cross-server delivery
    const sendingClients = clients.filter(c => c.serverUrl === SERVER_URLS[0]);
    
    await Promise.all(
      sendingClients.map(({ socket, clientId }) => 
        sendMessages(socket, clientId, NUM_MESSAGES)
      )
    );
    
    console.log('\n✅ All messages sent\n');
    
    // Step 5: Wait for messages to propagate
    console.log('⏳ Step 5: Waiting for message propagation (5 seconds)...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 6: Calculate and display results
    console.log('\n========================================');
    console.log('📊 TEST RESULTS');
    console.log('========================================\n');
    
    const stats = calculateStats();
    const deliveryRate = (metrics.totalMessagesReceived / (metrics.totalMessagesSent * (clients.length - sendingClients.length))) * 100;
    const crossServerRate = (metrics.crossServerMessages / metrics.totalMessagesReceived) * 100;
    
    console.log('📈 Message Delivery:');
    console.log(`   Sent: ${metrics.totalMessagesSent}`);
    console.log(`   Received: ${metrics.totalMessagesReceived}`);
    console.log(`   Expected: ${metrics.totalMessagesSent * (clients.length - sendingClients.length)}`);
    console.log(`   Delivery Rate: ${deliveryRate.toFixed(2)}%`);
    console.log(`   Failures: ${metrics.deliveryFailures}\n`);
    
    console.log('🔄 Cross-Server Messages:');
    console.log(`   Cross-server: ${metrics.crossServerMessages}`);
    console.log(`   Same-server: ${metrics.sameServerMessages}`);
    console.log(`   Cross-server Rate: ${crossServerRate.toFixed(2)}%\n`);
    
    console.log('⏱️  Latency Statistics (ms):');
    console.log(`   Average: ${stats.avgLatency.toFixed(2)}`);
    console.log(`   P50: ${stats.p50Latency.toFixed(2)}`);
    console.log(`   P95: ${stats.p95Latency.toFixed(2)}`);
    console.log(`   P99: ${stats.p99Latency.toFixed(2)}`);
    console.log(`   Min: ${stats.minLatency.toFixed(2)}`);
    console.log(`   Max: ${stats.maxLatency.toFixed(2)}\n`);
    
    console.log('🖥️  Connection Distribution:');
    Object.entries(metrics.connectionsByServer).forEach(([server, count]) => {
      console.log(`   ${server}: ${count} clients`);
    });
    console.log('\n');
    
    // Verdict
    console.log('========================================');
    console.log('✅ VERDICT:');
    console.log('========================================\n');
    
    if (deliveryRate >= 99) {
      console.log('✅ PASS: Delivery rate >= 99%');
    } else {
      console.log(`❌ FAIL: Delivery rate ${deliveryRate.toFixed(2)}% < 99%`);
    }
    
    if (metrics.crossServerMessages > 0) {
      console.log('✅ PASS: Cross-server messages detected (Redis Pub/Sub working)');
    } else {
      console.log('❌ FAIL: No cross-server messages (Redis Pub/Sub not working)');
    }
    
    if (stats.avgLatency < 100) {
      console.log('✅ PASS: Average latency < 100ms');
    } else {
      console.log(`⚠️  WARNING: Average latency ${stats.avgLatency.toFixed(2)}ms >= 100ms`);
    }
    
    console.log('\n========================================\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up...');
    clients.forEach(({ socket }) => socket.disconnect());
    
    // Save results to file
    const fs = require('fs');
    const resultsPath = './reports/pubsub-multi-server-report.json';
    fs.writeFileSync(resultsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      configuration: {
        servers: SERVER_URLS,
        clientsPerServer: NUM_CLIENTS_PER_SERVER,
        totalClients: SERVER_URLS.length * NUM_CLIENTS_PER_SERVER,
        messagesPerClient: NUM_MESSAGES,
        messageInterval: MESSAGE_INTERVAL
      },
      metrics: {
        ...metrics,
        ...calculateStats(),
        deliveryRate: (metrics.totalMessagesReceived / (metrics.totalMessagesSent * (clients.length - NUM_CLIENTS_PER_SERVER))) * 100
      }
    }, null, 2));
    
    console.log(`\n💾 Results saved to: ${resultsPath}\n`);
    process.exit(0);
  }
}

// Run test
runTest();
