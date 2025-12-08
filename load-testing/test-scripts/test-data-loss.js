#!/usr/bin/env node

const io = require('socket.io-client');
const chalk = require('chalk');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:12345';
const NUM_TEST_ROUNDS = parseInt(process.env.NUM_TEST_ROUNDS || '50');
const NUM_CONCURRENT_USERS = parseInt(process.env.NUM_CONCURRENT_USERS || '3');
const CHARS_PER_USER = parseInt(process.env.CHARS_PER_USER || '10');

// Helper to generate unique character sequences
function generateUserSequence(userId, length) {
  const bases = ['A', '1', 'X', 'α', '①', '★'];
  const base = bases[userId % bases.length];
  return Array.from({ length }, (_, i) => `${base}${i + 1}`).join('');
}

// Wait for all changes to settle
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class DataLossTestClient {
  constructor(userId, documentId, useOT = false) {
    this.userId = userId;
    this.documentId = documentId;
    this.useOT = useOT;
    this.socket = null;
    this.version = 0;
    this.receivedChanges = [];
    this.ownSequence = generateUserSequence(userId, CHARS_PER_USER);
    this.connected = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(SERVER_URL, {
        auth: {
          userId: `data-loss-test-${this.userId}`,
          username: `User${this.userId}`
        },
        transports: ['websocket']
      });

      this.socket.on('connect', () => {
        this.connected = true;
        resolve();
      });

      this.socket.on('connect_error', reject);
      this.socket.on('disconnect', () => {
        this.connected = false;
      });

      // Track received changes
      if (this.useOT) {
        this.socket.on('receive-changes-ot', ({ delta, version }) => {
          this.receivedChanges.push(delta);
          this.version = version;
        });

        this.socket.on('ot-ack', ({ version }) => {
          this.version = version;
        });

        this.socket.on('ot-transform', ({ transformedDelta, version }) => {
          this.version = version;
        });
      } else {
        this.socket.on('receive-changes', (delta) => {
          this.receivedChanges.push(delta);
        });
      }
    });
  }

  async loadDocument() {
    return new Promise((resolve) => {
      this.socket.emit('get-document', {
        documentId: this.documentId,
        documentName: `DataLoss-Test-${this.documentId}`
      });

      this.socket.once('load-document', ({ data, version }) => {
        this.version = version || 0;
        resolve(data);
      });
    });
  }

  async typeSequence(position = 0) {
    if (this.useOT) {
      // Send entire sequence as one operation
      const delta = {
        ops: [
          { retain: position },
          { insert: this.ownSequence }
        ]
      };

      this.socket.emit('send-changes-ot', {
        delta,
        version: this.version
      });
    } else {
      // Send without OT (Last-Write-Wins behavior)
      const delta = {
        ops: [
          { retain: position },
          { insert: this.ownSequence }
        ]
      };

      this.socket.emit('send-changes', delta);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Analyze document content to measure data loss
function analyzeDataLoss(documentData, userSequences) {
  // Extract text from Quill delta format
  let text = '';
  if (documentData && documentData.ops) {
    documentData.ops.forEach(op => {
      if (op.insert && typeof op.insert === 'string') {
        text += op.insert;
      }
    });
  }

  const results = {
    finalText: text,
    totalExpectedChars: userSequences.reduce((sum, seq) => sum + seq.length, 0),
    actualChars: text.length,
    userSequences: {},
    totalFound: 0,
    totalLost: 0,
    dataLossPercent: 0,
    isComplete: false
  };

  // Check each user's sequence
  userSequences.forEach((sequence, userId) => {
    let foundChars = 0;
    
    // Count how many characters from this user's sequence appear in the final text
    for (let char of sequence) {
      if (text.includes(char)) {
        foundChars++;
      }
    }

    const lostChars = sequence.length - foundChars;
    
    results.userSequences[userId] = {
      expected: sequence,
      expectedLength: sequence.length,
      foundChars,
      lostChars,
      lossPercent: (lostChars / sequence.length * 100).toFixed(2)
    };

    results.totalFound += foundChars;
    results.totalLost += lostChars;
  });

  results.dataLossPercent = (results.totalLost / results.totalExpectedChars * 100).toFixed(2);
  results.isComplete = results.totalLost === 0;

  return results;
}

// Run a single concurrent editing test
async function runSingleTest(testId, useOT) {
  const documentId = `data-loss-test-${testId}-${Date.now()}`;
  const clients = [];
  const userSequences = [];

  // Create clients
  for (let i = 0; i < NUM_CONCURRENT_USERS; i++) {
    const client = new DataLossTestClient(i, documentId, useOT);
    clients.push(client);
    userSequences.push(client.ownSequence);
  }

  try {
    // Connect all clients
    await Promise.all(clients.map(c => c.connect()));

    // Load document for all clients
    await Promise.all(clients.map(c => c.loadDocument()));

    // Small delay to ensure all clients are ready
    await sleep(100);

    // All users type at the EXACT same time at position 0
    await Promise.all(clients.map(c => c.typeSequence(0)));

    // Wait for changes to propagate and settle
    await sleep(useOT ? 1000 : 500);

    // Fetch final document state
    const finalDoc = await new Promise((resolve) => {
      const verifyClient = clients[0];
      verifyClient.socket.emit('get-document', {
        documentId,
        documentName: `DataLoss-Test-${documentId}`
      });

      verifyClient.socket.once('load-document', ({ data }) => {
        resolve(data);
      });
    });

    // Analyze data loss
    const analysis = analyzeDataLoss(finalDoc, userSequences);

    return {
      testId,
      success: true,
      ...analysis
    };
  } catch (error) {
    return {
      testId,
      success: false,
      error: error.message,
      totalExpectedChars: userSequences.reduce((sum, seq) => sum + seq.length, 0),
      actualChars: 0,
      totalLost: userSequences.reduce((sum, seq) => sum + seq.length, 0),
      dataLossPercent: 100
    };
  } finally {
    // Cleanup
    clients.forEach(c => c.disconnect());
  }
}

// Run multiple test rounds
async function runTestSuite(useOT) {
  console.log(chalk.bold.cyan(`\n${'='.repeat(80)}`));
  console.log(chalk.bold.cyan(`Running ${useOT ? 'WITH OT' : 'WITHOUT OT (Last-Write-Wins)'} - Data Loss Test`));
  console.log(chalk.bold.cyan('='.repeat(80)));
  console.log(chalk.white(`Configuration:`));
  console.log(chalk.white(`  - Concurrent users per test: ${NUM_CONCURRENT_USERS}`));
  console.log(chalk.white(`  - Characters per user: ${CHARS_PER_USER}`));
  console.log(chalk.white(`  - Total expected chars per test: ${NUM_CONCURRENT_USERS * CHARS_PER_USER}`));
  console.log(chalk.white(`  - Number of test rounds: ${NUM_TEST_ROUNDS}\n`));

  const results = [];
  let completedTests = 0;

  for (let i = 0; i < NUM_TEST_ROUNDS; i++) {
    process.stdout.write(chalk.yellow(`\r⚡ Running test ${i + 1}/${NUM_TEST_ROUNDS}...`));
    
    const result = await runSingleTest(i, useOT);
    results.push(result);

    if (result.success) {
      completedTests++;
    }

    // Small delay between tests
    await sleep(200);
  }

  console.log(chalk.green(`\n✓ Completed ${completedTests}/${NUM_TEST_ROUNDS} tests\n`));

  // Aggregate statistics
  const validResults = results.filter(r => r.success);
  
  if (validResults.length === 0) {
    return {
      scenario: useOT ? 'WITH OT' : 'WITHOUT OT',
      totalTests: NUM_TEST_ROUNDS,
      completedTests: 0,
      avgDataLoss: 100,
      minDataLoss: 100,
      maxDataLoss: 100,
      zeroLossTests: 0,
      completeLossTests: NUM_TEST_ROUNDS
    };
  }

  const dataLossValues = validResults.map(r => parseFloat(r.dataLossPercent));
  const zeroLossTests = validResults.filter(r => r.isComplete).length;
  const completeLossTests = validResults.filter(r => parseFloat(r.dataLossPercent) === 100).length;

  return {
    scenario: useOT ? 'WITH OT' : 'WITHOUT OT',
    totalTests: NUM_TEST_ROUNDS,
    completedTests: validResults.length,
    avgDataLoss: (dataLossValues.reduce((a, b) => a + b, 0) / dataLossValues.length).toFixed(2),
    minDataLoss: Math.min(...dataLossValues).toFixed(2),
    maxDataLoss: Math.max(...dataLossValues).toFixed(2),
    zeroLossTests,
    zeroLossPercent: ((zeroLossTests / validResults.length) * 100).toFixed(2),
    completeLossTests,
    completeLossPercent: ((completeLossTests / validResults.length) * 100).toFixed(2),
    partialLossTests: validResults.length - zeroLossTests - completeLossTests,
    detailedResults: validResults.slice(0, 5) // Keep first 5 for inspection
  };
}

// Print comparison results
function printComparison(withoutOT, withOT) {
  console.log(chalk.bold.green('\n\n' + '='.repeat(80)));
  console.log(chalk.bold.green('📊 DATA LOSS ANALYSIS - THE CRITICAL METRIC'));
  console.log(chalk.bold.green('='.repeat(80) + '\n'));

  console.log(chalk.bold.white('Test Scenario:'));
  console.log(chalk.white(`  ${NUM_CONCURRENT_USERS} users simultaneously type ${CHARS_PER_USER} characters each into the same position`));
  console.log(chalk.white(`  Expected: All ${NUM_CONCURRENT_USERS * CHARS_PER_USER} characters should appear in final document`));
  console.log(chalk.white(`  Tested: ${NUM_TEST_ROUNDS} concurrent editing scenarios\n`));

  // Main comparison table
  console.log(chalk.cyan('┌─────────────────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│') + chalk.bold(` ${'METRIC'.padEnd(40)} | ${'Without OT'.padEnd(15)} | ${'With OT'.padEnd(15)} `) + chalk.cyan('│'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────────────────────────────┤'));

  const metrics = [
    ['Completed Tests', withoutOT.completedTests, withOT.completedTests],
    ['', '', ''],
    ['📉 AVERAGE DATA LOSS', `${withoutOT.avgDataLoss}%`, `${withOT.avgDataLoss}%`],
    ['   Minimum Data Loss', `${withoutOT.minDataLoss}%`, `${withOT.minDataLoss}%`],
    ['   Maximum Data Loss', `${withoutOT.maxDataLoss}%`, `${withOT.maxDataLoss}%`],
    ['', '', ''],
    ['✓ Zero Data Loss Tests', `${withoutOT.zeroLossTests} (${withoutOT.zeroLossPercent}%)`, `${withOT.zeroLossTests} (${withOT.zeroLossPercent}%)`],
    ['⚠ Partial Data Loss Tests', withoutOT.partialLossTests, withOT.partialLossTests],
    ['✗ Complete Data Loss Tests', `${withoutOT.completeLossTests} (${withoutOT.completeLossPercent}%)`, `${withOT.completeLossTests} (${withOT.completeLossPercent}%)`]
  ];

  metrics.forEach(([name, val1, val2]) => {
    if (name === '') {
      console.log(chalk.cyan('├─────────────────────────────────────────────────────────────────────────────┤'));
      return;
    }

    const isDataLoss = name.includes('DATA LOSS');
    const isZeroLoss = name.includes('Zero');
    const isCompleteLoss = name.includes('Complete');

    let val1Color = val1;
    let val2Color = val2;

    if (isDataLoss) {
      // Lower is better for data loss
      const loss1 = parseFloat(withoutOT.avgDataLoss);
      const loss2 = parseFloat(withOT.avgDataLoss);
      val1Color = loss1 > loss2 ? chalk.red(val1) : chalk.green(val1);
      val2Color = loss2 < loss1 ? chalk.green(val2) : chalk.red(val2);
    } else if (isZeroLoss) {
      // Higher is better for zero loss
      val1Color = withoutOT.zeroLossTests > withOT.zeroLossTests ? chalk.green(val1) : val1;
      val2Color = withOT.zeroLossTests > withoutOT.zeroLossTests ? chalk.green(val2) : val2;
    } else if (isCompleteLoss) {
      // Lower is better for complete loss
      val1Color = withoutOT.completeLossTests > withOT.completeLossTests ? chalk.red(val1) : val1;
      val2Color = withOT.completeLossTests < withoutOT.completeLossTests ? chalk.green(val2) : val2;
    }

    const displayName = name.startsWith(' ') ? name : chalk.bold(name);
    console.log(
      chalk.cyan('│') +
      ` ${displayName.padEnd(49)} | ${val1Color.toString().padEnd(24)} | ${val2Color.toString().padEnd(24)} ` +
      chalk.cyan('│')
    );
  });

  console.log(chalk.cyan('└─────────────────────────────────────────────────────────────────────────────┘\n'));

  // Calculate the "Win" statistics
  const dataLossReduction = parseFloat(withoutOT.avgDataLoss) - parseFloat(withOT.avgDataLoss);
  const dataLossReductionPercent = (dataLossReduction / parseFloat(withoutOT.avgDataLoss) * 100).toFixed(2);
  const reliabilityImprovement = parseFloat(withOT.zeroLossPercent) - parseFloat(withoutOT.zeroLossPercent);

  console.log(chalk.bold.white('🎯 THE "WIN" STATISTICS:\n'));
  console.log(chalk.cyan('┌─────────────────────────────────────────────────────────────────────────────┐'));
  
  if (dataLossReduction > 0) {
    console.log(chalk.cyan('│') + chalk.bold.green(` ✓ REDUCED DATA LOSS FROM ${withoutOT.avgDataLoss}% TO ${withOT.avgDataLoss}%`.padEnd(78)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.green(`   (${dataLossReductionPercent}% reduction in data loss)`.padEnd(78)) + chalk.cyan('│'));
  } else {
    console.log(chalk.cyan('│') + chalk.yellow(` ○ Data loss: ${withoutOT.avgDataLoss}% → ${withOT.avgDataLoss}%`.padEnd(78)) + chalk.cyan('│'));
  }

  console.log(chalk.cyan('│') + ''.padEnd(78) + chalk.cyan('│'));

  if (reliabilityImprovement > 0) {
    console.log(chalk.cyan('│') + chalk.bold.green(` ✓ IMPROVED RELIABILITY FROM ${withoutOT.zeroLossPercent}% TO ${withOT.zeroLossPercent}%`.padEnd(78)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.green(`   (${reliabilityImprovement.toFixed(2)} percentage point improvement in zero-loss tests)`.padEnd(78)) + chalk.cyan('│'));
  }

  console.log(chalk.cyan('│') + ''.padEnd(78) + chalk.cyan('│'));

  // The money shot
  const zeroLossWithOT = parseFloat(withOT.zeroLossPercent) === 100;
  const highLossWithoutOT = parseFloat(withoutOT.avgDataLoss) > 30;

  if (zeroLossWithOT && highLossWithoutOT) {
    console.log(chalk.cyan('│') + chalk.bold.green(` 🏆 PERFECT CONVERGENCE: 100% of tests preserved all user data with OT!`.padEnd(78)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.green(`    Without OT: Lost ${withoutOT.avgDataLoss}% of user input on average`.padEnd(78)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.green(`    With OT: 0% data loss - every character preserved!`.padEnd(78)) + chalk.cyan('│'));
  } else if (parseFloat(withOT.avgDataLoss) < parseFloat(withoutOT.avgDataLoss)) {
    console.log(chalk.cyan('│') + chalk.green(` ✓ Operational Transformation significantly reduced data loss`.padEnd(78)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.green(`   Before: ${withoutOT.avgDataLoss}% average loss | After: ${withOT.avgDataLoss}% average loss`.padEnd(78)) + chalk.cyan('│'));
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────────────────────────────┘\n'));

  // Business impact
  console.log(chalk.bold.white('💼 BUSINESS IMPACT:\n'));
  
  const charsLostWithoutOT = (NUM_TEST_ROUNDS * NUM_CONCURRENT_USERS * CHARS_PER_USER * parseFloat(withoutOT.avgDataLoss) / 100).toFixed(0);
  const charsLostWithOT = (NUM_TEST_ROUNDS * NUM_CONCURRENT_USERS * CHARS_PER_USER * parseFloat(withOT.avgDataLoss) / 100).toFixed(0);
  const charsSaved = charsLostWithoutOT - charsLostWithOT;

  console.log(chalk.white(`  In ${NUM_TEST_ROUNDS} concurrent editing scenarios:`));
  console.log(chalk.red(`  ✗ Without OT: Lost ${charsLostWithoutOT} characters (${withoutOT.avgDataLoss}% of user input)`));
  console.log(chalk.green(`  ✓ With OT: Lost ${charsLostWithOT} characters (${withOT.avgDataLoss}% of user input)`));
  console.log(chalk.bold.green(`  → Saved ${charsSaved} characters from being lost!\n`));

  // Sample results
  if (withoutOT.detailedResults && withoutOT.detailedResults.length > 0) {
    console.log(chalk.bold.white('📝 Sample Test Results (first 3):'));
    
    for (let i = 0; i < Math.min(3, withoutOT.detailedResults.length); i++) {
      const without = withoutOT.detailedResults[i];
      const withOp = withOT.detailedResults[i];
      
      console.log(chalk.cyan(`\n  Test ${i + 1}:`));
      console.log(chalk.white(`    Without OT: "${without.finalText}" (${without.actualChars}/${without.totalExpectedChars} chars) - ${without.dataLossPercent}% loss`));
      console.log(chalk.white(`    With OT:    "${withOp.finalText}" (${withOp.actualChars}/${withOp.totalExpectedChars} chars) - ${withOp.dataLossPercent}% loss`));
    }
    console.log();
  }
}

// Main execution
async function main() {
  console.log(chalk.bold.magenta('\n' + '='.repeat(80)));
  console.log(chalk.bold.magenta('🎯 DATA LOSS EVALUATION - THE SINGLE MOST IMPORTANT METRIC'));
  console.log(chalk.bold.magenta('='.repeat(80)));
  console.log(chalk.white('\nThis test measures the core value proposition of Operational Transformation:'));
  console.log(chalk.white('→ When multiple users edit simultaneously, is ALL user input preserved?\n'));
  console.log(chalk.yellow('Scenario: "I typed 5 characters. Did 5 characters end up in the document?"\n'));

  try {
    // Test WITHOUT OT (Last-Write-Wins)
    console.log(chalk.bold.red('\n📍 Phase 1: Testing WITHOUT OT (Last-Write-Wins behavior)'));
    const withoutOT = await runTestSuite(false);

    // Wait between test suites
    await sleep(2000);

    // Test WITH OT
    console.log(chalk.bold.green('\n📍 Phase 2: Testing WITH OT (Operational Transformation)'));
    const withOT = await runTestSuite(true);

    // Print comparison
    printComparison(withoutOT, withOT);

    // Save results
    const fs = require('fs');
    const results = {
      timestamp: new Date().toISOString(),
      configuration: {
        numConcurrentUsers: NUM_CONCURRENT_USERS,
        charsPerUser: CHARS_PER_USER,
        totalExpectedCharsPerTest: NUM_CONCURRENT_USERS * CHARS_PER_USER,
        numTestRounds: NUM_TEST_ROUNDS
      },
      withoutOT,
      withOT,
      improvement: {
        dataLossReduction: (parseFloat(withoutOT.avgDataLoss) - parseFloat(withOT.avgDataLoss)).toFixed(2),
        dataLossReductionPercent: ((parseFloat(withoutOT.avgDataLoss) - parseFloat(withOT.avgDataLoss)) / parseFloat(withoutOT.avgDataLoss) * 100).toFixed(2),
        reliabilityImprovement: (parseFloat(withOT.zeroLossPercent) - parseFloat(withoutOT.zeroLossPercent)).toFixed(2)
      }
    };

    const reportsDir = './reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filename = `${reportsDir}/data-loss-analysis-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(chalk.green(`✓ Results saved to ${filename}\n`));

    // Exit with appropriate code
    const success = parseFloat(withOT.avgDataLoss) < parseFloat(withoutOT.avgDataLoss);
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('\n❌ Test failed:'), error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
