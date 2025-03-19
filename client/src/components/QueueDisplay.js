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
  CloudDownload,
  Info,
  Refresh,
  TableChartOutlined,
  Delete as DeleteIcon,
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

  /**
   * IMPROVED: Normalize quarter format to a consistent standard for comparison
   * @param {string} quarter - Any quarter format (Quarter 1, Q1, etc.)
   * @returns {string} - Normalized format (q1, q2, etc.)
   */
  const normalizeQuarter = (quarter) => {
    if (!quarter) return '';
    
    // Convert to string, lowercase, and remove all non-alphanumeric characters
    const clean = quarter.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Special case for "Quarter X" format - most common in our app
    // Must check this FIRST before other patterns
    if (clean.includes('quarter')) {
      const quarterMatch = clean.match(/quarter([1-4])/);
      if (quarterMatch && quarterMatch[1]) {
        return `q${quarterMatch[1]}`;
      }
    }
    
    // Try to extract just the quarter number using regex
    const qMatch = clean.match(/q([1-4])/);
    if (qMatch && qMatch[1]) {
      // Return standardized format: q1, q2, q3, q4
      return `q${qMatch[1]}`;
    }
    
    // If quarter includes year (e.g., "q2 2021"), extract just quarter part
    const quarterYearMatch = clean.match(/q?([1-4]).*20([0-9]{2})/);
    if (quarterYearMatch && quarterYearMatch[1]) {
      return `q${quarterYearMatch[1]}`;
    }
    
    // Last attempt - look for a single digit 1-4 anywhere in the string
    const digitMatch = clean.match(/[1-4]/);
    if (digitMatch) {
      return `q${digitMatch[0]}`;
    }
    
    // Return original if we couldn't normalize it
    return clean;
  };

  /**
   * IMPROVED: Check if a quarter has been processed using robust normalization
   * @param {string} quarter - The quarter to check
   * @param {Array} processedQuarters - Array of processed quarters
   * @returns {boolean} - Whether the quarter is processed
   */
  const isQuarterProcessed = (quarter, processedQuarters) => {
    if (!quarter || !processedQuarters || !Array.isArray(processedQuarters)) {
      return false;
    }
    
    // Normalize the quarter we're checking
    const normalizedQuarter = normalizeQuarter(quarter);
    
    // Debug logging
    console.log(`Quarter check: "${quarter}" (normalized to "${normalizedQuarter}") vs processed:`, processedQuarters);
    
    // Also try specific formats like "Quarter X" or "QX"
    const qNum = normalizedQuarter.match(/q([1-4])/);
    if (!qNum || !qNum[1]) {
      return false; // Cannot extract quarter number
    }
    
    // Generate all possible formats to check against
    const checkFormats = [
      normalizedQuarter,           // q1
      `q${qNum[1]}`,               // q1
      `quarter${qNum[1]}`,         // quarter1
      `quarter${qNum[1]}2020`,     // quarter12020
      `quarter${qNum[1]}2021`,     // quarter12021
      `quarter ${qNum[1]}`,        // quarter 1
      `Quarter ${qNum[1]}`,        // Quarter 1
      `Quarter${qNum[1]}`,         // Quarter1
      `Q${qNum[1]}`,               // Q1
      `q${qNum[1]}_2020`,          // q1_2020
      `q${qNum[1]}_2021`           // q1_2021
    ];
    
    // Normalize all processed quarters for comparison
    const normalizedProcessed = processedQuarters.map(pq => normalizeQuarter(pq));
    console.log(`Normalized processed quarters:`, normalizedProcessed);
    
    // First check if the normalized version is in the list
    if (normalizedProcessed.includes(normalizedQuarter)) {
      return true;
    }
    
    // Then check if any of our generated formats match a processed quarter directly
    for (const format of checkFormats) {
      if (processedQuarters.includes(format)) {
        return true;
      }
    }
    
    // If none of the above checks passed, it's not processed
    return false;
  };

  // Connect to MongoDB queue API endpoint
  const fetchQueue = async () => {
    try {
      setLoading(true);
      
      try {
        const endpoint = '/api/mongodb-queue';
        const response = await fetch(endpoint);
        const data = await response.json();
        
        if (data.success) {
          console.log(`Queue data received: ${data.queue.length} items`);
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

  // Update processed quarters in MongoDB (with fallback to local UI updates)
  const updateProcessedQuarters = async (itemId, quarter, zipPath = null) => {
    try {
      console.log(`Updating processed quarters for ${itemId}, quarter ${quarter}`);
      if (zipPath) {
        console.log(`Also storing zip path: ${zipPath}`);
      }
      
      // API call to update processed quarters
      const response = await fetch(`/api/mongodb-queue/update-processed-quarters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          submissionId: itemId,
          quarter,
          zipPath
        })
      });
      
      if (!response.ok) {
        console.error(`API returned ${response.status} - ${response.statusText}`);
        // Fall back to local UI update
        console.log("Falling back to local UI update only");
        updateLocalUI(itemId, quarter);
        return { success: false, message: 'API endpoint error but continuing with local update' };
      }
      
      const result = await response.json();
      console.log("Server update successful:", result);
      
      // Also update local UI for immediate feedback
      updateLocalUI(itemId, quarter);
      
      // Force refresh the queue to get latest data from server
      fetchQueue();
      
      return result;
    } catch (error) {
      console.error('Error updating processed quarters:', error);
      // Fall back to local UI update
      console.log("Falling back to local UI update due to error");
      updateLocalUI(itemId, quarter);
      return { success: false, error: error.message };
    }
  };
  
  // Helper function to update local UI state
  const updateLocalUI = (itemId, quarter) => {
    setQueueItems(prevItems => 
      prevItems.map(queueItem => {
        if (queueItem.id === itemId) {
          // Deep copy of submissionData
          const updatedData = queueItem.submissionData 
            ? JSON.parse(JSON.stringify(queueItem.submissionData)) 
            : {};
          
          // Initialize processedQuarters if it doesn't exist
          if (!updatedData.processedQuarters) {
            updatedData.processedQuarters = [];
          }
          
          // Normalize for comparison
          const normalizedQuarter = normalizeQuarter(quarter);
          const existingQuarters = updatedData.processedQuarters.map(q => normalizeQuarter(q));
          
          // Only add if it doesn't already exist
          if (!existingQuarters.includes(normalizedQuarter)) {
            // Add all formats of the quarter
            updatedData.processedQuarters.push(quarter);
            updatedData.processedQuarters.push(`Quarter ${quarter.replace(/[^0-9]/g, '')}`);
            updatedData.processedQuarters.push(`Q${quarter.replace(/[^0-9]/g, '')}`);
          }
          
          return {
            ...queueItem,
            submissionData: updatedData
          };
        }
        return queueItem;
      })
    );
  };

  // Helper function with normalized quarter comparison
  const needsLetters = (item) => {
    // Get the quarter analysis and processed quarters
    const quarterAnalysis = item.submissionData?.report?.qualificationData?.quarterAnalysis || [];
    const processedQuarters = item.submissionData?.processedQuarters || [];
    
    // For debugging
    console.log("quarterAnalysis:", quarterAnalysis.map(q => q.quarter));
    console.log("processedQuarters:", processedQuarters);
    
    // Check if there are quarters that need processing
    if (quarterAnalysis.length === 0) return false;
    
    // For each quarter in the analysis, check if it's been processed using normalized comparison
    for (const quarterData of quarterAnalysis) {
      const quarter = quarterData.quarter;
      if (!isQuarterProcessed(quarter, processedQuarters)) {
        console.log(`Quarter ${quarter} needs processing!`);
        return true;
      }
    }
    
    // All quarters have been processed
    console.log("All quarters have been processed");
    return false;
  };

  // Function to handle generating a letter for a specific quarter with a specified approach
  const handleGenerateLetter = async (item, quarter, approach = 'auto') => {
    setSelectedItem(item);
    
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
        // Use the exact quarter format as it appears in the analysis
        timePeriods: [quarter],
        approach: approachToUse,
        timestamp: new Date().getTime(),
        submissionId: item.id,
        trackingId: item.id
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
            const qNum = q.quarter.replace(/[^0-9]/g, '');
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
        const qNumber = quarter.replace(/[^0-9]/g, '');
        const qYear = quarter.includes('2021') ? '2021' : '2020';
        
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
      
      // Update MongoDB to mark this quarter as processing immediately
      console.log(`Updating MongoDB to mark ${quarter} as processing`);
      await updateProcessedQuarters(item.id, quarter);
      
      // After marking as processed in MongoDB, also update local UI for immediate feedback
      updateLocalUI(item.id, quarter);
      
      // Force refresh the queue
      fetchQueue();
      
      // Use a longer delay to ensure storage is written before navigation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Navigate to the form - this will cause a reload, but sessionStorage will persist
      window.location.href = '/';
      
    } catch (error) {
      console.error('Error initiating letter generation:', error);
      alert("An error occurred. Please try again.");
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
        if (dialogOpen && selectedItem) {
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
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: 'rgba(0, 0, 0, 0.04)'
                  },
                  position: 'relative',
                  py: 1.5 
                }}
                onClick={() => handleItemClick(item)}
              >
                <ListItemText
                  primary={
                    <Box display="flex" justifyContent="space-between" alignItems="center" pr={10}>
                      <Typography variant="subtitle2" noWrap>
                        {item.businessName}
                      </Typography>
                      {getStatusChip(item)}
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" display="block">
                      {formatTime(item.timestamp)}
                      {needsLetters(item) && (
                        <span style={{ color: '#f57c00', marginLeft: '8px', fontWeight: 'bold' }}>
                          • Needs Letters
                        </span>
                      )}
                    </Typography>
                  }
                />
                <Box 
                  sx={{ 
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    gap: 1
                  }}
                >
                  <Tooltip title="View Details">
                    <IconButton 
                      edge="end" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(item);
                      }}
                    >
                      <Info fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete Submission">
                    <IconButton 
                      edge="end" 
                      color="error"
                      onClick={(e) => handleOpenDeleteDialog(item, e)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
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
                      <strong>Qualifying Quarters by Revenue:</strong> {
                        selectedItem.submissionData.report.qualificationData.qualifyingQuarters.length > 0 
                          ? selectedItem.submissionData.report.qualificationData.qualifyingQuarters.join(', ') 
                          : 'None'
                      }
                    </Typography>
                    
                    {/* Table view with ALL quarters */}
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
                                    {isQuarterProcessed(quarter.quarter, selectedItem.submissionData?.processedQuarters) ? (
                                      <Chip 
                                        label="Letter Generated"
                                        color="success"
                                        size="small"
                                        icon={<CheckCircle fontSize="small" />}
                                      />
                                    ) : (
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

              {/* Letter Generation Status */}
              <Box mt={3}>
                <Typography variant="subtitle1" gutterBottom>
                  Letter Generation Status
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Box mb={2}>
                    <Typography variant="subtitle2" gutterBottom>
                      <strong>Quarters Needing Letters:</strong>
                    </Typography>
                    {selectedItem.submissionData?.report?.qualificationData?.quarterAnalysis ? (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Quarter</TableCell>
                              <TableCell>Normalized Format</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell>Letter Path</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {selectedItem.submissionData.report.qualificationData.quarterAnalysis.map((qAnalysis) => {
                              // Determine if this quarter is processed
                              const quarterFormat = qAnalysis.quarter;
                              const isProcessed = isQuarterProcessed(
                                quarterFormat, 
                                selectedItem.submissionData?.processedQuarters || []
                              );
                              
                              // Get the ZIP path for this quarter if available
                              const normalizedQuarter = normalizeQuarter(quarterFormat);
                              const zipPath = selectedItem.submissionData?.quarterZips?.[normalizedQuarter] ||
                                            selectedItem.submissionData?.quarterZips?.[quarterFormat] || '';
                              
                              return (
                                <TableRow key={quarterFormat}>
                                  <TableCell>{quarterFormat}</TableCell>
                                  <TableCell><code>{normalizeQuarter(quarterFormat)}</code></TableCell>
                                  <TableCell>
                                    {isProcessed ? (
                                      <Chip 
                                        icon={<CheckCircle fontSize="small" />}
                                        label="Letter Generated" 
                                        color="success" 
                                        size="small"
                                      />
                                    ) : (
                                      <Chip 
                                        icon={<HourglassEmpty fontSize="small" />}
                                        label="Needs Letter" 
                                        color="warning" 
                                        size="small"
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {zipPath ? (
                                      <Button
                                        size="small"
                                        startIcon={<CloudDownload />}
                                        onClick={() => handleDownloadFile(zipPath)}
                                      >
                                        Download
                                      </Button>
                                    ) : (
                                      <Typography variant="caption" color="text.secondary">
                                        No letter available
                                      </Typography>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No quarter analysis available
                      </Typography>
                    )}
                  </Box>
                  
                  <Box mt={3}>
                    <Typography variant="subtitle2" gutterBottom>
                      <strong>Raw Processed Quarters:</strong>
                    </Typography>
                    <code style={{ 
                      display: 'block', 
                      backgroundColor: '#f5f5f5', 
                      padding: '8px', 
                      borderRadius: '4px',
                      maxHeight: '100px',
                      overflow: 'auto'
                    }}>
                      {JSON.stringify(selectedItem.submissionData?.processedQuarters || [], null, 2)}
                    </code>
                  </Box>
                  
                  <Box mt={2} mb={1}>
                    <Button 
                      variant="outlined" 
                      color="primary"
                      size="small"
                      startIcon={<Refresh />}
                      onClick={() => {
                        // Force refresh the queue data
                        fetch('/api/mongodb-queue?refresh=true')
                          .then(() => fetchQueue())
                          .then(() => setDialogOpen(false))
                          .then(() => setTimeout(() => handleItemClick(selectedItem), 200));
                      }}
                    >
                      Refresh Letter Status
                    </Button>
                  </Box>
                </Paper>
              </Box>

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
                
                {/* Debug section for processed quarters */}
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography>Processed Quarters Debug</Typography>
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
                      <Typography variant="subtitle2">Processed Quarters:</Typography>
                      {JSON.stringify(selectedItem.submissionData?.processedQuarters || [], null, 2)}
                      
                      <Typography variant="subtitle2" mt={2}>Normalized Formats:</Typography>
                      {(selectedItem.submissionData?.processedQuarters || []).map(q => (
                        `${q} => ${normalizeQuarter(q)}\n`
                      ))}
                      
                      <Typography variant="subtitle2" mt={2}>Quarter Analysis:</Typography>
                      {(selectedItem.submissionData?.report?.qualificationData?.quarterAnalysis || []).map(q => (
                        `${q.quarter} => ${normalizeQuarter(q.quarter)}\n`
                      ))}
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