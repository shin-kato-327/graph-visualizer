require('dotenv').config();
const express = require('express');
const cors = require('cors');
const neo4j = require('neo4j-driver');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Neo4j connection
const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password'
  )
);

// Function to read and parse YAML files
function readYamlFiles() {
  // __dirname points to <repo root>/src. The taxonomy folder is at the
  // repository root, so only go up one level.
  const taxonomyDir = path.join(__dirname, '../taxonomy');
  const files = fs.readdirSync(taxonomyDir);
  return files
    .filter(file => file.endsWith('.yaml'))
    .map(file => {
      const content = fs.readFileSync(path.join(taxonomyDir, file), 'utf8');
      return {
        filename: file,
        ...yaml.load(content)
      };
    });
}

// Initialize Neo4j database
async function initializeDatabase() {
  const session = driver.session();
  try {
    // Clear existing data
    await session.run('MATCH (n) DETACH DELETE n');
    
    // Read and process YAML files
    const nodes = readYamlFiles();
    
    // Create nodes
    for (const node of nodes) {
      await session.run(
        'CREATE (n:TaxonomyNode {name: $name, description: $description, owner: $owner, filename: $filename})',
        node
      );
    }
    
    // Create relationships
    for (const node of nodes) {
      if (node.childof && node.childof !== 'none') {
        await session.run(
          'MATCH (child:TaxonomyNode {name: $childName}), (parent:TaxonomyNode {name: $parentName}) CREATE (child)-[:CHILD_OF]->(parent)',
          { childName: node.name, parentName: node.childof }
        );
      }
    }
  } finally {
    await session.close();
  }
}

// API Endpoints
app.get('/api/taxonomy', async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (n:TaxonomyNode)
      OPTIONAL MATCH (n)-[:CHILD_OF]->(parent:TaxonomyNode)
      RETURN n, parent
    `);
    
    const nodes = result.records.map(record => ({
      ...record.get('n').properties,
      parent: record.get('parent') ? record.get('parent').properties.name : null
    }));
    
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

app.get('/api/taxonomy/:filename', (req, res) => {
  try {
    // Files are stored in the taxonomy folder one level above this file
    const filePath = path.join(__dirname, '../taxonomy', req.params.filename);
    const content = fs.readFileSync(filePath, 'utf8');
    res.json(yaml.load(content));
  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

// Initialize database and start server
initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}); 