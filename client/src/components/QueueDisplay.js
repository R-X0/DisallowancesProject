import React, { useState, useEffect } from 'react';
import { 
  Paper, 
  Typography, 
  List, 
  ListItem, 
  ListItemText, 
  Divider, 
  CircularProgress,
  Box,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip
} from '@mui/material';
import { 
  AccessTime, 
  CheckCircle, 
  HourglassEmpty, 
  ExpandMore,
  Description,
  CloudDownload,
  Info
} from '@mui/icons-material';

// This component will display the queue of submissions waiting to be processed
const QueueDisplay = () => {
  const [queueItems, setQueueItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Connect to our queue API endpoint
  useEffect(() => {
    const fetchQueue = async () => {
      try {
        setLoading(true);
        
        try {
          // Try to fetch from our API
          const response = await fetch('/api/erc-protest/queue');
          const data = await response.json();
          
          if (data.success) {
            setQueueItems(data.queue);
          } else {
            // If the API returns an error, use mock data
            throw new Error(data.message || 'Failed to fetch queue data');
          }
        } catch (apiError) {
          console.warn('API not available yet, using mock data:', apiError);
          
          // Fall back to mock data if API isn't ready
          const mockData = [
            { 
              id: 'ERC-12345', 
              businessName: 'Acme Corporation', 
              timestamp: new Date().toISOString(),
              status: 'waiting',
              submissionData: { 
                id: 'ERC-12345',
                receivedAt: new Date().toISOString(),
                originalData: { 
                  businessName: 'Acme Corporation',
                  ein: '12-3456789',
                  location: 'New York, NY'
                }
              },
              files: [
                { name: 'document1.pdf', path: '/uploads/document1.pdf', type: 'application/pdf', size: 12345 }
              ]
            },
            { 
              id: 'ERC-67890', 
              businessName: 'Widget Industries', 
              timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
              status: 'processing',
              submissionData: { 
                id: 'ERC-67890',
                receivedAt: new Date(Date.now() - 15 * 60000).toISOString(),
                originalData: { 
                  businessName: 'Widget Industries',
                  ein: '98-7654321',
                  location: 'Chicago, IL'
                }
              },
              files: [
                { name: 'document2.pdf', path: '/uploads/document2.pdf', type: 'application/pdf', size: 67890 }
              ]
            },
            { 
              id: 'ERC-ABCDE', 
              businessName: 'Tech Solutions Inc', 
              timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
              status: 'complete',
              submissionData: { 
                id: 'ERC-ABCDE',
                receivedAt: new Date(Date.now() - 30 * 60000).toISOString(),
                originalData: { 
                  businessName: 'Tech Solutions Inc',
                  ein: '56-7890123',
                  location: 'Austin, TX'
                }
              },
              files: [
                { name: 'document3.pdf', path: '/uploads/document3.pdf', type: 'application/pdf', size: 54321 }
              ],
              reportPath: '/reports/ERC-ABCDE_report.xlsx'
            }
          ];
          
          setQueueItems(mockData);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching queue:', err);
        setError('Failed to load queue data');
        setLoading(false);
      }
    };

    fetchQueue();

    // Set up polling for updates every 30 seconds
    const intervalId = setInterval(fetchQueue, 30000);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  // Helper function to format the timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get status chip based on status
  const getStatusChip = (status) => {
    switch(status) {
      case 'waiting':
      case 'received':
        return <Chip 
          icon={<HourglassEmpty fontSize="small" />} 
          label="In Queue" 
          color="warning" 
          size="small" 
        />;
      case 'processing':
        return <Chip 
          icon={<AccessTime fontSize="small" />} 
          label="Processing" 
          color="info" 
          size="small" 
        />;
      case 'complete':
        return <Chip 
          icon={<CheckCircle fontSize="small" />} 
          label="Complete" 
          color="success" 
          size="small" 
        />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  // Function to handle clicking on a queue item
  const handleItemClick = (item) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  // Function to close the dialog
  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  // Function to download a file
  const handleDownloadFile = (filePath) => {
    if (!filePath) return;
    
    // Check if it's a URL or a local path
    if (filePath.startsWith('http')) {
      window.open(filePath, '_blank');
    } else {
      window.open(`/api/erc-protest/download?path=${encodeURIComponent(filePath)}`, '_blank');
    }
  };

  // Function to format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Function to get filename from path
  const getFilenameFromPath = (filePath) => {
    if (!filePath) return '';
    // Simple path handling that works in browser
    const parts = filePath.split(/[\/\\]/);
    return parts[parts.length - 1];
  };

  return (
    <Paper elevation={3} sx={{ 
      p: 2, 
      height: '100%', 
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Typography variant="h6" gutterBottom>
        Processing Queue
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Current submissions in the processing queue
      </Typography>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" flexGrow={1}>
          <CircularProgress size={40} />
        </Box>
      ) : error ? (
        <Box display="flex" justifyContent="center" alignItems="center" flexGrow={1}>
          <Typography color="error">{error}</Typography>
        </Box>
      ) : queueItems.length === 0 ? (
        <Box display="flex" justifyContent="center" alignItems="center" flexGrow={1}>
          <Typography>No items in queue</Typography>
        </Box>
      ) : (
        <List sx={{ width: '100%', bgcolor: 'background.paper', flexGrow: 1, overflow: 'auto' }}>
          {queueItems.map((item, index) => (
            <React.Fragment key={item.id}>
              {index > 0 && <Divider component="li" />}
              <ListItem 
                alignItems="flex-start"
                secondaryAction={
                  <Tooltip title="View Details">
                    <IconButton edge="end" onClick={() => handleItemClick(item)}>
                      <Info />
                    </IconButton>
                  </Tooltip>
                }
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: 'rgba(0, 0, 0, 0.04)'
                  }
                }}
                onClick={() => handleItemClick(item)}
              >
                <ListItemText
                  primary={
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2">{item.businessName}</Typography>
                      {getStatusChip(item.status)}
                    </Box>
                  }
                  secondary={
                    <>
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.primary"
                      >
                        {item.id}
                      </Typography>
                      {" — "}{formatTime(item.timestamp)}
                      {item.files && item.files.length > 0 && (
                        <Typography variant="caption" display="block">
                          {item.files.length} file(s) attached
                        </Typography>
                      )}
                    </>
                  }
                />
              </ListItem>
            </React.Fragment>
          ))}
        </List>
      )}

      {/* Dialog for displaying queue item details */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: { maxHeight: '90vh' }
        }}
      >
        {selectedItem && (
          <>
            <DialogTitle>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">
                  Queue Item: {selectedItem.businessName}
                </Typography>
                {getStatusChip(selectedItem.status)}
              </Box>
            </DialogTitle>
            <DialogContent dividers>
              <Box mb={3}>
                <Typography variant="subtitle1" gutterBottom>
                  Basic Information
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell variant="head" width="30%">ID</TableCell>
                        <TableCell>{selectedItem.id}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell variant="head">Business Name</TableCell>
                        <TableCell>{selectedItem.businessName}</TableCell>
                      </TableRow>
                      {selectedItem.submissionData?.originalData?.ein && (
                        <TableRow>
                          <TableCell variant="head">EIN</TableCell>
                          <TableCell>{selectedItem.submissionData.originalData.ein}</TableCell>
                        </TableRow>
                      )}
                      {selectedItem.submissionData?.originalData?.location && (
                        <TableRow>
                          <TableCell variant="head">Location</TableCell>
                          <TableCell>{selectedItem.submissionData.originalData.location}</TableCell>
                        </TableRow>
                      )}
                      <TableRow>
                        <TableCell variant="head">Status</TableCell>
                        <TableCell>{selectedItem.status}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell variant="head">Timestamp</TableCell>
                        <TableCell>{new Date(selectedItem.timestamp).toLocaleString()}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              {/* Submission Data Accordion */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography variant="subtitle1">Submission Data (JSON)</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box 
                    component="pre"
                    sx={{ 
                      p: 2, 
                      bgcolor: 'grey.100', 
                      borderRadius: 1,
                      overflow: 'auto',
                      fontSize: '0.875rem',
                      maxHeight: '400px'
                    }}
                  >
                    {JSON.stringify(selectedItem.submissionData, null, 2)}
                  </Box>
                </AccordionDetails>
              </Accordion>

              {/* Files Section */}
              {selectedItem.files && selectedItem.files.length > 0 && (
                <Box mt={3}>
                  <Typography variant="subtitle1" gutterBottom>
                    Attached Files
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Filename</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Size</TableCell>
                          <TableCell>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedItem.files.map((file, index) => (
                          <TableRow key={index}>
                            <TableCell>{file.name}</TableCell>
                            <TableCell>{file.type}</TableCell>
                            <TableCell>{formatFileSize(file.size)}</TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                startIcon={<CloudDownload />}
                                onClick={() => handleDownloadFile(file.path)}
                              >
                                Download
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* Report File */}
              {selectedItem.reportPath && (
                <Box mt={3}>
                  <Typography variant="subtitle1" gutterBottom>
                    Generated Excel Report
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box display="flex" alignItems="center">
                        <Description sx={{ mr: 1 }} />
                        <Typography>{getFilenameFromPath(selectedItem.reportPath)}</Typography>
                      </Box>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<CloudDownload />}
                        onClick={() => handleDownloadFile(selectedItem.reportPath)}
                      >
                        Download Report
                      </Button>
                    </Box>
                  </Paper>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDialog}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Paper>
  );
};

export default QueueDisplay;