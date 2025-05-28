const express = require('express');
const router = express.Router();

// This function assumes the driver is passed from the main app
module.exports = function(driver) {
  // Get all nodes and relationships for graph visualization
  router.get('/graph', async (req, res) => {
    const session = driver.session();
    try {
      // Query to get all nodes
      const nodesResult = await session.run(`
        MATCH (n:TaxonomyNode)
        RETURN id(n) as id, n.name as name, n.description as description, n.owner as owner
      `);
      
      // Query to get all relationships
      const relsResult = await session.run(`
        MATCH (source:TaxonomyNode)-[r:CHILD_OF]->(target:TaxonomyNode)
        RETURN id(source) as source, id(target) as target, type(r) as type
      `);
      
      // Format the response
      const nodes = nodesResult.records.map(record => ({
        id: record.get('id').toString(),
        name: record.get('name'),
        description: record.get('description'),
        owner: record.get('owner')
      }));
      
      const relationships = relsResult.records.map(record => ({
        source: record.get('source').toString(),
        target: record.get('target').toString(),
        type: record.get('type')
      }));
      
      res.json({ nodes, relationships });
    } catch (error) {
      console.error('Error fetching graph data:', error);
      res.status(500).json({ error: error.message });
    } finally {
      await session.close();
    }
  });

  return router;
};