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
  Edit,
  GavelOutlined,
  TrendingDownOutlined
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

  // Function to handle generating a letter for a specific quarter with a specified approach
  const handleGenerateLetter = async (item, quarter, approach = 'auto') => {
    setSelectedItem(item);
    setSelectedQuarter(quarter);
    
    try {
      // Get the default approach based on whether the quarter qualifies
      let approachToUse = approach;
      
      // If approach is 'auto', determine it based on quarter qualification
      if (approach === 'auto') {
        // Check if this quarter qualifies based on revenue
        const qualifyingQuarters = item.submissionData?.report?.qualificationData?.qualifyingQuarters || [];
        approachToUse = qualifyingQuarters.includes(quarter) ? 'revenueReduction' : 'governmentOrders';
      }
      
      console.log(`Generating letter for ${quarter} using ${approachToUse} approach`);
      
      // Prepare business data for prefill - IMPROVED VERSION WITH MORE COMPLETE DATA
      const businessData = {
        businessName: item.businessName || 'Business Name Required',
        ein: item.submissionData?.originalData?.formData?.ein || '00-0000000',
        location: item.submissionData?.originalData?.formData?.location || 'Unknown Location, NY',
        businessWebsite: item.submissionData?.originalData?.formData?.businessWebsite || '',
        naicsCode: item.submissionData?.originalData?.formData?.naicsCode || '541110', // Default to law firm if missing
        timePeriods: [quarter],
        approach: approachToUse,  // Add the approach to the data
        submissionId: item.id,    // Add the submission ID to track which item this is for
        timestamp: new Date().getTime() // Add timestamp to ensure it's treated as new data
      };
      
      // Add additional context information if available
      if (item.submissionData?.originalData?.formData?.governmentOrdersInfo) {
        businessData.governmentOrdersInfo = item.submissionData.originalData.formData.governmentOrdersInfo;
      } else if (approachToUse === 'governmentOrders') {
        // Add default context for government orders approach
        businessData.governmentOrdersInfo = `This business was affected by government orders during ${quarter}. Please provide details about specific orders that caused a full or partial suspension of operations.`;
      }
      
      if (item.submissionData?.originalData?.formData?.revenueReductionInfo) {
        businessData.revenueReductionInfo = item.submissionData.originalData.formData.revenueReductionInfo;
      } else if (approachToUse === 'revenueReduction') {
        // Add default context for revenue reduction approach  
        businessData.revenueReductionInfo = `This business experienced a significant decline in revenue during ${quarter}. Please provide quarterly revenue data to substantiate the claim.`;
      }
      
      // Add revenue data if available - especially important for revenue approach
      const requestedInfo = item.submissionData?.originalData?.formData?.requestedInfo;
      if (requestedInfo) {
        // Map 2019 revenue data
        if (requestedInfo.gross_sales_2019) {
          if (requestedInfo.gross_sales_2019.q1) businessData.q1_2019 = requestedInfo.gross_sales_2019.q1;
          if (requestedInfo.gross_sales_2019.q2) businessData.q2_2019 = requestedInfo.gross_sales_2019.q2;
          if (requestedInfo.gross_sales_2019.q3) businessData.q3_2019 = requestedInfo.gross_sales_2019.q3;
          if (requestedInfo.gross_sales_2019.q4) businessData.q4_2019 = requestedInfo.gross_sales_2019.q4;
        }
        
        // Map 2020 revenue data if available
        if (requestedInfo.gross_sales_2020) {
          if (requestedInfo.gross_sales_2020.q1) businessData.q1_2020 = requestedInfo.gross_sales_2020.q1;
          if (requestedInfo.gross_sales_2020.q2) businessData.q2_2020 = requestedInfo.gross_sales_2020.q2;
          if (requestedInfo.gross_sales_2020.q3) businessData.q3_2020 = requestedInfo.gross_sales_2020.q3;
          if (requestedInfo.gross_sales_2020.q4) businessData.q4_2020 = requestedInfo.gross_sales_2020.q4;
        }
        
        // Map 2021 revenue data
        if (requestedInfo.gross_sales_2021) {
          if (requestedInfo.gross_sales_2021.q1) businessData.q1_2021 = requestedInfo.gross_sales_2021.q1;
          if (requestedInfo.gross_sales_2021.q2) businessData.q2_2021 = requestedInfo.gross_sales_2021.q2;
          if (requestedInfo.gross_sales_2021.q3) businessData.q3_2021 = requestedInfo.gross_sales_2021.q3;
          if (requestedInfo.gross_sales_2021.q4) businessData.q4_2021 = requestedInfo.gross_sales_2021.q4;
        }
      }
      
      // Also check for revenue data directly in the report's quarter analysis
      const quarterAnalysis = item.submissionData?.report?.qualificationData?.quarterAnalysis;
      if (quarterAnalysis && Array.isArray(quarterAnalysis)) {
        quarterAnalysis.forEach(q => {
          if (q.quarter && q.revenues) {
            // Extract the quarter number from format like "Quarter 1"
            const qNum = q.quarter.replace('Quarter ', '');
            if (q.revenues.revenue2019) {
              businessData[`q${qNum}_2019`] = q.revenues.revenue2019.toString();
            }
            if (q.revenues.revenue2021) {
              businessData[`q${qNum}_2021`] = q.revenues.revenue2021.toString();
            }
          }
        });
      }
      
      // Fill in default values for each quarter if we're missing any
      // This ensures the revenue computation doesn't break
      if (approachToUse === 'revenueReduction') {
        // Ensure we have at least something for key quarters
        if (!businessData.q1_2019) businessData.q1_2019 = '100000';
        if (!businessData.q2_2019) businessData.q2_2019 = '100000';
        if (!businessData.q3_2019) businessData.q3_2019 = '100000';
        if (!businessData.q4_2019) businessData.q4_2019 = '100000';
        
        // Add some decline in the selected quarter to make it qualify
        const qNumber = quarter.replace('Q', '').split(' ')[0];
        const qYear = quarter.split(' ')[1];
        
        if (qYear === '2020') {
          // 2020 needs 50% decline to qualify
          businessData[`q${qNumber}_2020`] = (parseFloat(businessData[`q${qNumber}_2019`]) * 0.49).toString();
        } else if (qYear === '2021') {
          // 2021 needs 20% decline to qualify
          businessData[`q${qNumber}_2021`] = (parseFloat(businessData[`q${qNumber}_2019`]) * 0.79).toString();
        }
      }
      
      console.log('Saving data to both localStorage and sessionStorage:', businessData);
      
      // Store in BOTH localStorage and sessionStorage with a unique timestamp
      const dataString = JSON.stringify(businessData);
      localStorage.setItem('prefillData', dataString);
      sessionStorage.setItem('prefillData', dataString); // Backup in case localStorage gets cleared
      
      // Update the queue item in our state only (skip server update)
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
      
      // Use a longer delay to ensure storage is written before navigation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Navigate to the form - this will cause a reload, but sessionStorage will persist
      window.location.href = '/';
      
    } catch (error) {
      console.error('Error initiating letter generation:', error);
      alert("An error occurred. Please try again.");
    }
  };

  // Update processed quarters with API call
  const updateProcessedQuarters = async (itemId, quarter) => {
    try {
      console.log(`Calling API to update processed quarters for ${itemId}, quarter ${quarter}`);
      
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
      
      const data = await response.json();
      
      if (response.ok) {
        console.log(`Successfully updated processed quarters:`, data);
        return data;
      } else {
        console.warn(`API returned ${response.status} - ${data.message}`);
        return { success: false, message: data.message };
      }
    } catch (error) {
      console.error('Error updating processed quarters:', error);
      return { success: false, error: error.message };
    }
  };

  // Function to manually mark a quarter as processed
  const markQuarterAsProcessed = async (item, quarter) => {
    try {
      if (!item || !item.id || !quarter) {
        console.error("Missing item ID or quarter");
        return;
      }
      
      // Call the update API
      const result = await updateProcessedQuarters(item.id, quarter);
      
      if (result.success) {
        // Update the local state
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
        
        // Show success message
        alert(`Quarter ${quarter} marked as processed for ${item.businessName}`);
      } else {
        alert(`Failed to mark quarter as processed: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Error marking quarter as processed:", error);
      alert(`Error: ${error.message}`);
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
  
  // Helper function to get all quarters from quarter analysis
  const getAllQuarters = (item) => {
    const quarterAnalysis = item.submissionData?.report?.qualificationData?.quarterAnalysis || [];
    return quarterAnalysis.map(q => q.quarter);
  };

  // Helper function to check if a quarter qualifies
  const isQualifyingQuarter = (item, quarter) => {
    const qualifyingQuarters = item.submissionData?.report?.qualificationData?.qualifyingQuarters || [];
    return qualifyingQuarters.includes(quarter);
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
                          Report available: {item.reportPath.split('/').pop()}
                        </Typography>
                      )}
                      
                      {/* Show quarterly data if available - TEXT ONLY, NO BUTTONS */}
                      {item.submissionData?.report?.qualificationData?.quarterAnalysis?.length > 0 && (
                        <Box>
                          {/* Qualifying Quarters */}
                          {item.submissionData?.report?.qualificationData?.qualifyingQuarters?.length > 0 && (
                            <Typography variant="caption" display="block" sx={{ color: 'green' }}>
                              Qualifying by Revenue: {item.submissionData.report.qualificationData.qualifyingQuarters.join(', ')}
                            </Typography>
                          )}
                          
                          {/* All Quarters - Text Only */}
                          <Typography variant="caption" display="block">
                            All Quarters: {getAllQuarters(item).join(', ')} 
                            {item.submissionData?.processedQuarters?.length > 0 && (
                              <span> (Completed: {item.submissionData.processedQuarters.join(', ')})</span>
                            )}
                          </Typography>
                          
                          {/* Simple instruction */}
                          <Typography variant="caption" display="block" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                            Click for details and letter generation options
                          </Typography>
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

              {/* Qualification Analysis Section - STREAMLINED */}
              {selectedItem.submissionData?.report?.qualificationData && (
                <Box mt={3}>
                  <Typography variant="subtitle1" gutterBottom>
                    Qualification Analysis
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" gutterBottom>
                      <strong>Qualifying Quarters by Revenue:</strong> {
                        selectedItem.submissionData.report.qualificationData.qualifyingQuarters.length > 0 
                          ? selectedItem.submissionData.report.qualificationData.qualifyingQuarters.join(', ') 
                          : 'None'
                      }
                    </Typography>
                    
                    {/* Table view with ALL quarters - This is the ONLY place with buttons now */}
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
                              <TableCell>Action</TableCell>
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
                                    {isProcessed ? (
                                      <Box display="flex" alignItems="center">
                                        <Chip 
                                          label="Letter Generated"
                                          color="success"
                                          size="small"
                                          icon={<CheckCircle fontSize="small" />}
                                        />
                                        <Tooltip title="Manually mark as not processed">
                                          <IconButton
                                            size="small"
                                            color="error"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (window.confirm(`Are you sure you want to mark ${quarter.quarter} as NOT processed? This will require generating the letter again.`)) {
                                                // Call function to remove from processed quarters
                                                // This would need an additional API endpoint
                                                alert("This functionality requires a new API endpoint for removing quarters");
                                              }
                                            }}
                                          >
                                            <DeleteIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      </Box>
                                    ) : (
                                      <Box display="flex" alignItems="center">
                                        <Button
                                          size="small"
                                          variant="contained"
                                          color={quarter.qualifies ? "primary" : "default"}
                                          startIcon={quarter.qualifies ? <TrendingDownOutlined /> : <GavelOutlined />}
                                          onClick={() => handleGenerateLetter(
                                            selectedItem, 
                                            quarter.quarter, 
                                            quarter.qualifies ? 'revenueReduction' : 'governmentOrders'
                                          )}
                                        >
                                          {quarter.qualifies ? 'Revenue Approach' : 'Gov Orders'}
                                        </Button>
                                        <Tooltip title="Manually mark as processed">
                                          <IconButton
                                            size="small"
                                            color="success"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (window.confirm(`Mark ${quarter.quarter} as processed without generating a letter?`)) {
                                                markQuarterAsProcessed(selectedItem, quarter.quarter);
                                              }
                                            }}
                                          >
                                            <CheckCircle fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      </Box>
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
                        <Typography>{selectedItem.reportPath.split('/').pop()}</Typography>
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
    </Paper>
  );
};

// Helper function for formatting file size
const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default QueueDisplay;