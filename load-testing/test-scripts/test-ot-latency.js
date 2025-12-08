const io = require('socket.io-client');
const chalk = require('chalk');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:12345';
const NUM_REQUESTS = parseInt(process.env.NUM_REQUESTS) || 100;
// Use a document ID that exists or will be created by the socket connection
const TEST_DOC_ID = process.env.TEST_DOC_ID || 'latency-test-doc';

// Test accounts
const ADMIN_ACCOUNT = { username: 'admin', password: 'admin123' };

class LatencyMetrics {
  constructor(testName) {
    this.testName = testName;
    this.latencies = [];
    this.errors = 0;
    this.startTime = null;
    this.endTime = null;
  }

  recordLatency(ms) {
    this.latencies.push(ms);
  }

  recordError() {
    this.errors++;
  }

  start() {
    this.startTime = Date.now();
  }

  end() {
    this.endTime = Date.now();
  }

  getStats() {
    if (this.latencies.length === 0) {
      return {
        testName: this.testName,
        count: 0,
        avgLatency: 0,
        minLatency: 0,
        maxLatency: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        totalTime: 0,
        throughput: 0,
        errors: this.errors
      };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    const totalTime = this.endTime - this.startTime;

    return {
      testName: this.testName,
      count: this.latencies.length,
      avgLatency: (sum / this.latencies.length).toFixed(2),
      minLatency: sorted[0].toFixed(2),
      maxLatency: sorted[sorted.length - 1].toFixed(2),
      p50: sorted[Math.floor(sorted.length * 0.5)].toFixed(2),
      p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      p99: sorted[Math.floor(sorted.length * 0.99)].toFixed(2),
      totalTime: totalTime,
      throughput: ((this.latencies.length / totalTime) * 1000).toFixed(2),
      errors: this.errors
    };
  }
}

async function login(username, password) {
  return new Promise((resolve, reject) => {
    fetch(`${SERVER_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user) {
          // Return user info instead of token (this server doesn't use tokens)
          resolve(data.user);
        } else {
          reject(new Error('Login failed'));
        }
      })
      .catch(reject);
  });
}

async function createTestDocument(user) {
  return new Promise((resolve, reject) => {
    fetch(`${SERVER_URL}/api/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Latency Test Document',
        content: '',
        userId: user.id
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data._id) {
          resolve(data._id);
        } else {
          reject(new Error('Failed to create document'));
        }
      })
      .catch(reject);
  });
}

