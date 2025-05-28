import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';

interface GraphNode {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  x: number;
  y: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const Neo4jGraph: React.FC = () => {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await axios.get('http://localhost:3001/api/neo4j/graph');
        
        // Transform data for the graph
        const nodes = response.data.nodes.map((node: any) => ({
          id: node.id,
          name: node.name,
          description: node.description || '',
          owner: node.owner || '',
          x: Math.random() * 800 - 400 + 400, // Center around 400
          y: Math.random() * 600 - 300 + 300  // Center around 300
        }));
        
        const links = response.data.relationships.map((rel: any) => ({
          source: rel.source,
          target: rel.target,
          type: rel.type
        }));
        
        setGraphData({ nodes, links });
        setLoading(false);
      } catch (error) {
        console.error('Error fetching graph data:', error);
        setError('Failed to load graph data');
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  useEffect(() => {
    if (!loading && graphData.nodes.length > 0) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw the graph
      const draw = () => {
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);
        
        // Draw links
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        
        for (const link of graphData.links) {
          const sourceNode = graphData.nodes.find(n => n.id === link.source);
          const targetNode = graphData.nodes.find(n => n.id === link.target);
          
          if (sourceNode && targetNode) {
            ctx.beginPath();
            ctx.moveTo(sourceNode.x, sourceNode.y);
            ctx.lineTo(targetNode.x, targetNode.y);
            ctx.stroke();
            
            // Draw arrow
            const dx = targetNode.x - sourceNode.x;
            const dy = targetNode.y - sourceNode.y;
            const angle = Math.atan2(dy, dx);
            
            const arrowLength = 10;
            
            const arrowX = targetNode.x - Math.cos(angle) * 15;
            const arrowY = targetNode.y - Math.sin(angle) * 15;
            
            ctx.beginPath();
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(
              arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
              arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
              arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
              arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fillStyle = '#999';
            ctx.fill();
          }
        }
        
        // Draw nodes
        for (const node of graphData.nodes) {
          const isHovered = hoveredNode === node;
          
          ctx.beginPath();
          ctx.arc(node.x, node.y, isHovered ? 12 : 8, 0, 2 * Math.PI);
          ctx.fillStyle = isHovered ? '#ff7700' : '#1976d2';
          ctx.fill();
          
          // Draw node label
          ctx.font = '12px Arial';
          ctx.fillStyle = '#000';
          ctx.textAlign = 'center';
          ctx.fillText(node.name, node.x, node.y + 20);
        }
      };
      
      draw();
      
      // Handle mouse interactions
      const handleMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Check for node hover
        let hovered = null;
        for (const node of graphData.nodes) {
          const dx = node.x - mouseX;
          const dy = node.y - mouseY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 10) {
            hovered = node;
            break;
          }
        }
        
        setHoveredNode(hovered);
        draw();
      };
      
      canvas.addEventListener('mousemove', handleMouseMove);
      
      return () => {
        canvas.removeEventListener('mousemove', handleMouseMove);
      };
    }
  }, [graphData, loading, hoveredNode]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Paper sx={{ height: '80vh', width: '100%', position: 'relative' }}>
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={600} 
        style={{ width: '100%', height: '100%' }}
      />
      {hoveredNode && (
        <Box 
          sx={{ 
            position: 'absolute', 
            top: 10, 
            right: 10, 
            p: 2, 
            bgcolor: 'background.paper',
            boxShadow: 1,
            borderRadius: 1
          }}
        >
          <Typography variant="subtitle1">{hoveredNode.name}</Typography>
          {hoveredNode.description && (
            <Typography variant="body2">{hoveredNode.description}</Typography>
          )}
          {hoveredNode.owner && (
            <Typography variant="body2">Owner: {hoveredNode.owner}</Typography>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default Neo4jGraph;