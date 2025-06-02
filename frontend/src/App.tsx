import React, { useEffect, useState, useMemo } from 'react';
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
  const [verticalSpacing, setVerticalSpacing] = useState(35);
  const [zoomLevel, setZoomLevel] = useState(0.6);
  const [translate, setTranslate] = useState({ x: 200, y: 350 });
  const [isAddChildDialogOpen, setIsAddChildDialogOpen] = useState(false);
  const [newChildNode, setNewChildNode] = useState({
    name: '',
    description: '',
    owner: '',
    location: '',
    type: '',
  });
  const [searchKeyword, setSearchKeyword] = useState('');
  const [matchedNodeNames, setMatchedNodeNames] = useState<string[]>([]);
  const [tabValue, setTabValue] = useState(0);
  const [treeDepth, setTreeDepth] = useState<number>(3);
  // Store expanded node names directly
  const [expandedNodes, setExpandedNodes] = useState<string[]>([]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Re-render when expandedNodes changes
  useEffect(() => {
    console.log("Expanded nodes changed:", expandedNodes);
  }, [expandedNodes]);

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
              filename: node.filename,
              location: node.location || '999', // Default high value for nodes without location
              type: node.type || ''
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
        
        // Sort function for nodes based on location
        const sortNodesByLocation = (nodes: TreeNode[]): TreeNode[] => {
          return [...nodes].sort((a, b) => {
            const locA = a.attributes?.location ? String(a.attributes.location) : '999';
            const locB = b.attributes?.location ? String(b.attributes.location) : '999';
            return locA.localeCompare(locB);
          });
        };
        
        // Sort all nodes by location
        rootNodes.sort((a, b) => {
          const locA = a.attributes?.location ? String(a.attributes.location) : '999';
          const locB = b.attributes?.location ? String(b.attributes.location) : '999';
          return locA.localeCompare(locB);
        });
        
        // Sort children recursively
        const sortChildrenRecursively = (node: TreeNode) => {
          if (node.children && node.children.length > 0) {
            node.children = sortNodesByLocation(node.children);
            node.children.forEach(sortChildrenRecursively);
          }
        };
        
        // Apply sorting to all nodes
        rootNodes.forEach(sortChildrenRecursively);

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
    
    // We don't need this anymore as we're using attributes.hasHiddenChildren
    const hasHiddenChildren = false;
    
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
        inheritedOwners: combinedOwners,
        type: node.attributes.type || '',
        hasHiddenChildren: node.attributes.hasHiddenChildren || false,
        hasChildren: node.attributes.hasChildren || false
      };
    }
    
    // Store the node name for reference
    (rawNode as any).__rd3t = {
      nodeName: node.name
    };
    
    return rawNode;
  }
  
  // No longer needed - removing findNodeByPath function

  // Process tree with depth limiting and expanded nodes
  function processTree(node: TreeNode, currentDepth: number = 1): TreeNode {
    if (!node) return node;
    
    // Create a copy of the node
    const processedNode = { ...node };
    
    // Check if this node is expanded or within the default depth
    const isExpanded = expandedNodes.includes(node.name);
    const isWithinDefaultDepth = currentDepth < treeDepth;
    
    // Mark if this node has children
    if (node.children && node.children.length > 0) {
      if (!processedNode.attributes) {
        processedNode.attributes = {
          description: '',
          owner: '',
          filename: '',
        };
      }
      processedNode.attributes.hasChildren = true;
    }
    
    // If we've reached the max depth and the node is not expanded, don't include children
    if (!isWithinDefaultDepth && !isExpanded) {
      // If we're hiding children, mark this node
      if (node.children && node.children.length > 0) {
        if (!processedNode.attributes) {
          processedNode.attributes = {
            description: '',
            owner: '',
            filename: '',
          };
        }
        processedNode.attributes.hasHiddenChildren = true;
      }
      return { ...processedNode, children: [] };
    }
    
    // Process children recursively if they exist
    if (node.children && node.children.length > 0) {
      processedNode.children = node.children.map(child => 
        processTree(child, currentDepth + 1)
      );
    }
    
    return processedNode;
  }

  // Process the tree with depth limiting and expanded nodes, then convert to RawNodeDatum for react-d3-tree
  const processedTreeNode = useMemo(() => {
    return treeData ? processTree(treeData, 1) : null;
  }, [treeData, treeDepth, expandedNodes]);
  
  const processedTree = useMemo(() => {
    return processedTreeNode ? convertToRawNodeDatum(processedTreeNode, '') : null;
  }, [processedTreeNode]);

  const [selectedNodeScorecard, setSelectedNodeScorecard] = useState<any>(null);

  const handleNodeClick = async (nodeData: any, evt: any) => {
    try {
      // Get node details
      const response = await axios.get(`http://localhost:3001/api/taxonomy/${nodeData.data.attributes.filename}`);
      setSelectedNode(response.data);
      
      // Check if there's a scorecard for this node using the node name
      try {
        console.log('Looking for scorecard for node:', nodeData.data.name);
        const scorecardResponse = await axios.get(`http://localhost:3001/api/taxonomy/scorecard/node/${encodeURIComponent(nodeData.data.name)}`);
        console.log('Scorecard found:', scorecardResponse.data);
        setSelectedNodeScorecard(scorecardResponse.data);
      } catch (scorecardError) {
        // No scorecard found, clear any previous scorecard
        console.log('No scorecard found:', scorecardError);
        setSelectedNodeScorecard(null);
      }
      
      // Toggle expanded state if Alt/Option key is pressed
      if (evt && evt.altKey) {
        const nodeName = nodeData.data.name;
        
        setExpandedNodes(prevExpanded => {
          if (prevExpanded.includes(nodeName)) {
            // Remove node from expanded list
            return prevExpanded.filter(name => name !== nodeName);
          } else {
            // Add node to expanded list
            return [...prevExpanded, nodeName];
          }
        });
      }
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
      childof: selectedNode.name,
      location: newChildNode.location || '999',
      type: newChildNode.type || ''
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
            filename: node.filename,
            location: node.location || '999', // Default high value for nodes without location
            type: node.type || ''
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
      
      // Sort function for nodes based on location
      const sortNodesByLocation = (nodes: TreeNode[]): TreeNode[] => {
        return [...nodes].sort((a, b) => {
          const locA = a.attributes?.location ? String(a.attributes.location) : '999';
          const locB = b.attributes?.location ? String(b.attributes.location) : '999';
          return locA.localeCompare(locB);
        });
      };
      
      // Sort all nodes by location
      rootNodes.sort((a, b) => {
        const locA = a.attributes?.location ? String(a.attributes.location) : '999';
        const locB = b.attributes?.location ? String(b.attributes.location) : '999';
        return locA.localeCompare(locB);
      });
      
      // Sort children recursively
      const sortChildrenRecursively = (node: TreeNode) => {
        if (node.children && node.children.length > 0) {
          node.children = sortNodesByLocation(node.children);
          node.children.forEach(sortChildrenRecursively);
        }
      };
      
      // Apply sorting to all nodes
      rootNodes.forEach(sortChildrenRecursively);

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

      setNewChildNode({ name: '', description: '', owner: '', location: '', type: '' });
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
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id="depth-filter-label">Tree Depth</InputLabel>
            <Select
              labelId="depth-filter-label"
              value={treeDepth}
              label="Tree Depth"
              onChange={(e) => setTreeDepth(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((depth) => (
                <MenuItem key={depth} value={depth}>
                  {depth}
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
              defaultValue={35}
            />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 3, height: '80vh' }}>
          <Box sx={{ flex: 2 }}>
            <Paper sx={{ p: 2, height: '100%' }}>
              {processedTree && (
                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                  {/* Legend in top left corner */}
                  <Box sx={{ 
                    position: 'absolute', 
                    top: 10, 
                    left: 10, 
                    zIndex: 10, 
                    bgcolor: 'rgba(255,255,255,0.9)',
                    border: '1px solid #ddd', 
                    p: 1, 
                    borderRadius: 1,
                    boxShadow: 1
                  }}>
                    <Typography variant="subtitle2" sx={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Legend:</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                      <svg width="16" height="16" style={{ marginRight: '6px' }}>
                        <circle cx="8" cy="8" r="7" fill="#ADD8E6" stroke="#333" strokeWidth="1" />
                      </svg>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>Vertical Capabilities</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <svg width="16" height="16" style={{ marginRight: '6px' }}>
                        <rect x="1" y="1" width="14" height="14" fill="#FFFACD" stroke="#333" strokeWidth="1" />
                      </svg>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>Horizontal Capabilities</Typography>
                    </Box>
                  </Box>
                  
                  <Tree
                    data={processedTree}
                    orientation="horizontal"
                    onNodeClick={(nodeData, evt) => handleNodeClick(nodeData, evt)}
                    pathFunc="step"
                    nodeSize={{ x: 200, y: verticalSpacing }}
                    separation={{ siblings: 2, nonSiblings: 2.5 }}
                    zoom={zoomLevel}
                    translate={translate}
                    enableLegacyTransitions={true}
                    collapsible={false}
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
                      // Default colors based on node type
                      let fillColor = nodeDatum.attributes?.type === 'horizontal' ? '#FFFACD' : '#ADD8E6'; // Light yellow for horizontal, light blue for others
                      
                      // Override with highlight colors if needed
                      if (isSelected) {
                        fillColor = '#90ee90'; // Green for selected nodes
                      } else if (isMatched || isOwnedBySelected) {
                        fillColor = 'orange'; // Orange for search/owner matches
                      }
                      // Split node name into words and render each on a new line
                      const words = nodeDatum.name.split(' ');
                      // Truncate to max 2 lines
                      let displayWords = words;
                      let truncated = false;
                      if (words.length > 2) {
                        displayWords = words.slice(0, 2);
                        truncated = true;
                      }
                      
                      return (
                        <g
                          style={{ cursor: 'pointer' }}
                          onClick={event => {
                            event.stopPropagation();
                            // Pass the alt key state directly
                            const altKeyPressed = event.altKey;
                            console.log("Node clicked, altKey:", altKeyPressed);
                            
                            handleNodeClick({
                              data: {
                                attributes: {
                                  ...nodeDatum.attributes
                                },
                                name: nodeDatum.name
                              },
                              __rd3t: {
                                nodeName: nodeDatum.name
                              }
                            }, { altKey: altKeyPressed });
                          }}
                        >
                          <text
                            fill="#222"
                            stroke="none"
                            x={0}
                            y={-22 - (displayWords.length - 1) * 18}
                            fontSize={16}
                            fontWeight="bold"
                            textAnchor="middle"
                            style={{ pointerEvents: 'none' }}
                          >
                            {displayWords.map((word, i) => (
                              <tspan key={i} x={0} dy={i === 0 ? 0 : 18}>
                                {i === displayWords.length - 1 && truncated ? `${word}...` : word}
                              </tspan>
                            ))}
                          </text>
                          <g>
                            {nodeDatum.attributes?.type === 'horizontal' ? (
                              <rect x={-15} y={-15} width={30} height={30} fill={fillColor} stroke="#333" strokeWidth={2} />
                            ) : (
                              <circle r={15} fill={fillColor} stroke="#333" strokeWidth={2} />
                            )}
                            
                            {/* Indicator for nodes with hidden children */}
                            {nodeDatum.attributes?.hasHiddenChildren && nodeDatum.attributes?.hasChildren && (
                              <text
                                fill="#333"
                                stroke="none"
                                x={0}
                                y={5}
                                fontSize={16}
                                fontWeight="bold"
                                textAnchor="middle"
                                style={{ pointerEvents: 'none' }}
                              >
                                +
                              </text>
                            )}
                            
                            {/* Indicator for expanded nodes */}
                            {expandedNodes.includes(nodeDatum.name) && nodeDatum.attributes?.hasChildren && (
                              <text
                                fill="#333"
                                stroke="none"
                                x={0}
                                y={5}
                                fontSize={16}
                                fontWeight="bold"
                                textAnchor="middle"
                                style={{ pointerEvents: 'none' }}
                              >
                                -
                              </text>
                            )}
                          </g>
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
                  <Typography variant="h6" gutterBottom>Node Details</Typography>
                  <pre style={{ background: '#f5f5f5', padding: '12px', borderRadius: '6px', fontSize: '14px', overflowX: 'auto', maxWidth: '100%' }}>
                    <code>
                      {dump(selectedNode)}
                    </code>
                  </pre>
                  
                  {selectedNodeScorecard && (
                    <>
                      <Typography variant="h6" sx={{ mt: 3 }} gutterBottom>Scorecard</Typography>
                      <pre style={{ background: '#f5f5f5', padding: '12px', borderRadius: '6px', fontSize: '14px', overflowX: 'auto', maxWidth: '100%' }}>
                        <code>
                          {dump(selectedNodeScorecard)}
                        </code>
                      </pre>
                    </>
                  )}
                  
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
                <div>
                  <Typography variant="body1">
                    Click on a node to view its details
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                    Hold Alt/Option key while clicking to expand/collapse nodes
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    + indicates node has hidden children
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    - indicates node is expanded
                  </Typography>
                  

                </div>
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
          <TextField
            margin="dense"
            label="Location (optional, e.g. 0.1, 1.2)"
            fullWidth
            value={newChildNode.location}
            onChange={(e) => setNewChildNode({ ...newChildNode, location: e.target.value })}
            helperText="Lower values appear first in the tree"
          />
          <TextField
            margin="dense"
            label="Type (optional, e.g. horizontal)"
            fullWidth
            value={newChildNode.type}
            onChange={(e) => setNewChildNode({ ...newChildNode, type: e.target.value })}
            helperText="Use 'horizontal' for square nodes"
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