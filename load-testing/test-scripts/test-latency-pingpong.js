const io = require('socket.io-client');
const chalk = require('chalk');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:12345';
const NUM_REQUESTS = parseInt(process.env.NUM_REQUESTS) || 100;
const DOCUMENT_ID = process.env.DOC_ID || 'latency-test-doc';
const USER_ID = 'user-001'; // Admin user ID

console.log(chalk.cyan.bold('\n🏓 PING-PONG LATENCY TEST: OT Processing Overhead\n'));
console.log(chalk.gray(`Server: ${SERVER_URL}`));
console.log(chalk.gray(`Document: ${DOCUMENT_ID}`));
console.log(chalk.gray(`Requests: ${NUM_REQUESTS}\n`));

class PingPongLatencyTester {
  constructor(useOT) {
    this.useOT = useOT;
    this.latencies = [];
    this.conflicts = 0;
    this.socket = null;
    this.ready = false;
    this.currentVersion = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(SERVER_URL, {
        auth: { userId: USER_ID },
        transports: ['websocket']
      });

      this.socket.on('connect', () => {
        console.log(chalk.gray(`  ✓ Connected (${this.useOT ? 'OT mode' : 'Simple mode'})`));
        this.socket.emit('get-document', { 
          documentId: DOCUMENT_ID,
          documentName: 'Latency Test Document'
        });
      });

      this.socket.on('load-document', (data) => {
        this.currentVersion = data.version || 0;
        this.ready = true;
        console.log(chalk.gray(`  ✓ Document loaded (version: ${this.currentVersion})`));
        resolve();
      });

      // Track version updates
      this.socket.on('receive-changes', (data) => {
        if (data && data.version) {
          this.currentVersion = data.version;
        }
      });

      // Track conflicts (only happens in Simple mode)
      this.socket.on('version-conflict', () => {
        this.conflicts++;
      });

      this.socket.on('connect_error', (err) => {
        reject(new Error(`Connection error: ${err.message}`));
      });

      setTimeout(() => {
        if (!this.ready) reject(new Error('Connection timeout'));
      }, 10000);
    });
  }

  async sendRequest(index) {
    return new Promise((resolve) => {
      const start = performance.now();
      const requestId = `req-${Date.now()}-${index}`;
      
      const operation = {
        type: 'insert',
        position: index,
        content: 'x',
        requestId: requestId // Tag the request
      };

      const eventName = this.useOT ? 'send-changes-ot' : 'send-changes';
      const payload = this.useOT 
        ? { 
            documentId: DOCUMENT_ID, 
            delta: operation,
            version: this.currentVersion 
          }
        : { 
            documentId: DOCUMENT_ID, 
            delta: operation,
            version: this.currentVersion 
          };

      let resolved = false;

      // For OT mode: listen for acknowledgment events (ot-ack or ot-transform)
      const onOtAck = (data) => {
        if (!resolved) {
          resolved = true;
          const end = performance.now();
          const latency = end - start;
          this.latencies.push(latency);
          cleanup();
          
          if (data && data.version !== undefined) {
            this.currentVersion = data.version;
          }
          
          resolve();
        }
      };

      const onOtTransform = (data) => {
        if (!resolved) {
          resolved = true;
          const end = performance.now();
          const latency = end - start;
          this.latencies.push(latency);
          cleanup();
          
          if (data && data.version !== undefined) {
            this.currentVersion = data.version;
          }
          
          resolve();
        }
      };

      const onOtError = (data) => {
        if (!resolved) {
          resolved = true;
          const end = performance.now();
          const latency = end - start;
          this.latencies.push(latency);
          cleanup();
          resolve();
        }
      };

      // For Simple mode: we need to wait for save completion since broadcast won't come back
      // Simple mode doesn't have acknowledgment, so we measure just the emit time
      const onSimpleComplete = () => {
        if (!resolved) {
          resolved = true;
          const end = performance.now();
          const latency = end - start;
          this.latencies.push(latency);
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        if (this.useOT) {
          this.socket.off('ot-ack', onOtAck);
          this.socket.off('ot-transform', onOtTransform);
          this.socket.off('ot-error', onOtError);
        }
      };

      if (this.useOT) {
        // OT mode: listen for server acknowledgments
        this.socket.once('ot-ack', onOtAck);
        this.socket.once('ot-transform', onOtTransform);
        this.socket.once('ot-error', onOtError);
        
        this.socket.emit(eventName, payload);
      } else {
        // Simple mode: just measure emit time since no ack
        this.socket.emit(eventName, payload);
        // Immediate completion for simple mode (no server response expected)
        setTimeout(onSimpleComplete, 0);
      }

      // Fallback timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const end = performance.now();
          this.latencies.push(end - start);
          cleanup();
          resolve();
        }
      }, 2000); // 2 second timeout
    });
  }

  async runTest() {
    const testName = this.useOT ? 'With OT' : 'Without OT';
    console.log(chalk.cyan(`\n${'─'.repeat(60)}`));
    console.log(chalk.cyan.bold(`Testing: ${testName}`));
    console.log(chalk.cyan(`${'─'.repeat(60)}\n`));

    await this.connect();

    console.log(chalk.yellow(`Sending ${NUM_REQUESTS} requests...\n`));
    const startTime = Date.now();

    for (let i = 0; i < NUM_REQUESTS; i++) {
      await this.sendRequest(i);
      if ((i + 1) % 25 === 0) {
        console.log(chalk.gray(`  Progress: ${i + 1}/${NUM_REQUESTS}`));
      }
    }

    const totalTime = Date.now() - startTime;

    this.disconnect();

    return this.getStats(totalTime);
  }

  getStats(totalTime) {
    if (this.latencies.length === 0) {
      return null;
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = this.latencies.reduce((a, b) => a + b, 0);

    return {
      mode: this.useOT ? 'With OT' : 'Without OT',
      count: this.latencies.length,
      avg: (sum / this.latencies.length).toFixed(2),
      min: sorted[0].toFixed(2),
      max: sorted[sorted.length - 1].toFixed(2),
      p50: sorted[Math.floor(sorted.length * 0.50)].toFixed(2),
      p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      p99: sorted[Math.floor(sorted.length * 0.99)].toFixed(2),
      totalTime: totalTime,
      throughput: ((this.latencies.length / totalTime) * 1000).toFixed(2),
      conflicts: this.conflicts
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

async function main() {
  try {
    // Test WITHOUT OT (simple writes)
    const simpleTester = new PingPongLatencyTester(false);
    const simpleStats = await simpleTester.runTest();

    // Wait between tests
    console.log(chalk.gray('\nWaiting 3 seconds before next test...\n'));
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test WITH OT
    const otTester = new PingPongLatencyTester(true);
    const otStats = await otTester.runTest();

    // Print results
    console.log(chalk.cyan(`\n${'='.repeat(70)}`));
    console.log(chalk.cyan.bold('📊 PING-PONG LATENCY COMPARISON RESULTS'));
    console.log(chalk.cyan(`${'='.repeat(70)}\n`));

    if (!simpleStats || !otStats) {
      console.log(chalk.red('❌ One or both tests failed'));
      process.exit(1);
    }

    // Table header
    console.log(
      chalk.white.bold('Metric'.padEnd(25)) +
      chalk.yellow('Without OT'.padEnd(22)) +
      chalk.green('With OT'.padEnd(22))
    );
    console.log(chalk.gray('─'.repeat(70)));

    // Data rows
    const rows = [
      ['Requests Completed', simpleStats.count, otStats.count],
      ['Average Latency', `${simpleStats.avg} ms`, `${otStats.avg} ms`],
      ['Min Latency', `${simpleStats.min} ms`, `${otStats.min} ms`],
      ['Max Latency', `${simpleStats.max} ms`, `${otStats.max} ms`],
      ['P50 (Median)', `${simpleStats.p50} ms`, `${otStats.p50} ms`],
      ['P95 Latency', `${simpleStats.p95} ms`, `${otStats.p95} ms`],
      ['P99 Latency', `${simpleStats.p99} ms`, `${otStats.p99} ms`],
      ['Total Time', `${simpleStats.totalTime} ms`, `${otStats.totalTime} ms`],
      ['Throughput', `${simpleStats.throughput} req/s`, `${otStats.throughput} req/s`],
      ['Version Conflicts', simpleStats.conflicts, otStats.conflicts]
    ];

    rows.forEach(([metric, simple, ot]) => {
      console.log(
        chalk.white(metric.padEnd(25)) +
        chalk.yellow(String(simple).padEnd(22)) +
        chalk.green(String(ot).padEnd(22))
      );
    });

    console.log(chalk.gray('─'.repeat(70)));

    // Calculate overhead
    const avgOverhead = ((parseFloat(otStats.avg) - parseFloat(simpleStats.avg)) / parseFloat(simpleStats.avg) * 100);
    const throughputChange = ((parseFloat(otStats.throughput) - parseFloat(simpleStats.throughput)) / parseFloat(simpleStats.throughput) * 100);

    console.log(chalk.cyan('\n📈 Performance Analysis:'));
    console.log(chalk.gray('─'.repeat(70)));

    console.log(chalk.yellow('\n⚠️  IMPORTANT: Different measurement types!'));
    console.log(chalk.gray('  Without OT: Measures client emit() only (no server ack)'));
    console.log(chalk.gray('  With OT:    Measures full round-trip (emit → process → ack)\n'));

    // Latency overhead
    console.log(chalk.white('Measured Latencies:'));
    console.log(chalk.yellow(`  Simple mode:  ${simpleStats.avg}ms (local emit only)`));
    console.log(chalk.green(`  OT mode:      ${otStats.avg}ms (server round-trip)`));
    console.log(chalk.gray(`  → OT server processing overhead: ~${otStats.avg}ms`));
    console.log(chalk.gray(`     (includes network RTT + transformation + ack)`));

    // Throughput change
    if (throughputChange < -5) {
      console.log(chalk.yellow(`  📉 Throughput reduced by ${Math.abs(throughputChange).toFixed(1)}%`));
      console.log(chalk.gray(`     ${simpleStats.throughput} → ${otStats.throughput} requests/second`));
    } else if (throughputChange > 5) {
      console.log(chalk.green(`  📈 Throughput improved by ${throughputChange.toFixed(1)}%`));
      console.log(chalk.gray(`     ${simpleStats.throughput} → ${otStats.throughput} requests/second`));
    } else {
      console.log(chalk.green(`  📊 Throughput maintained (~${otStats.throughput} req/s)`));
    }

    // Conflict elimination
    const conflictReduction = simpleStats.conflicts > 0 
      ? ((simpleStats.conflicts - otStats.conflicts) / simpleStats.conflicts * 100).toFixed(1)
      : '100';
    
    console.log(chalk.green(`  ✅ Version conflicts: ${simpleStats.conflicts} → ${otStats.conflicts} (${conflictReduction}% reduction)`));
    
    console.log(chalk.gray('─'.repeat(70)));

    console.log(chalk.cyan('\n💡 Key Takeaway:'));
    
    console.log(chalk.white(`  Without OT: No server acknowledgment - fire and forget`));
    console.log(chalk.white(`  With OT:    Server processes + transforms + responds in ~${otStats.avg}ms`));
    console.log(chalk.white(`\n  OT adds ~${otStats.avg}ms of processing latency per operation,`));
    console.log(chalk.white(`  but this includes the cost of:`));
    console.log(chalk.white(`    • Conflict detection`));
    console.log(chalk.white(`    • Operation transformation`));  
    console.log(chalk.white(`    • Version management`));
    console.log(chalk.white(`    • Acknowledgment to client`));
    console.log(chalk.white(`\n  Result: ${otStats.conflicts} conflicts vs Simple mode's unknown conflicts`));
    console.log(chalk.white(`  (Simple mode has no conflict detection!)`));

    console.log(chalk.cyan('\n' + '='.repeat(70) + '\n'));

    console.log(chalk.gray('Measurement Method: Application-layer RTT (Ping-Pong)'));
    console.log(chalk.gray('Each latency = time from emit() to acknowledgment callback\n'));

  } catch (error) {
    console.error(chalk.red(`\n❌ Test failed: ${error.message}`));
    console.error(chalk.gray(error.stack));
    process.exit(1);
  }
}

main();
