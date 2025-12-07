const { MongoClient } = require('mongodb');
const chalk = require('chalk');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'myapp';
const COLLECTION_NAME = 'documents';
const NUM_DOCS = parseInt(process.env.NUM_DOCS) || 1000;

console.log(chalk.cyan.bold('\n📝 CREATING TEST DOCUMENTS\n'));
console.log(chalk.gray(`MongoDB: ${MONGO_URL}`));
console.log(chalk.gray(`Database: ${DB_NAME}`));
console.log(chalk.gray(`Documents to create: ${NUM_DOCS}\n`));

async function createTestData() {
  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);
  
  try {
    // Clear existing data
    console.log(chalk.gray('Clearing existing documents...'));
    await collection.deleteMany({});
    
    // Create test documents
    console.log(chalk.yellow(`Creating ${NUM_DOCS} test documents...\n`));
    
    const owners = ['user-001', 'user-002', 'user-003', 'user-004', 'user-005'];
    const docs = [];
    
    for (let i = 0; i < NUM_DOCS; i++) {
      const ownerId = owners[i % owners.length];
      const doc = {
        _id: `test-doc-${i}`,
        name: `Test Document ${i}`,
        data: { content: `This is test content for document ${i}` },
        ownerId: ownerId,
        permissions: new Map([[ownerId, 'owner']]),
        createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // Random date within last year
        updatedAt: new Date()
      };
      
      docs.push(doc);
      
      if ((i + 1) % 100 === 0) {
        console.log(chalk.gray(`  Created ${i + 1}/${NUM_DOCS}...`));
      }
    }
    
    await collection.insertMany(docs);
    
    console.log(chalk.green(`\n✓ Successfully created ${NUM_DOCS} documents`));
    
    // Show distribution
    console.log(chalk.cyan('\nDocument distribution by owner:'));
    const distribution = await collection.aggregate([
      { $group: { _id: '$ownerId', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    distribution.forEach(d => {
      console.log(chalk.white(`  ${d._id}: ${d.count} documents`));
    });
    
  } finally {
    await client.close();
  }
}

createTestData().catch(error => {
  console.error(chalk.red(`\n❌ Error: ${error.message}`));
  process.exit(1);
});
