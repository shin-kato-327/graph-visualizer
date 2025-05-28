import React, { useEffect, useState } from 'react';
import { Container, Box, Paper, Typography, FormControl, InputLabel, Select, MenuItem, Slider, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, IconButton, Tabs, Tab } from '@mui/material';
import Tree from 'react-d3-tree';
import axios from 'axios';
import { TaxonomyNode, TreeNode } from './types';
import { dump } from 'js-yaml';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import GraphPage from './pages/GraphPage';

// Define the type expected by react-d3-tree
interface RawNodeDatum {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: RawNodeDatum[];
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
      style={{ height: value === index ? '100%' : 0 }}
    >
      {value === index && (
        <Box sx={{ height: '100%' }}>
          {children}
        </Box>
      )}
    </div>
  );
}

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
  const [searchKeyword, setSearchKeyword] = useState('');
  const [matchedNodeNames, setMatchedNodeNames] = useState<string[]>([]);
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:3001/api/taxonomy');
        const nodes: TaxonomyNode[] = response.data;
        setAllNodes(nodes);
        
        // Extract all unique owners from nodes
        const uniqueOwners = new Set<string>();
        nodes.forEach(node => {
          if (Array.isArray(node.owner)) {
            node.owner.forEach(owner => uniqueOwners.add(owner.trim()));
          } else if (typeof node.owner === 'string') {
            // Handle different formats of owner strings
            // First try to split by commas
            const commaOwners = node.owner.split(',');
            
            if (commaOwners.length > 1) {
              commaOwners.forEach(owner => {
                if (owner.trim()) uniqueOwners.add(owner.trim());
              });
            } else {
              // Try to split by newlines or dashes if it's a YAML list
              const lineOwners = node.owner
                .split(/\n\s*-\s*|\r\n\s*-\s*|-\s+/)
                .filter(o => o.trim() !== '' && !o.includes('owner:'));
              
              if (lineOwners.length > 1) {
                lineOwners.forEach(owner => {
                  if (owner.trim()) uniqueOwners.add(owner.trim());
                });
              } else {
                // If no clear delimiter, just add as is
                if (node.owner.trim()) uniqueOwners.add(node.owner.trim());
              }
            }
          }
        });
        
        setOwners(['All', ...Array.from(uniqueOwners).sort()]);
        
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

  // Helper function to check if a node has a specific owner
  const hasOwner = (nodeOwner: any, targetOwner: string): boolean => {
    if (!nodeOwner) return false;
    if (Array.isArray(nodeOwner)) {
      return nodeOwner.some((owner: string) => owner.trim() === targetOwner);
    }
    if (typeof nodeOwner === 'string') {
      // Try different splitting methods to match the owner
      // First try comma separation
      const commaOwners = nodeOwner.split(',').map(o => o.trim());
      if (commaOwners.includes(targetOwner)) return true;
      
      // Try YAML list format
      const yamlOwners = nodeOwner
        .split(/\n\s*-\s*|\r\n\s*-\s*|-\s+/)
        .filter(o => o.trim() !== '' && !o.includes('owner:'))
        .map(o => o.trim());
      
      return yamlOwners.includes(targetOwner);
    }
    return false;
  };

  // Convert TreeNode to RawNodeDatum for react-d3-tree
  // Also propagate owner information from parent to children for highlighting
  function convertToRawNodeDatum(node: TreeNode, parentOwners: string = ''): RawNodeDatum {
    // Get this node's owner(s)
    let nodeOwner = '';
    if (node.attributes?.owner) {
      nodeOwner = Array.isArray(node.attributes.owner) 
        ? node.attributes.owner.join(', ') 
        : node.attributes.owner;
    }
    
    // Combine with parent owners for inheritance
    const combinedOwners = nodeOwner ? nodeOwner : parentOwners;
    
    const rawNode: RawNodeDatum = {
      name: node.name,
      children: node.children?.map(child => convertToRawNodeDatum(child, combinedOwners))
    };
    
    if (node.attributes) {
      rawNode.attributes = {
        description: node.attributes.description,
        filename: node.attributes.filename,
        // Store both actual owner and inherited owners for highlighting
        owner: nodeOwner,
        inheritedOwners: combinedOwners
      };
    }
    
    return rawNode;
  }

  // No longer filtering nodes, just passing through the entire tree
  function processTree(node: TreeNode): TreeNode {
    if (!node) return node;
    
    // Process children recursively
    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: node.children.map(child => processTree(child))
      };
    }
    
    return node;
  }

  // Process the tree without filtering, then convert to RawNodeDatum for react-d3-tree
  // Start with empty parent owners since we're at the root
  const processedTreeNode = treeData ? processTree(treeData) : null;
  const processedTree = processedTreeNode ? convertToRawNodeDatum(processedTreeNode, '') : null;

  const handleNodeClick = async (nodeData: any) => {
    try {
      const response = await axios.get(`http://localhost:3001/api/taxonomy/${nodeData.data.attributes.filename}`);
      setSelectedNode(response.data);
    } catch (error) {
      console.error('Error fetching node details:', error);
    }
  };

  const handleAddChild = async () => {
    if (!selectedNode || !newChildNode.name) {
      return;
    }

    // Build the YAML string for the new node
    const yamlString = dump({
      name: newChildNode.name,
      description: newChildNode.description || '',
      owner: newChildNode.owner || '',
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

  // Search handler
  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchKeyword.trim()) {
      setMatchedNodeNames([]);
      return;
    }
    const keyword = searchKeyword.trim().toLowerCase();
    const matched = allNodes
      .filter(node => {
        // Search by node name
        if (node.name.toLowerCase().includes(keyword)) return true;
        
        // Search by owner
        if (Array.isArray(node.owner)) {
          return node.owner.some(owner => 
            owner.toLowerCase().includes(keyword)
          );
        } else if (typeof node.owner === 'string') {
          // Try different splitting methods for owners
          // First check the raw string
          if (node.owner.toLowerCase().includes(keyword)) return true;
          
          // Try comma separation
          const commaOwners = node.owner.split(',');
          if (commaOwners.some(o => o.trim().toLowerCase().includes(keyword))) return true;
          
          // Try YAML list format
          const yamlOwners = node.owner
            .split(/\n\s*-\s*|\r\n\s*-\s*|-\s+/)
            .filter(o => o.trim() !== '' && !o.includes('owner:'));
          
          return yamlOwners.some(o => o.trim().toLowerCase().includes(keyword));
        }
        return false;
      })
      .map(node => node.name);
    setMatchedNodeNames(matched);
  };

  const handleClearSearch = () => {
    setSearchKeyword('');
    setMatchedNodeNames([]);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="visualization tabs">
          <Tab label="Tree View" />
          <Tab label="Graph View" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TextField
              label="Search nodes or owners"
              placeholder="Enter node name or owner"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              size="small"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton type="submit" size="small">
                      <SearchIcon />
                    </IconButton>
                    <IconButton onClick={handleClearSearch} size="small" disabled={!searchKeyword}>
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                )
              }}
              sx={{ minWidth: 220 }}
            />
          </form>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="owner-filter-label">Filter by Owner</InputLabel>
            <Select
              labelId="owner-filter-label"
              value={ownerFilter}
              label="Filter by Owner"
              onChange={(e) => setOwnerFilter(e.target.value)}
            >
              {owners.map((owner) => (
                <MenuItem key={owner} value={owner}>
                  {owner}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
        <Box sx={{ display: 'flex', gap: 3, height: '80vh' }}>
          <Box sx={{ flex: 2 }}>
            <Paper sx={{ p: 2, height: '100%' }}>
              {processedTree && (
                <div style={{ width: '100%', height: '100%' }}>
                  <Tree
                    data={processedTree}
                    orientation="horizontal"
                    onNodeClick={handleNodeClick}
                    pathFunc="step"
                    nodeSize={{ x: 200, y: verticalSpacing }}
                    separation={{ siblings: 2, nonSiblings: 2.5 }}
                    zoom={zoomLevel}
                    translate={translate}
                    renderCustomNodeElement={({ nodeDatum }) => {
                      const isSelected = selectedNode && nodeDatum.name === selectedNode.name;
                      const isMatched = matchedNodeNames.includes(nodeDatum.name);
                      const isOwnedBySelected = ownerFilter !== 'All' && (
                        // Check actual owner
                        (nodeDatum.attributes?.owner && 
                         String(nodeDatum.attributes.owner).toLowerCase().includes(ownerFilter.toLowerCase())) ||
                        // Check inherited owners from parents
                        (nodeDatum.attributes?.inheritedOwners && 
                         String(nodeDatum.attributes.inheritedOwners).toLowerCase().includes(ownerFilter.toLowerCase()))
                      );
                      let fillColor = '#fff';
                      if (isSelected) {
                        fillColor = '#90ee90';
                      } else if (isMatched || isOwnedBySelected) {
                        fillColor = 'orange';
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
            <Paper sx={{ p: 2, height: '100%', width: 400, boxSizing: 'border-box', overflow: 'hidden' }}>
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
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <GraphPage />
      </TabPanel>

      <Dialog open={isAddChildDialogOpen} onClose={() => setIsAddChildDialogOpen(false)}>
        <DialogTitle>Add Child Node</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name *"
            fullWidth
            required
            value={newChildNode.name}
            onChange={(e) => setNewChildNode({ ...newChildNode, name: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            multiline
            rows={3}
            value={newChildNode.description}
            onChange={(e) => setNewChildNode({ ...newChildNode, description: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Owner (optional)"
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