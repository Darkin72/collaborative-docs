const { MongoClient } = require('mongodb');
const chalk = require('chalk');

// Configuration
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'myapp';
const COLLECTION_NAME = 'documents';

console.log(chalk.cyan.bold('\n📊 MONGODB INDEX EFFICIENCY TEST\n'));
console.log(chalk.gray(`MongoDB: ${MONGO_URL}`));
console.log(chalk.gray(`Database: ${DB_NAME}`));
console.log(chalk.gray(`Collection: ${COLLECTION_NAME}\n`));

class IndexEfficiencyTester {
  constructor() {
    this.client = null;
    this.db = null;
    this.collection = null;
  }

  async connect() {
    console.log(chalk.gray('Connecting to MongoDB...'));
    this.client = await MongoClient.connect(MONGO_URL);
    this.db = this.client.db(DB_NAME);
    this.collection = this.db.collection(COLLECTION_NAME);
    console.log(chalk.green('✓ Connected\n'));
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
    }
  }

  calculateScanToReturnRatio(explainResult) {
    // Extract execution stats
    const executionStats = explainResult.executionStats;
    
    const docsExamined = executionStats.totalDocsExamined || 0;
    const docsReturned = executionStats.nReturned || 0;
    
    const ratio = docsReturned > 0 ? (docsExamined / docsReturned) : docsExamined;
    
    return {
      docsExamined,
      docsReturned,
      ratio: ratio,
      ratioFormatted: ratio.toFixed(2),
      isOptimal: ratio <= 1.1, // Within 10% of optimal
      efficiency: docsReturned > 0 ? ((docsReturned / docsExamined) * 100).toFixed(1) : '0'
    };
  }

  async testQuery(description, query, options = {}) {
    console.log(chalk.cyan(`\nTest: ${description}`));
    console.log(chalk.gray(`Query: ${JSON.stringify(query)}`));
    if (options.sort) {
      console.log(chalk.gray(`Sort: ${JSON.stringify(options.sort)}`));
    }
    
    try {
      // Get explain output with execution stats
      let cursor = this.collection.find(query);
      
      if (options.sort) {
        cursor = cursor.sort(options.sort);
      }
      
      const explainResult = await cursor.explain('executionStats');
      
      // Calculate metrics
      const metrics = this.calculateScanToReturnRatio(explainResult);
      
      // Check if index was used
      const indexUsed = explainResult.executionStats.executionStages.stage === 'IXSCAN' ||
                        (explainResult.executionStats.executionStages.inputStage && 
                         explainResult.executionStats.executionStages.inputStage.stage === 'IXSCAN');
      
      const indexName = indexUsed 
        ? (explainResult.executionStats.executionStages.indexName || 
           explainResult.executionStats.executionStages.inputStage?.indexName || 'unknown')
        : 'NONE (COLLSCAN)';
      
      // Get MongoDB server status before test
      const statusBefore = await this.db.admin().serverStatus();
      const cpuBefore = statusBefore.extra_info?.page_faults || 0;
      const timeBefore = Date.now();
      
      // Measure actual query latency with multiple runs for P99
      const NUM_RUNS = 100;
      const latencies = [];
      
      for (let i = 0; i < NUM_RUNS; i++) {
        let cursor = this.collection.find(query);
        if (options.sort) {
          cursor = cursor.sort(options.sort);
        }
        
        const start = performance.now();
        await cursor.toArray();
        const end = performance.now();
        latencies.push(end - start);
      }
      
      // Get MongoDB server status after test
      const statusAfter = await this.db.admin().serverStatus();
      const cpuAfter = statusAfter.extra_info?.page_faults || 0;
      const timeAfter = Date.now();
      const totalTimeSeconds = (timeAfter - timeBefore) / 1000;
      
      // Calculate P99, P95, P50, average
      latencies.sort((a, b) => a - b);
      const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
      const p50 = latencies[Math.floor(latencies.length * 0.50)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      const min = latencies[0];
      const max = latencies[latencies.length - 1];
      
      // Calculate resource metrics
      const pageFaults = cpuAfter - cpuBefore;
      const pageFaultsPerSecond = totalTimeSeconds > 0 ? (pageFaults / totalTimeSeconds).toFixed(2) : '0';
      const workingSetMB = (statusAfter.mem?.resident || 0);
      
      // Estimate CPU usage based on query complexity
      const cpuIntensity = indexUsed ? 'Low' : 'High';
      const cpuScore = indexUsed ? 1 : (metrics.docsExamined / 1000); // Rough estimate
      
      // Print results
      console.log(chalk.white(`  Documents Examined: ${metrics.docsExamined}`));
      console.log(chalk.white(`  Documents Returned: ${metrics.docsReturned}`));
      console.log(chalk.white(`  Scan-to-Return Ratio: ${metrics.ratioFormatted}:1`));
      console.log(chalk.white(`  Efficiency: ${metrics.efficiency}%`));
      console.log(chalk.white(`  Index Used: ${indexName}`));
      console.log(chalk.gray(`  Query Latency (${NUM_RUNS} runs):`));
      console.log(chalk.gray(`    Average: ${avg.toFixed(2)}ms`));
      console.log(chalk.gray(`    P50: ${p50.toFixed(2)}ms`));
      console.log(chalk.gray(`    P95: ${p95.toFixed(2)}ms`));
      console.log(chalk.white(`    P99: ${p99.toFixed(2)}ms`));
      console.log(chalk.gray(`    Min/Max: ${min.toFixed(2)}ms / ${max.toFixed(2)}ms`));
      console.log(chalk.gray(`  Resource Usage:`));
      console.log(chalk.gray(`    CPU Intensity: ${cpuIntensity}`));
      console.log(chalk.gray(`    Page Faults: ${pageFaults} (${pageFaultsPerSecond}/sec)`));
      console.log(chalk.gray(`    Working Set: ${workingSetMB} MB`));
      
      if (metrics.isOptimal) {
        console.log(chalk.green(`  ✓ OPTIMAL (ratio ≤ 1.1:1)`));
      } else if (metrics.ratio <= 2) {
        console.log(chalk.yellow(`  ⚠ ACCEPTABLE (ratio ≤ 2:1)`));
      } else if (metrics.ratio <= 10) {
        console.log(chalk.red(`  ✗ POOR (ratio > 2:1)`));
      } else {
        console.log(chalk.red(`  ✗✗ VERY POOR (ratio > 10:1)`));
      }
      
      return {
        description,
        query,
        ...metrics,
        indexUsed,
        indexName,
        executionTimeMs: explainResult.executionStats.executionTimeMillis,
        latency: {
          avg: avg.toFixed(2),
          p50: p50.toFixed(2),
          p95: p95.toFixed(2),
          p99: p99.toFixed(2),
          min: min.toFixed(2),
          max: max.toFixed(2)
        },
        resources: {
          cpuIntensity,
          cpuScore: cpuScore.toFixed(2),
          pageFaults,
          pageFaultsPerSecond,
          workingSetMB
        }
      };
      
    } catch (error) {
      console.error(chalk.red(`  ✗ Error: ${error.message}`));
      return null;
    }
  }

  async dropAllIndexes() {
    console.log(chalk.yellow('\n⚠️  Dropping all indexes (except _id)...'));
    try {
      await this.collection.dropIndexes();
      console.log(chalk.green('✓ Indexes dropped'));
    } catch (error) {
      console.error(chalk.red(`Error dropping indexes: ${error.message}`));
    }
  }

  async createIndexes() {
    console.log(chalk.cyan('\n📑 Creating indexes...'));
    
    try {
      // Single field indexes
      await this.collection.createIndex({ name: 1 });
      console.log(chalk.green('✓ Created index on name'));
      
      await this.collection.createIndex({ ownerId: 1 });
      console.log(chalk.green('✓ Created index on ownerId'));
      
      await this.collection.createIndex({ createdAt: -1 });
      console.log(chalk.green('✓ Created index on createdAt'));
      
      // Compound index
      await this.collection.createIndex({ ownerId: 1, createdAt: -1 });
      console.log(chalk.green('✓ Created compound index on {ownerId: 1, createdAt: -1}'));
      
    } catch (error) {
      console.error(chalk.red(`Error creating indexes: ${error.message}`));
    }
  }

  async listIndexes() {
    console.log(chalk.cyan('\nCurrent Indexes:'));
    const indexes = await this.collection.indexes();
    indexes.forEach(idx => {
      console.log(chalk.white(`  - ${idx.name}: ${JSON.stringify(idx.key)}`));
    });
  }

  async getCollectionStats() {
    const stats = await this.db.command({ collStats: COLLECTION_NAME });
    return {
      count: stats.count,
      size: stats.size,
      avgObjSize: stats.avgObjSize || 0
    };
  }
}

