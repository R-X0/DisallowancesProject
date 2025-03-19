// client/src/components/QueueDisplay.js

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
  Info,
  Refresh,
  GavelOutlined,
  TrendingDownOutlined
} from '@mui/icons-material';

const QueueDisplay = () => {
  const [queueItems, setQueueItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0); // Added to track refreshes

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
          console.log('Queue data detail:', data.queue);
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

  // Force an immediate refresh
  const forceRefresh = () => {
    console.log('Forcing immediate queue refresh');
    // Update the refresh counter to trigger the effect
    setRefreshCount(prev => prev + 1);
    fetchQueue();
  };

  // Initial data load
  useEffect(() => {
    fetchQueue();

    // Set up polling for updates every 30 seconds
    const intervalId = setInterval(fetchQueue, 30000);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);
  
  // Additional effect to listen for refresh events from other components
  useEffect(() => {
    const handleRefreshEvent = () => {
      console.log('Refresh event received');
      forceRefresh();
    };
    
    // Add event listener
    window.addEventListener('refreshQueue', handleRefreshEvent);
    
    // Clean up
    return () => {
      window.removeEventListener('refreshQueue', handleRefreshEvent);
    };
  }, []);
  
  // Additional effect that runs when refreshCount changes
  useEffect(() => {
    if (refreshCount > 0) {
      console.log(`Running refresh #${refreshCount}`);
      fetchQueue();
    }
  }, [refreshCount]);

  // Helper function to format the timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get status chip based on status and processed quarters
  const getStatusChip = (item) => {
    // Log the item status and processed quarters for debugging
    console.log(`Status chip for ${item.id}:`, {
      status: item.status,
      processedQuarters: item.submissionData?.processedQuarters || [],
      totalQuarters: item.submissionData?.report?.qualificationData?.quarterAnalysis?.length || 0
    });
    
    const status = item.status;
    
    // FIXED: Get count of processed quarters from the right location
    const processedQuarters = item.submissionData?.processedQuarters || [];
    const processedCount = processedQuarters.length;
    
    // Use all quarters in the analysis, not just qualifying ones
    const totalCount = item.submissionData?.report?.qualificationData?.quarterAnalysis?.length || 0;
    
    // If no quarters in analysis, just show the basic status
    if (totalCount === 0) {
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
        case 'PDF done':
          return <Chip 
            icon={<CheckCircle fontSize="small" />} 
            label="PDF Done" 
            color="success" 
            size="small" 
          />;
        case 'mailed':
          return <Chip 
            icon={<CheckCircle fontSize="small" />} 
            label="Mailed" 
            color="success" 
            size="small" 
          />;
        default:
          return <Chip label={status} size="small" />;
      }
    }
    
    // Show letter count for all statuses when there are quarters to process
    if (processedCount >= totalCount && totalCount > 0) {
      return <Chip 
        icon={<CheckCircle fontSize="small" />} 
        label={`${processedCount}/${totalCount} Letters Complete`} 
        color="success" 
        size="small" 
      />;
    } else if (totalCount > 0) {
      return <Chip 
        icon={<AccessTime fontSize="small" />} 
        label={`${processedCount}/${totalCount} Letters`} 
        color="info" 
        size="small" 
      />;
    }
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
      
      // FIXED: Force a refresh after a successful update with a delay to ensure
      // the server has time to process the update
      setTimeout(() => {
        console.log("Force refresh after quarter update");
        forceRefresh();
      }, 1000);
      
      return result;
    } catch (error) {
      console.error('Error updating processed quarters:', error);
      // Fall back to local UI update
      console.log("Falling back to local UI update due to error");
      updateLocalUI(itemId, quarter);
      
      // FIXED: Still try to refresh after a delay
      setTimeout(() => {
        console.log("Force refresh after error recovery");
        forceRefresh();
      }, 1000);
      
      return { success: false, error: error.message };
    }
  };
  
  // Helper function to update local UI state
  const updateLocalUI = (itemId, quarter) => {
    console.log(`Updating local UI for item ${itemId}, quarter ${quarter}`);
    
    setQueueItems(prevItems => 
      prevItems.map(queueItem => {
        if (queueItem.id === itemId) {
          console.log(`Found matching item: ${queueItem.id}`);
          
          // Create a deep copy to avoid mutation issues
          const updatedItem = JSON.parse(JSON.stringify(queueItem));
          
          // FIXED: Ensure we have the necessary structure
          if (!updatedItem.submissionData) {
            updatedItem.submissionData = {};
          }
          
          // FIXED: Initialize processedQuarters if it doesn't exist
          if (!updatedItem.submissionData.processedQuarters) {
            updatedItem.submissionData.processedQuarters = [];
          }
          
          // Add the quarter if not already processed
          if (!updatedItem.submissionData.processedQuarters.includes(quarter)) {
            updatedItem.submissionData.processedQuarters.push(quarter);
            console.log(`Added ${quarter} to processedQuarters in UI state`);
            
            // Update status if needed
            const totalQuarters = updatedItem.submissionData?.report?.qualificationData?.quarterAnalysis?.length || 0;
            const processedCount = updatedItem.submissionData.processedQuarters.length;
            
            if (totalQuarters > 0 && processedCount === totalQuarters) {
              updatedItem.status = 'complete';
              console.log('Updated status to complete');
            } else if (processedCount > 0) {
              updatedItem.status = 'processing';
              console.log('Updated status to processing');
            }
          } else {
            console.log(`Quarter ${quarter} already in processedQuarters, no change needed`);
          }
          
          return updatedItem;
        }
        return queueItem;
      })
    );
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
      
      // Prepare business data for prefill
      const businessData = {
        businessName: item.businessName || 'Business Name Required',
        ein: item.submissionData?.originalData?.formData?.ein || '00-0000000',
        location: item.submissionData?.originalData?.formData?.location || 'Unknown Location, NY',
        businessWebsite: item.submissionData?.originalData?.formData?.businessWebsite || '',
        naicsCode: item.submissionData?.originalData?.formData?.naicsCode || '541110',
        timePeriods: [quarter],
        approach: approachToUse,
        timestamp: new Date().getTime(),
        submissionId: item.id
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
      
      console.log('Saving data to localStorage and sessionStorage:', businessData);
      
      // Store in BOTH localStorage and sessionStorage with a unique timestamp
      const dataString = JSON.stringify(businessData);
      localStorage.setItem('prefillData', dataString);
      sessionStorage.setItem('prefillData', dataString);
      
      // Update MongoDB to mark this quarter as processed immediately
      console.log("Updating MongoDB to mark quarter as processing");
      await updateProcessedQuarters(item.id, quarter);
      
      // Use a delay to ensure storage is written before navigation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // FIXED: Dispatch an event that other components can listen for
      window.dispatchEvent(new CustomEvent('refreshQueue'));
      
      // Navigate to the form - this will cause a reload, but sessionStorage will persist
      window.location.href = '/';
      
      // FIXED: Force a refresh after the navigation to ensure the queue updates
      setTimeout(() => {
        forceRefresh();
      }, 2000);
      
    } catch (error) {
      console.error('Error initiating letter generation:', error);
      alert("An error occurred. Please try again.");
      
      // Try to refresh the queue to recover
      setTimeout(() => {
        forceRefresh();
      }, 1000);
    }
  };

  // Function to close the dialog
  const handleCloseDialog = () => {
    setDialogOpen(false);
  };
  
  // Helper function to check if an item needs letters
  const needsLetters = (item) => {
    // FIXED: Use the correct path for processed quarters
    const quarterAnalysis = item.submissionData?.report?.qualificationData?.quarterAnalysis || [];
    const processedQuarters = item.submissionData?.processedQuarters || [];
    return quarterAnalysis.length > processedQuarters.length;
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
            onClick={forceRefresh} 
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
                        <TableCell variant="head" width="30%">Business Name</TableCell>
                        <TableCell>{selectedItem.businessName}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell variant="head">Timestamp</TableCell>
                        <TableCell>{new Date(selectedItem.timestamp).toLocaleString()}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              {/* Files Section removed as requested */}

              {/* Qualification Analysis Section */}
              {selectedItem.submissionData?.report?.qualificationData && (
                <Box mt={3}>
                  <Typography variant="subtitle1" gutterBottom>
                    Qualification Analysis
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" gutterBottom>
                      <strong>Qualifying Quarters by Revenue:</strong> {
                        selectedItem.submissionData.report.qualificationData.qualifyingQuarters?.length > 0 
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
                            {selectedItem.submissionData.report.qualificationData.quarterAnalysis.map((quarter, index) => {
                              // FIXED: Check the right place for processed quarters
                              const isProcessed = selectedItem.submissionData?.processedQuarters?.includes(quarter.quarter);
                              return (
                                <TableRow key={index}>
                                  <TableCell>{quarter.quarter}</TableCell>
                                  <TableCell>${(quarter.revenues?.revenue2019 || 0).toLocaleString()}</TableCell>
                                  <TableCell>${(quarter.revenues?.revenue2021 || 0).toLocaleString()}</TableCell>
                                  <TableCell>{quarter.percentDecrease || "0"}%</TableCell>
                                  <TableCell>
                                    <Chip 
                                      label={quarter.qualifies ? "Yes" : "No"}
                                      color={quarter.qualifies ? "success" : "error"}
                                      size="small"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    {isProcessed ? (
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
                                        Create Letter
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

              {/* Excel Report Section removed as requested */}
            </DialogContent>
            <DialogActions>
              <Button 
                onClick={handleCloseDialog}
                variant="outlined"
              >
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Paper>
  );
};

export default QueueDisplay;