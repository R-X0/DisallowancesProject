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
  Tooltip,
  Alert,
  TextField,
  DialogContentText
} from '@mui/material';
import { 
  AccessTime, 
  CheckCircle, 
  HourglassEmpty, 
  ExpandMore,
  Description,
  CloudDownload,
  Info,
  Refresh,
  TableChartOutlined,
  Delete as DeleteIcon,
  PostAdd,
  Edit
} from '@mui/icons-material';

const QueueDisplay = () => {
  const [queueItems, setQueueItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  // State for the letter generation dialog
  // We're still keeping selectedQuarter for other functions that might use it,
  // but removing dialog-related state since we don't need confirmation
  const [selectedQuarter, setSelectedQuarter] = useState('');

  // Connect to MongoDB queue API endpoint
  const fetchQueue = async () => {
    try {
      setLoading(true);
      
      try {
        const endpoint = '/api/mongodb-queue';
        console.log(`Fetching queue from ${endpoint}`);
        const response = await fetch(endpoint);
        const data = await response.json();
        
        if (data.success) {
          console.log('Queue data received:', data.queue);
          setQueueItems(data.queue);
        } else {
          throw new Error(data.message || 'Failed to fetch queue data');
        }
      } catch (apiError) {
        console.error(`API error: ${apiError.message}`);
        setError(`Failed to fetch queue data: ${apiError.message}`);
        setQueueItems([]);
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching queue:', err);
      setError('Failed to load queue data');
      setQueueItems([]);
      setLoading(false);
    }
  };

  // Initial data load
  useEffect(() => {
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

  // Check if a letter has been generated for a specific quarter
  const isLetterGenerated = (item, quarter) => {
    // Check if item has a processed quarters array
    return item.submissionData?.processedQuarters?.includes(quarter);
  };

  // Get status chip based on status and processed quarters
  const getStatusChip = (item) => {
    const status = item.status;
    const qualifyingQuarters = item.submissionData?.report?.qualificationData?.qualifyingQuarters || [];
    
    // If no qualifying quarters, just show the basic status
    if (qualifyingQuarters.length === 0) {
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
    }
    
    // Get count of processed quarters
    const processedQuarters = item.submissionData?.processedQuarters || [];
    const processedCount = processedQuarters.length;
    
    // If all quarters have letters
    if (processedCount >= qualifyingQuarters.length) {
      return <Chip 
        icon={<CheckCircle fontSize="small" />} 
        label="All Letters Generated" 
        color="success" 
        size="small" 
      />;
    }
    
    // If some but not all quarters have letters
    if (processedCount > 0) {
      return <Chip 
        icon={<AccessTime fontSize="small" />} 
        label={`${processedCount}/${qualifyingQuarters.length} Letters`} 
        color="info" 
        size="small" 
      />;
    }
    
    // If no quarters have letters yet
    return <Chip 
      icon={<HourglassEmpty fontSize="small" />} 
      label="Needs Letters" 
      color="warning" 
      size="small" 
    />;
  };

  // Function to handle clicking on a queue item
  const handleItemClick = (item) => {
    console.log('Clicked item:', item);
    setSelectedItem(item);
    setDialogOpen(true);
  };

  // Function to handle generating a letter for a specific quarter
  // Now immediately generates the letter without confirmation
  const handleGenerateLetter = async (item, quarter) => {
    setSelectedItem(item);
    setSelectedQuarter(quarter);
    
    try {
      // Redirect to the ERC Protest Form with pre-filled data
      // We'll navigate programmatically to the form with the data
      const businessData = {
        businessName: item.businessName,
        ein: item.submissionData?.originalData?.formData?.ein || '',
        location: item.submissionData?.originalData?.formData?.location || '',
        timePeriods: [quarter]
      };
      
      // Store this in localStorage for the form to pick up
      localStorage.setItem('prefillData', JSON.stringify(businessData));
      
      // Navigate to the form (in a real implementation, you might use react-router here)
      window.location.href = '/#letterGeneration';
      
      // Mark this quarter as processed
      await updateProcessedQuarters(item.id, quarter);
      
      // Update the queue item in our state
      const updatedQueueItems = queueItems.map(queueItem => {
        if (queueItem.id === item.id) {
          const processedQuarters = queueItem.submissionData?.processedQuarters || [];
          if (!processedQuarters.includes(quarter)) {
            return {
              ...queueItem,
              submissionData: {
                ...queueItem.submissionData,
                processedQuarters: [...processedQuarters, quarter]
              }
            };
          }
        }
        return queueItem;
      });
      
      setQueueItems(updatedQueueItems);
      
    } catch (error) {
      console.error('Error initiating letter generation:', error);
    }
  };

  // This function is no longer needed since we generate letters directly
  // But keeping a minimal version just in case it's referenced elsewhere
  const proceedWithLetterGeneration = async () => {
    if (!selectedItem || !selectedQuarter) return;
    
    try {
      await handleGenerateLetter(selectedItem, selectedQuarter);
    } catch (error) {
      console.error('Error in proceedWithLetterGeneration:', error);
    }
  };

  // Function to update processed quarters in the backend
  const updateProcessedQuarters = async (itemId, quarter) => {
    try {
      // API call to update processed quarters
      const response = await fetch(`/api/mongodb-queue/update-processed-quarters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          submissionId: itemId,
          quarter
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update processed quarters');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error updating processed quarters:', error);
      throw error;
    }
  };

  // Function to close the dialog
  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  // Function to download a file
  const handleDownloadFile = (filePath) => {
    if (!filePath) {
      console.error('No file path provided');
      return;
    }
    
    console.log(`Attempting to download file: ${filePath}`);
    
    // Check if it's a URL or a local path
    if (filePath.startsWith('http')) {
      window.open(filePath, '_blank');
    } else {
      // Use the MongoDB endpoint
      const endpoint = `/api/mongodb-queue/download?path=${encodeURIComponent(filePath)}`;
      console.log(`Opening download endpoint: ${endpoint}`);
      window.open(endpoint, '_blank');
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
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1];
  };
  
  // Function to open delete confirmation dialog
  const handleOpenDeleteDialog = (item, event) => {
    // Stop propagation to prevent the item click handler from firing
    event.stopPropagation();
    
    setSelectedItem(item);
    setDeleteConfirmation('');
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };
  
  // Function to handle delete confirmation
  const handleDeleteConfirmation = async () => {
    if (deleteConfirmation !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm');
      return;
    }
    
    if (!selectedItem || !selectedItem.id) {
      setDeleteError('No item selected for deletion');
      return;
    }
    
    setDeleting(true);
    setDeleteError(null);
    
    try {
      const response = await fetch(`/api/mongodb-queue/${selectedItem.id}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (response.ok) {
        console.log('Delete successful:', result);
        
        // Close the dialog
        setDeleteDialogOpen(false);
        
        // Remove the item from the queue list
        setQueueItems(prev => prev.filter(item => item.id !== selectedItem.id));
        
        // If the details dialog for this item is open, close it too
        if (dialogOpen && selectedItem && selectedItem.id === selectedItem.id) {
          setDialogOpen(false);
        }
      } else {
        setDeleteError(result.message || 'Failed to delete submission');
      }
    } catch (error) {
      console.error('Error deleting submission:', error);
      setDeleteError(`Error: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };
  
  // Function to handle delete dialog close
  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setDeleteConfirmation('');
    setDeleteError(null);
  };
  
  // No longer needed as we removed the dialog
  // But keeping a simplified version in case it's still referenced elsewhere
  const handleCloseLetterDialog = () => {
    setSelectedQuarter('');
  };
  
  return (
    <Paper elevation={3} sx={{ 
      p: 2, 
      height: '100%', 
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">
          Processing Queue
        </Typography>
        <Box display="flex" alignItems="center">
          <IconButton 
            size="small" 
            onClick={fetchQueue} 
            title="Refresh Queue"
          >
            <Refresh />
          </IconButton>
        </Box>
      </Box>
      
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
                  <Box display="flex">
                    <Tooltip title="View Details">
                      <IconButton 
                        edge="end" 
                        onClick={() => handleItemClick(item)}
                        sx={{ mr: 1 }}
                      >
                        <Info />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Submission">
                      <IconButton 
                        edge="end" 
                        color="error"
                        onClick={(e) => handleOpenDeleteDialog(item, e)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
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
                      {getStatusChip(item)}
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
                      {item.reportPath && (
                        <Typography variant="caption" display="block" color="primary">
                          Report available: {getFilenameFromPath(item.reportPath)}
                        </Typography>
                      )}
                      {item.submissionData?.report?.qualificationData?.qualifyingQuarters?.length > 0 && (
                        <Box>
                          <Typography variant="caption" display="block" sx={{ color: 'green' }}>
                            Qualifying Quarters: {item.submissionData.report.qualificationData.qualifyingQuarters.join(', ')}
                          </Typography>
                          
                          {/* Generate Letter buttons for each qualifying quarter */}
                          <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                            {item.submissionData.report.qualificationData.qualifyingQuarters.map(quarter => {
                              const isProcessed = item.submissionData?.processedQuarters?.includes(quarter);
                              return (
                                <Chip
                                  key={quarter}
                                  label={quarter}
                                  size="small"
                                  color={isProcessed ? "success" : "primary"}
                                  icon={isProcessed ? <CheckCircle fontSize="small" /> : <PostAdd fontSize="small" />}
                                  variant={isProcessed ? "outlined" : "filled"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGenerateLetter(item, quarter);
                                  }}
                                />
                              );
                            })}
                          </Box>
                        </Box>
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
                {getStatusChip(selectedItem)}
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
                      <TableRow>
                        <TableCell variant="head">Status</TableCell>
                        <TableCell>{selectedItem.status}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell variant="head">Timestamp</TableCell>
                        <TableCell>{new Date(selectedItem.timestamp).toLocaleString()}</TableCell>
                      </TableRow>
                      {selectedItem.reportPath && (
                        <TableRow>
                          <TableCell variant="head">Report Path</TableCell>
                          <TableCell>{selectedItem.reportPath}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

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

              {/* Qualification Analysis Section */}
              {selectedItem.submissionData?.report?.qualificationData && (
                <Box mt={3}>
                  <Typography variant="subtitle1" gutterBottom>
                    Qualification Analysis
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" gutterBottom>
                      <strong>Qualifying Quarters:</strong> {
                        selectedItem.submissionData.report.qualificationData.qualifyingQuarters.length > 0 
                          ? selectedItem.submissionData.report.qualificationData.qualifyingQuarters.join(', ') 
                          : 'None'
                      }
                    </Typography>
                    
                    {/* Buttons to generate letters for each qualifying quarter */}
                    {selectedItem.submissionData.report.qualificationData.qualifyingQuarters.length > 0 && (
                      <Box mt={2} mb={2}>
                        <Typography variant="subtitle2" gutterBottom>
                          Generate Letters:
                        </Typography>
                        <Box display="flex" flexWrap="wrap" gap={1}>
                          {selectedItem.submissionData.report.qualificationData.qualifyingQuarters.map(quarter => {
                            const isProcessed = selectedItem.submissionData?.processedQuarters?.includes(quarter);
                            return (
                              <Button
                                key={quarter}
                                variant={isProcessed ? "outlined" : "contained"}
                                color={isProcessed ? "success" : "primary"}
                                startIcon={isProcessed ? <CheckCircle /> : <PostAdd />}
                                onClick={() => handleGenerateLetter(selectedItem, quarter)}
                                size="small"
                              >
                                {isProcessed ? `${quarter} - Done` : `Generate ${quarter} Letter`}
                              </Button>
                            );
                          })}
                        </Box>
                      </Box>
                    )}
                    
                    {selectedItem.submissionData.report.qualificationData.quarterAnalysis && (
                      <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Quarter</TableCell>
                              <TableCell>2019 Revenue</TableCell>
                              <TableCell>2021 Revenue</TableCell>
                              <TableCell>Decrease %</TableCell>
                              <TableCell>Qualifies</TableCell>
                              <TableCell>Letter</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {selectedItem.submissionData.report.qualificationData.quarterAnalysis.map((quarter) => {
                              const isProcessed = selectedItem.submissionData?.processedQuarters?.includes(quarter.quarter);
                              return (
                                <TableRow key={quarter.quarter}>
                                  <TableCell>{quarter.quarter}</TableCell>
                                  <TableCell>${quarter.revenues.revenue2019.toLocaleString()}</TableCell>
                                  <TableCell>${quarter.revenues.revenue2021.toLocaleString()}</TableCell>
                                  <TableCell>{quarter.percentDecrease}%</TableCell>
                                  <TableCell>
                                    <Chip 
                                      label={quarter.qualifies ? "Yes" : "No"}
                                      color={quarter.qualifies ? "success" : "error"}
                                      size="small"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    {quarter.qualifies && (
                                      isProcessed ? 
                                        <Chip 
                                          label="Letter Generated"
                                          color="success"
                                          size="small"
                                          icon={<CheckCircle fontSize="small" />}
                                        /> :
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          startIcon={<PostAdd />}
                                          onClick={() => handleGenerateLetter(selectedItem, quarter.quarter)}
                                        >
                                          Generate
                                        </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Paper>
                </Box>
              )}

              {/* Excel Report Section */}
              {selectedItem.reportPath ? (
                <Box mt={3}>
                  <Typography variant="subtitle1" gutterBottom>
                    Generated Excel Report
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box display="flex" alignItems="center">
                        <TableChartOutlined sx={{ mr: 1, color: 'primary.main' }} />
                        <Typography>{getFilenameFromPath(selectedItem.reportPath)}</Typography>
                      </Box>
                      <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        startIcon={<CloudDownload />}
                        onClick={() => handleDownloadFile(selectedItem.reportPath)}
                      >
                        Download Excel Report
                      </Button>
                    </Box>
                  </Paper>
                </Box>
              ) : (
                <Box mt={3}>
                  <Alert severity="info">
                    No Excel report is available for this submission.
                  </Alert>
                </Box>
              )}

              {/* Debug section for reportPath */}
              <Box mt={3}>
                <Typography variant="subtitle1" gutterBottom>
                  Debug Information
                </Typography>
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography>Raw Data Structure</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box
                      component="pre"
                      sx={{
                        p: 2,
                        bgcolor: 'grey.100',
                        borderRadius: 1,
                        overflow: 'auto',
                        fontSize: '0.75rem',
                        maxHeight: '400px'
                      }}
                    >
                      {JSON.stringify(selectedItem.submissionData, null, 2)}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button 
                onClick={handleCloseDialog}
                variant="outlined"
              >
                Close
              </Button>
              <Button 
                onClick={(e) => handleOpenDeleteDialog(selectedItem, e)}
                variant="contained"
                color="error"
                startIcon={<DeleteIcon />}
              >
                Delete Submission
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        aria-labelledby="delete-dialog-title"
      >
        <DialogTitle id="delete-dialog-title" sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}>
          Confirm Deletion
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mt: 2, mb: 2 }}>
            Are you sure you want to delete this submission? This action cannot be undone.
          </DialogContentText>
          <DialogContentText sx={{ fontWeight: 'bold' }}>
            To confirm, please type DELETE in the field below:
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Type DELETE to confirm"
            fullWidth
            variant="outlined"
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.target.value)}
            error={!!deleteError}
            helperText={deleteError}
            sx={{ mt: 2 }}
          />
          {selectedItem && (
            <Box mt={3}>
              <Typography variant="subtitle2">Submission Details:</Typography>
              <Typography variant="body2">ID: {selectedItem.id}</Typography>
              <Typography variant="body2">Business: {selectedItem.businessName}</Typography>
              <Typography variant="body2">Date: {new Date(selectedItem.timestamp).toLocaleString()}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} variant="outlined">
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteConfirmation} 
            color="error" 
            variant="contained"
            disabled={deleteConfirmation !== 'DELETE' || deleting}
            startIcon={deleting ? <CircularProgress size={20} /> : <DeleteIcon />}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Letter Generation Dialog removed - letters are now generated immediately */}
    </Paper>
  );
};

export default QueueDisplay;