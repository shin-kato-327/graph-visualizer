import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import Neo4jGraph from '../components/Neo4jGraph';

const GraphPage: React.FC = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        Neo4j Graph Visualization
      </Typography>
      <Box sx={{ mb: 4 }}>
        <Typography variant="body1">
          Interactive visualization of Neo4j database relationships using Force-Directed Graph.
        </Typography>
      </Box>
      <Neo4jGraph />
    </Container>
  );
};

export default GraphPage;