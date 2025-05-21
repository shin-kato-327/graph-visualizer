const request = require('supertest');
const app = require('./index'); // Import the Express app
const neo4j = require('neo4j-driver');

// Mock the neo4j driver
jest.mock('neo4j-driver');

// Mock implementation for session.run
const mockRun = jest.fn();

describe('GET /api/taxonomy/nodes-depth-two', () => {
  let mockSession;

  beforeEach(() => {
    // Reset mocks before each test
    mockRun.mockReset();
    mockSession = { run: mockRun, close: jest.fn().mockResolvedValue(undefined) };
    neo4j.driver.mockReturnValue({
      session: jest.fn(() => mockSession),
      close: jest.fn().mockResolvedValue(undefined) // Mock driver.close()
    });
  });

  it('should return 200 OK and grandchild nodes on success', async () => {
    // Example mock data for grandchild nodes' properties
    const mockGrandchildrenData = [
      { name: 'Grandchild1', description: 'Desc1' },
      { name: 'Grandchild2', description: 'Desc2' },
    ];
    // Simulate the structure Neo4j driver returns for records
    // Each record must have a get('grandchild') method that returns an object with a 'properties' field
    const mockRecords = mockGrandchildrenData.map(props => ({
      get: (key) => {
        if (key === 'grandchild') {
          return { properties: props };
        }
        return undefined; // Should not be called with other keys in this test
      }
    }));
    mockRun.mockResolvedValue({ records: mockRecords });

    const response = await request(app).get('/api/taxonomy/nodes-depth-two');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      { name: 'Grandchild1', description: 'Desc1' },
      { name: 'Grandchild2', description: 'Desc2' },
    ]);
    // Verify the correct Cypher query was used
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('MATCH (grandchild:TaxonomyNode)-[:CHILD_OF]->(child:TaxonomyNode)-[:CHILD_OF]->(root:TaxonomyNode)')
    );
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('WHERE NOT (root)-[:CHILD_OF]->()')
    );
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('RETURN grandchild')
    );
  });

  it('should return 200 OK and an empty array if no grandchild nodes are found', async () => {
    mockRun.mockResolvedValue({ records: [] }); // No records found

    const response = await request(app).get('/api/taxonomy/nodes-depth-two');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('should return 500 Internal Server Error if Neo4j query fails', async () => {
    mockRun.mockRejectedValue(new Error('Neo4j query failed')); // Simulate a query error

    const response = await request(app).get('/api/taxonomy/nodes-depth-two');

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'Neo4j query failed' });
  });

  // Add more tests as needed, e.g., for specific query parameters if they were supported.
});