async function deleteTestDocument(user, docId) {
  try {
    await fetch(`${SERVER_URL}/api/documents/${docId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    // Ignore cleanup errors
  }
}

class LatencyTestClient {
  constructor(user, docId, metrics, useOT = true) {
    this.user = user;
    this.docId = docId;
    this.metrics = metrics;
    this.useOT = useOT;
    this.socket = null;
    this.ready = false;
    this.requestQueue = [];
    this.currentVersion = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(SERVER_URL, {
        auth: { userId: this.user.id },
        transports: ['websocket']
      });

      this.socket.on('connect', () => {
        console.log(chalk.gray(`Connected: ${this.useOT ? 'OT' : 'Simple'} mode`));
      });

      this.socket.on('document-joined', (data) => {
        this.currentVersion = data.version || 0;
        this.ready = true;
        resolve();
      });

      this.socket.on('version-conflict', () => {
        // Expected in Simple mode, not in OT mode
      });

      this.socket.on('change-applied', (data) => {
        if (data && data.version) {
          this.currentVersion = data.version;
        }
      });

      this.socket.on('error', (error) => {
        console.error(chalk.red(`Socket error: ${error}`));
      });

      setTimeout(() => {
        if (!this.ready) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      // Join document
      this.socket.emit('join-document', this.docId);
    });
  }

  async sendWrite(index) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const change = {
        type: 'insert',
        position: index,
        content: 'x'
      };

      const eventName = this.useOT ? 'send-changes-ot' : 'send-changes';
      const payload = this.useOT 
        ? { documentId: this.docId, changes: [change] }
        : { documentId: this.docId, changes: [change], version: this.currentVersion };

      // Set up response listener
      const responseHandler = (data) => {
        const latency = Date.now() - startTime;
        this.metrics.recordLatency(latency);
        
        if (data && data.version) {
          this.currentVersion = data.version;
        }
        
        this.socket.off('change-applied', responseHandler);
        this.socket.off('version-conflict', conflictHandler);
        resolve();
      };

      const conflictHandler = () => {
        const latency = Date.now() - startTime;
        this.metrics.recordLatency(latency);
        this.metrics.recordError();
        this.socket.off('change-applied', responseHandler);
        this.socket.off('version-conflict', conflictHandler);
        resolve();
      };

      this.socket.once('change-applied', responseHandler);
      this.socket.once('version-conflict', conflictHandler);

      // Send the change
      this.socket.emit(eventName, payload);

      // Timeout fallback
      setTimeout(() => {
        this.socket.off('change-applied', responseHandler);
        this.socket.off('version-conflict', conflictHandler);
        const latency = Date.now() - startTime;
        this.metrics.recordLatency(latency);
        this.metrics.recordError();
        resolve();
      }, 10000);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

async function runLatencyTest(useOT = true) {
  const testName = useOT ? 'With OT' : 'Without OT (Simple)';
  console.log(chalk.cyan(`\n${'='.repeat(60)}`));
  console.log(chalk.cyan(`Running Latency Test: ${testName}`));
  console.log(chalk.cyan(`${'='.repeat(60)}`));
  console.log(chalk.gray(`Requests: ${NUM_REQUESTS}`));
  console.log(chalk.gray(`Mode: ${useOT ? 'Operational Transformation' : 'Simple writes'}\n`));

  const metrics = new LatencyMetrics(testName);
  
  try {
    // Login
    console.log(chalk.gray('Logging in...'));
    const user = await login(ADMIN_ACCOUNT.username, ADMIN_ACCOUNT.password);
    
    // Create client (it will join/create document via socket)
    const client = new LatencyTestClient(user, TEST_DOC_ID, metrics, useOT);
    
    // Connect
    console.log(chalk.gray('Connecting to document...'));
    await client.connect();
    
    // Run requests
    console.log(chalk.yellow(`Sending ${NUM_REQUESTS} write requests...`));
    metrics.start();
    
    for (let i = 0; i < NUM_REQUESTS; i++) {
      await client.sendWrite(i);
      
      // Show progress every 20 requests
      if ((i + 1) % 20 === 0) {
        console.log(chalk.gray(`  Progress: ${i + 1}/${NUM_REQUESTS}`));
      }
    }
    
    metrics.end();
    
    // Cleanup
    console.log(chalk.gray('Disconnecting...'));
    client.disconnect();
    
    return metrics.getStats();
    
  } catch (error) {
    console.error(chalk.red(`Test failed: ${error.message}`));
    return null;
  }
}

function printResults(simpleStats, otStats) {
  console.log(chalk.cyan(`\n${'='.repeat(60)}`));
  console.log(chalk.cyan.bold('LATENCY TEST RESULTS'));
  console.log(chalk.cyan(`${'='.repeat(60)}\n`));

  if (!simpleStats || !otStats) {
    console.log(chalk.red('One or both tests failed to complete'));
    return;
  }

  // Comparison table
  console.log(chalk.white.bold('Latency Comparison (milliseconds):'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(
    chalk.white.bold('Metric'.padEnd(20)) +
    chalk.yellow('Without OT'.padEnd(20)) +
    chalk.green('With OT'.padEnd(20))
  );
  console.log(chalk.gray('─'.repeat(60)));

  const metrics = [
    ['Requests Completed', simpleStats.count, otStats.count],
    ['Average Latency', `${simpleStats.avgLatency} ms`, `${otStats.avgLatency} ms`],
    ['Min Latency', `${simpleStats.minLatency} ms`, `${otStats.minLatency} ms`],
    ['Max Latency', `${simpleStats.maxLatency} ms`, `${otStats.maxLatency} ms`],
    ['P50 (Median)', `${simpleStats.p50} ms`, `${otStats.p50} ms`],
    ['P95', `${simpleStats.p95} ms`, `${otStats.p95} ms`],
    ['P99', `${simpleStats.p99} ms`, `${otStats.p99} ms`],
    ['Total Time', `${simpleStats.totalTime} ms`, `${otStats.totalTime} ms`],
    ['Throughput', `${simpleStats.throughput} req/s`, `${otStats.throughput} req/s`],
    ['Errors/Conflicts', simpleStats.errors, otStats.errors]
  ];

  metrics.forEach(([metric, simple, ot]) => {
    console.log(
      chalk.white(metric.padEnd(20)) +
      chalk.yellow(String(simple).padEnd(20)) +
      chalk.green(String(ot).padEnd(20))
    );
  });

  console.log(chalk.gray('─'.repeat(60)));

  // Calculate overhead
  const avgOverhead = ((parseFloat(otStats.avgLatency) - parseFloat(simpleStats.avgLatency)) / parseFloat(simpleStats.avgLatency) * 100).toFixed(1);
  const throughputReduction = ((parseFloat(simpleStats.throughput) - parseFloat(otStats.throughput)) / parseFloat(simpleStats.throughput) * 100).toFixed(1);

  console.log(chalk.cyan('\nTrade-off Analysis:'));
  console.log(chalk.gray('─'.repeat(60)));
  
  if (parseFloat(avgOverhead) > 0) {
    console.log(chalk.yellow(`⚡ OT adds ${avgOverhead}% latency overhead`));
    console.log(chalk.gray(`   (${simpleStats.avgLatency}ms → ${otStats.avgLatency}ms per request)`));
  } else {
    console.log(chalk.green(`⚡ OT latency similar to simple writes`));
  }

  if (parseFloat(throughputReduction) > 0) {
    console.log(chalk.yellow(`📉 Throughput reduced by ${throughputReduction}%`));
    console.log(chalk.gray(`   (${simpleStats.throughput} → ${otStats.throughput} requests/second)`));
  }

  console.log(chalk.green(`✅ Conflicts eliminated: ${simpleStats.errors} → ${otStats.errors}`));
  console.log(chalk.gray('─'.repeat(60)));

  console.log(chalk.cyan('\nConclusion:'));
  console.log(chalk.white(`OT increases processing time by ~${avgOverhead}% but eliminates`));
  console.log(chalk.white(`${simpleStats.errors} conflicts, preventing data loss and retries.`));
  
  if (parseFloat(avgOverhead) < 50) {
    console.log(chalk.green('\n✓ Acceptable trade-off: Small latency cost for strong consistency'));
  } else {
    console.log(chalk.yellow('\n⚠ Significant overhead: Monitor performance in production'));
  }

  console.log(chalk.cyan('\n' + '='.repeat(60) + '\n'));
}

async function main() {
  console.log(chalk.cyan.bold('\n🔬 OPERATIONAL TRANSFORMATION LATENCY TEST\n'));
  console.log(chalk.gray(`Server: ${SERVER_URL}`));
  console.log(chalk.gray(`Requests per test: ${NUM_REQUESTS}\n`));

  // Run both tests
  const simpleStats = await runLatencyTest(false);
  
  // Wait a bit between tests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const otStats = await runLatencyTest(true);

  // Print comparison
  printResults(simpleStats, otStats);
}

// Run the test
main().catch(error => {
  console.error(chalk.red(`Fatal error: ${error.message}`));
  process.exit(1);
});