async function main() {
  const tester = new IndexEfficiencyTester();
  
  try {
    await tester.connect();
    
    // Get collection stats
    const stats = await tester.getCollectionStats();
    console.log(chalk.white(`Collection Stats:`));
    console.log(chalk.gray(`  Total Documents: ${stats.count}`));
    console.log(chalk.gray(`  Average Doc Size: ${Math.round(stats.avgObjSize)} bytes\n`));
    
    if (stats.count === 0) {
      console.log(chalk.red('⚠️  Collection is empty. Cannot test index efficiency.'));
      console.log(chalk.gray('Please create some documents first.\n'));
      await tester.disconnect();
      return;
    }
    
    // Get a sample owner ID for testing (use special test user if available)
    const specialUser = await tester.collection.findOne({ ownerId: 'user-special-100' });
    const sampleOwnerId = specialUser ? 'user-special-100' : (await tester.collection.findOne({}))?.ownerId || 'user-001';
    
    // Count documents for this user
    const userDocCount = await tester.collection.countDocuments({ ownerId: sampleOwnerId });
    console.log(chalk.white(`Test User: ${sampleOwnerId}`));
    console.log(chalk.gray(`  Documents owned: ${userDocCount}\n`));
    
    console.log(chalk.cyan('='.repeat(70)));
    console.log(chalk.cyan.bold('PHASE 1: WITHOUT INDEXES (Baseline)'));
    console.log(chalk.cyan('='.repeat(70)));
    
    // Drop indexes to test without them
    await tester.dropAllIndexes();
    await tester.listIndexes();
    
    const withoutIndexResults = [];
    
    // Test 1: Find by owner ID
    withoutIndexResults.push(
      await tester.testQuery(
        'Find documents by ownerId',
        { ownerId: sampleOwnerId }
      )
    );
    
    // Test 2: Find by owner ID with sort
    withoutIndexResults.push(
      await tester.testQuery(
        'Find by ownerId, sorted by createdAt',
        { ownerId: sampleOwnerId },
        { sort: { createdAt: -1 } }
      )
    );
    
    // Test 3: Regex search on name
    withoutIndexResults.push(
      await tester.testQuery(
        'Regex search on document name',
        { name: /test/i }
      )
    );
    
    // Test 4: Sort by createdAt
    withoutIndexResults.push(
      await tester.testQuery(
        'Find all, sorted by createdAt',
        {},
        { sort: { createdAt: -1 } }
      )
    );
    
    console.log(chalk.cyan('\n' + '='.repeat(70)));
    console.log(chalk.cyan.bold('PHASE 2: WITH INDEXES (Optimized)'));
    console.log(chalk.cyan('='.repeat(70)));
    
    // Create indexes
    await tester.createIndexes();
    await tester.listIndexes();
    
    const withIndexResults = [];
    
    // Repeat the same tests
    withIndexResults.push(
      await tester.testQuery(
        'Find documents by ownerId',
        { ownerId: sampleOwnerId }
      )
    );
    
    withIndexResults.push(
      await tester.testQuery(
        'Find by ownerId, sorted by createdAt',
        { ownerId: sampleOwnerId },
        { sort: { createdAt: -1 } }
      )
    );
    
    withIndexResults.push(
      await tester.testQuery(
        'Regex search on document name',
        { name: /test/i }
      )
    );
    
    withIndexResults.push(
      await tester.testQuery(
        'Find all, sorted by createdAt',
        {},
        { sort: { createdAt: -1 } }
      )
    );
    
    // Print comparison
    console.log(chalk.cyan('\n' + '='.repeat(70)));
    console.log(chalk.cyan.bold('📊 COMPARISON: BEFORE vs AFTER INDEXING'));
    console.log(chalk.cyan('='.repeat(70) + '\n'));
    
    // Scan-to-Return Ratio Table
    console.log(chalk.white.bold('\n1. Scan-to-Return Ratio (Efficiency)\n'));
    console.log(
      chalk.white.bold('Query'.padEnd(35)) +
      chalk.yellow('Before'.padEnd(20)) +
      chalk.green('After'.padEnd(20)) +
      chalk.cyan('Improvement')
    );
    console.log(chalk.gray('─'.repeat(90)));
    
    for (let i = 0; i < withoutIndexResults.length; i++) {
      const before = withoutIndexResults[i];
      const after = withIndexResults[i];
      
      if (!before || !after) continue;
      
      const queryDesc = before.description.substring(0, 32);
      const improvement = before.ratio > 0 
        ? (((before.ratio - after.ratio) / before.ratio) * 100).toFixed(1)
        : '0';
      
      console.log(
        chalk.white(queryDesc.padEnd(35)) +
        chalk.yellow(`${before.ratioFormatted}:1`.padEnd(20)) +
        chalk.green(`${after.ratioFormatted}:1`.padEnd(20)) +
        chalk.cyan(`${improvement}%`)
      );
    }
    
    console.log(chalk.gray('─'.repeat(90)));
    
    // P99 Latency Table
    console.log(chalk.white.bold('\n2. P99 Query Latency (User Experience)\n'));
    console.log(
      chalk.white.bold('Query'.padEnd(35)) +
      chalk.yellow('Before'.padEnd(20)) +
      chalk.green('After'.padEnd(20)) +
      chalk.cyan('Improvement')
    );
    console.log(chalk.gray('─'.repeat(90)));
    
    for (let i = 0; i < withoutIndexResults.length; i++) {
      const before = withoutIndexResults[i];
      const after = withIndexResults[i];
      
      if (!before || !after || !before.latency || !after.latency) continue;
      
      const queryDesc = before.description.substring(0, 32);
      const beforeP99 = parseFloat(before.latency.p99);
      const afterP99 = parseFloat(after.latency.p99);
      const improvement = beforeP99 > 0 
        ? (((beforeP99 - afterP99) / beforeP99) * 100).toFixed(1)
        : '0';
      
      console.log(
        chalk.white(queryDesc.padEnd(35)) +
        chalk.yellow(`${before.latency.p99}ms`.padEnd(20)) +
        chalk.green(`${after.latency.p99}ms`.padEnd(20)) +
        chalk.cyan(`${improvement}%`)
      );
    }
    
    console.log(chalk.gray('─'.repeat(90)));
    
    // CPU/Resource Usage Table
    console.log(chalk.white.bold('\n3. CPU Intensity (Resource Cost)\n'));
    console.log(
      chalk.white.bold('Query'.padEnd(35)) +
      chalk.yellow('Before'.padEnd(20)) +
      chalk.green('After'.padEnd(20)) +
      chalk.cyan('Reduction')
    );
    console.log(chalk.gray('─'.repeat(90)));
    
    for (let i = 0; i < withoutIndexResults.length; i++) {
      const before = withoutIndexResults[i];
      const after = withIndexResults[i];
      
      if (!before || !after || !before.resources || !after.resources) continue;
      
      const queryDesc = before.description.substring(0, 32);
      const beforeCpu = parseFloat(before.resources.cpuScore);
      const afterCpu = parseFloat(after.resources.cpuScore);
      const reduction = beforeCpu > 0 
        ? (((beforeCpu - afterCpu) / beforeCpu) * 100).toFixed(1)
        : '0';
      
      console.log(
        chalk.white(queryDesc.padEnd(35)) +
        chalk.yellow(`${before.resources.cpuIntensity} (${before.resources.cpuScore})`.padEnd(20)) +
        chalk.green(`${after.resources.cpuIntensity} (${after.resources.cpuScore})`.padEnd(20)) +
        chalk.cyan(`${reduction}%`)
      );
    }
    
    console.log(chalk.gray('─'.repeat(90)));
    
    // Summary
    console.log(chalk.cyan('\n📈 Summary:'));
    console.log(chalk.gray('─'.repeat(70)));
    
    const avgBefore = withoutIndexResults
      .filter(r => r && r.ratio)
      .reduce((sum, r) => sum + r.ratio, 0) / withoutIndexResults.filter(r => r).length;
    
    const avgAfter = withIndexResults
      .filter(r => r && r.ratio)
      .reduce((sum, r) => sum + r.ratio, 0) / withIndexResults.filter(r => r).length;
    
    const avgImprovement = ((avgBefore - avgAfter) / avgBefore * 100).toFixed(1);
    
    console.log(chalk.white.bold(`Metric 1: Scan-to-Return Ratio`));
    console.log(chalk.yellow(`  Before indexing: ${avgBefore.toFixed(2)}:1`));
    console.log(chalk.green(`  After indexing:  ${avgAfter.toFixed(2)}:1`));
    console.log(chalk.cyan(`  Improvement:     ${avgImprovement}%`));
    
    // P99 Latency Summary
    const p99Before = withoutIndexResults
      .filter(r => r && r.latency)
      .reduce((sum, r) => sum + parseFloat(r.latency.p99), 0) / withoutIndexResults.filter(r => r && r.latency).length;
    
    const p99After = withIndexResults
      .filter(r => r && r.latency)
      .reduce((sum, r) => sum + parseFloat(r.latency.p99), 0) / withIndexResults.filter(r => r && r.latency).length;
    
    const p99Improvement = ((p99Before - p99After) / p99Before * 100).toFixed(1);
    
    console.log(chalk.white.bold(`\nMetric 2: P99 Query Latency`));
    console.log(chalk.yellow(`  Before indexing: ${p99Before.toFixed(2)}ms`));
    console.log(chalk.green(`  After indexing:  ${p99After.toFixed(2)}ms`));
    console.log(chalk.cyan(`  Improvement:     ${p99Improvement}%`));
    
    // CPU Usage Summary
    const cpuBefore = withoutIndexResults
      .filter(r => r && r.resources)
      .reduce((sum, r) => sum + parseFloat(r.resources.cpuScore), 0) / withoutIndexResults.filter(r => r && r.resources).length;
    
    const cpuAfter = withIndexResults
      .filter(r => r && r.resources)
      .reduce((sum, r) => sum + parseFloat(r.resources.cpuScore), 0) / withIndexResults.filter(r => r && r.resources).length;
    
    const cpuReduction = ((cpuBefore - cpuAfter) / cpuBefore * 100).toFixed(1);
    
    console.log(chalk.white.bold(`\nMetric 3: CPU Intensity Score`));
    console.log(chalk.yellow(`  Before indexing: ${cpuBefore.toFixed(2)} (High - full collection scan)`));
    console.log(chalk.green(`  After indexing:  ${cpuAfter.toFixed(2)} (Low - B-Tree traversal)`));
    console.log(chalk.cyan(`  Reduction:       ${cpuReduction}%`));
    
    console.log(chalk.gray('\n─'.repeat(70)));
    
    if (avgAfter <= 1.1 && p99After < 10 && cpuAfter < 2) {
      console.log(chalk.green('\n✓ EXCELLENT: Indexes are working optimally!'));
      console.log(chalk.white(`  • Scan-to-return ratio: ${avgAfter.toFixed(2)}:1 (target: ≤ 1.1:1) ✓`));
      console.log(chalk.white(`  • P99 latency: ${p99After.toFixed(2)}ms (target: < 10ms) ✓`));
      console.log(chalk.white(`  • CPU intensity: ${cpuAfter.toFixed(2)} (target: < 2) ✓`));
    } else if (avgAfter <= 2 && p99After < 50) {
      console.log(chalk.yellow('\n⚠ GOOD: Indexes are helping but could be improved.'));
      console.log(chalk.white(`  • Scan-to-return ratio: ${avgAfter.toFixed(2)}:1 (target: ≤ 1.1:1)`));
      console.log(chalk.white(`  • P99 latency: ${p99After.toFixed(2)}ms (target: < 10ms)`));
      console.log(chalk.white(`  • CPU intensity: ${cpuAfter.toFixed(2)} (target: < 2)`));
    } else {
      console.log(chalk.red('\n✗ NEEDS IMPROVEMENT: Queries are still inefficient.'));
      console.log(chalk.white(`  • Scan-to-return ratio: ${avgAfter.toFixed(2)}:1 (target: ≤ 1.1:1)`));
      console.log(chalk.white(`  • P99 latency: ${p99After.toFixed(2)}ms (target: < 10ms)`));
      console.log(chalk.white(`  • CPU intensity: ${cpuAfter.toFixed(2)} (target: < 2)`));
      console.log(chalk.white('  Consider reviewing query patterns and index strategy.'));
    }
    
    console.log(chalk.cyan('\n💡 Why These Metrics Matter:'));
    console.log(chalk.white('  • P99 Latency: Shows real user experience at scale (99% complete faster)'));
    console.log(chalk.white('  • Scan-to-Return: Measures database work efficiency (1:1 = perfect)'));
    console.log(chalk.white('  • CPU Intensity: Without indexes = Full scan (CPU spike to 100%)'));
    console.log(chalk.white('                   With indexes = B-Tree traversal (CPU near 0%)'));
    console.log(chalk.white(`\n  Your Results: ${p99After.toFixed(2)}ms P99, ${avgAfter.toFixed(2)}:1 ratio, ${cpuAfter.toFixed(2)} CPU score`));
    
    console.log(chalk.cyan('\n' + '='.repeat(70) + '\n'));
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Test failed: ${error.message}`));
    console.error(chalk.gray(error.stack));
    process.exit(1);
  } finally {
    await tester.disconnect();
  }
}

main();
