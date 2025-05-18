import React, { useEffect, useState } from 'react';
import { Container, Box, Paper, Typography, FormControl, InputLabel, Select, MenuItem, Slider, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import Tree from 'react-d3-tree';
import axios from 'axios';
import { TaxonomyNode, TreeNode } from './types';
import { dump } from 'js-yaml';

function App() {
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<TaxonomyNode | null>(null);
  const [allNodes, setAllNodes] = useState<TaxonomyNode[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string>('All');
  const [owners, setOwners] = useState<string[]>([]);
  const [verticalSpacing, setVerticalSpacing] = useState(60);
  const [zoomLevel, setZoomLevel] = useState(0.6);
  const [translate, setTranslate] = useState({ x: 100, y: 200 });
  const [isAddChildDialogOpen, setIsAddChildDialogOpen] = useState(false);
  const [newChildNode, setNewChildNode] = useState({
    name: '',
    description: '',
    owner: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:3001/api/taxonomy');
        const nodes: TaxonomyNode[] = response.data;
        setAllNodes(nodes);
        setOwners(['All', ...Array.from(new Set(nodes.map(n => n.owner)))]);
        
        // Convert flat structure to tree
        const nodeMap = new Map<string, TreeNode>();
        const rootNodes: TreeNode[] = [];

        // First pass: Create all nodes
        nodes.forEach(node => {
          nodeMap.set(node.name, {
            name: node.name,
            attributes: {
              description: node.description,
              owner: node.owner,
              filename: node.filename
            },
            children: []
          });
        });

        // Second pass: Build tree structure
        nodes.forEach(node => {
          const treeNode = nodeMap.get(node.name)!;
          if (node.parent === null) {
            rootNodes.push(treeNode);
          } else {
            const parentNode = nodeMap.get(node.parent);
            if (parentNode) {
              parentNode.children = parentNode.children || [];
              parentNode.children.push(treeNode);
            }
          }
        });

        // Support multiple top-level nodes
        if (rootNodes.length === 1) {
          setTreeData(rootNodes[0]);
        } else {
          setTreeData({
            name: 'root',
            attributes: { description: '', owner: '', filename: '' },
            children: rootNodes,
          });
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  // Recursive filter function
  function filterTree(node: TreeNode): TreeNode | null {
    if (!node) return null;
    const isOwned = ownerFilter === 'All' || node.attributes?.owner === ownerFilter;
    let filteredChildren: TreeNode[] = [];
    if (node.children) {
      filteredChildren = node.children
        .map(child => filterTree(child))
        .filter(Boolean) as TreeNode[];
    }
    if (isOwned || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren.length > 0 ? filteredChildren : undefined,
      };
    }
    return null;
  }

  const filteredTree = treeData ? filterTree(treeData) : null;

  const handleNodeClick = async (nodeData: any) => {
    try {
      const response = await axios.get(`http://localhost:3001/api/taxonomy/${nodeData.data.attributes.filename}`);
      setSelectedNode(response.data);
    } catch (error) {
      console.error('Error fetching node details:', error);
    }
  };

  const handleAddChild = async () => {
    if (!selectedNode || !newChildNode.name || !newChildNode.description || !newChildNode.owner) {
      return;
    }

    // Build the YAML string for the new node
    const yamlString = dump({
      name: newChildNode.name,
      description: newChildNode.description,
      owner: newChildNode.owner,
      childof: selectedNode.name
    });

    try {
      await axios.post('http://localhost:3001/api/taxonomy', {
        parent: selectedNode.name,
        yaml: yamlString
      });

      // Refresh the tree data
      const updatedResponse = await axios.get('http://localhost:3001/api/taxonomy');
      const nodes: TaxonomyNode[] = updatedResponse.data;
      setAllNodes(nodes);
      
      // Convert flat structure to tree
      const nodeMap = new Map<string, TreeNode>();
      const rootNodes: TreeNode[] = [];

      // First pass: Create all nodes
      nodes.forEach(node => {
        nodeMap.set(node.name, {
          name: node.name,
          attributes: {
            description: node.description,
            owner: node.owner,
            filename: node.filename
          },
          children: []
        });
      });

      // Second pass: Build tree structure
      nodes.forEach(node => {
        const treeNode = nodeMap.get(node.name)!;
        if (node.parent === null) {
          rootNodes.push(treeNode);
        } else {
          const parentNode = nodeMap.get(node.parent);
          if (parentNode) {
            parentNode.children = parentNode.children || [];
            parentNode.children.push(treeNode);
          }
        }
      });

      // Support multiple top-level nodes
      if (rootNodes.length === 1) {
        setTreeData(rootNodes[0]);
      } else {
        setTreeData({
          name: 'root',
          attributes: { description: '', owner: '', filename: '' },
          children: rootNodes,
        });
      }

      setNewChildNode({ name: '', description: '', owner: '' });
      setIsAddChildDialogOpen(false);
    } catch (error) {
      console.error('Error creating child node:', error);
      alert('Error creating child node: ' + error);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Box sx={{ minWidth: 250 }}>
          <Typography gutterBottom>Zoom</Typography>
          <Slider
            value={zoomLevel}
            min={0.2}
            max={2.0}
            step={0.05}
            onChange={(_, value) => setZoomLevel(value as number)}
            valueLabelDisplay="auto"
          />
        </Box>
        <Box sx={{ minWidth: 250 }}>
          <Typography gutterBottom>Vertical Space Between Levels</Typography>
          <Slider
            value={verticalSpacing}
            min={20}
            max={150}
            step={5}
            onChange={(_, value) => setVerticalSpacing(value as number)}
            valueLabelDisplay="auto"
          />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 3 }}>
        <Box sx={{ flex: 2 }}>
          <Paper sx={{ p: 2, height: '80vh' }}>
            {filteredTree && (
              <div style={{ width: '100%', height: '100%' }}>
                <Tree
                  data={filteredTree}
                  orientation="horizontal"
                  onNodeClick={handleNodeClick}
                  pathFunc="step"
                  nodeSize={{ x: 200, y: verticalSpacing }}
                  separation={{ siblings: 2, nonSiblings: 2.5 }}
                  zoom={zoomLevel}
                  translate={translate}
                  renderCustomNodeElement={({ nodeDatum }) => {
                    const isSelected = selectedNode && nodeDatum.name === selectedNode.name;
                    const isOwnedBySelected = ownerFilter !== 'All' && nodeDatum.attributes?.owner === ownerFilter;
                    let fillColor = '#fff';
                    if (isSelected) {
                      fillColor = '#90ee90';
                    } else if (isOwnedBySelected) {
                      fillColor = 'orange';
                    } else if (nodeDatum.children) {
                      fillColor = '#888';
                    }
                    // Split node name into words and render each on a new line
                    const words = nodeDatum.name.split(' ');
                    return (
                      <g
                        style={{ cursor: 'pointer' }}
                        onClick={event => {
                          event.stopPropagation();
                          handleNodeClick({
                            data: {
                              attributes: {
                                ...nodeDatum.attributes
                              },
                              name: nodeDatum.name
                            }
                          });
                        }}
                      >
                        <text
                          fill="#222"
                          stroke="none"
                          x={0}
                          y={-22 - (words.length - 1) * 18}
                          fontSize={16}
                          fontWeight="bold"
                          textAnchor="middle"
                          style={{ pointerEvents: 'none' }}
                        >
                          {words.map((word, i) => (
                            <tspan key={i} x={0} dy={i === 0 ? 0 : 18}>{word}</tspan>
                          ))}
                        </text>
                        <circle r={15} fill={fillColor} stroke="#333" strokeWidth={2} />
                      </g>
                    );
                  }}
                />
              </div>
            )}
          </Paper>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, width: 400 }}>
          <Paper sx={{ p: 2, height: '80vh', width: 400, boxSizing: 'border-box', overflow: 'hidden' }}>
            {selectedNode ? (
              <>
                <pre style={{ background: '#f5f5f5', padding: '12px', borderRadius: '6px', fontSize: '14px', overflowX: 'auto', maxWidth: '100%' }}>
                  <code>
                    {dump(selectedNode)}
                  </code>
                </pre>
                <Button 
                  variant="contained" 
                  color="primary" 
                  onClick={() => setIsAddChildDialogOpen(true)}
                  sx={{ mt: 2 }}
                >
                  Add Child Node
                </Button>
              </>
            ) : (
              <Typography variant="body1">
                Click on a node to view its details
              </Typography>
            )}
          </Paper>
        </Box>
      </Box>

      <Dialog open={isAddChildDialogOpen} onClose={() => setIsAddChildDialogOpen(false)}>
        <DialogTitle>Add Child Node</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={newChildNode.name}
            onChange={(e) => setNewChildNode({ ...newChildNode, name: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            rows={3}
            value={newChildNode.description}
            onChange={(e) => setNewChildNode({ ...newChildNode, description: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Owner"
            fullWidth
            value={newChildNode.owner}
            onChange={(e) => setNewChildNode({ ...newChildNode, owner: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsAddChildDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddChild} variant="contained" color="primary">
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default App;
