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
  const taxonomyDir = path.join(__dirname, '../../taxonomy');
  console.log('Reading YAML files from:', taxonomyDir);
  const files = fs.readdirSync(taxonomyDir);
  console.log('Found files:', files);
  return files
    .filter(file => file.endsWith('.yaml'))
    .map(file => {
      console.log('Processing file:', file);
      const content = fs.readFileSync(path.join(taxonomyDir, file), 'utf8');
      const parsed = yaml.load(content);
      console.log('Parsed content:', parsed);
      return {
        filename: file,
        ...parsed
      };
    });
}

// Initialize Neo4j database
async function initializeDatabase() {
  const session = driver.session();
  try {
    console.log('Clearing existing data...');
    // Clear existing data
    await session.run('MATCH (n) DETACH DELETE n');
    
    // Read and process YAML files
    console.log('Reading YAML files...');
    const nodes = readYamlFiles();
    console.log('Found nodes:', nodes);
    
    // Create nodes
    console.log('Creating nodes...');
    for (const node of nodes) {
      console.log('Creating node:', node);
      // Flatten usecase object if it exists
      const usecaseDescription = node.usecase?.description || '';
      const usecaseExample = node.usecase?.example || '';
      // Handle both benchmarks and benchmark fields
      const benchmarks = Array.isArray(node.benchmarks) ? node.benchmarks.join(', ') : 
                        node.benchmark ? node.benchmark : '';

      await session.run(
        'CREATE (n:TaxonomyNode {name: $name, description: $description, owner: $owner, filename: $filename, usecaseDescription: $usecaseDescription, usecaseExample: $usecaseExample, benchmarks: $benchmarks})',
        {
          name: node.name,
          description: node.description || '',
          owner: node.owner || '',
          filename: node.filename,
          usecaseDescription,
          usecaseExample,
          benchmarks
        }
      );
    }
    
    // Create relationships
    console.log('Creating relationships...');
    for (const node of nodes) {
      if (node.childof && node.childof !== 'none') {
        console.log('Creating relationship:', node.name, '->', node.childof);
        await session.run(
          'MATCH (child:TaxonomyNode {name: $childName}), (parent:TaxonomyNode {name: $parentName}) CREATE (child)-[:CHILD_OF]->(parent)',
          { childName: node.name, parentName: node.childof }
        );
      }
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
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
    const filePath = path.join(__dirname, '../../taxonomy', req.params.filename);
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