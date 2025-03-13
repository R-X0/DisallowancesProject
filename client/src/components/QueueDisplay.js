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
  Chip
} from '@mui/material';
import { AccessTime, CheckCircle, HourglassEmpty } from '@mui/icons-material';

// This component will display the queue of submissions waiting to be processed
const QueueDisplay = () => {
  const [queueItems, setQueueItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
              status: 'waiting'
            },
            { 
              id: 'ERC-67890', 
              businessName: 'Widget Industries', 
              timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
              status: 'processing'
            },
            { 
              id: 'ERC-ABCDE', 
              businessName: 'Tech Solutions Inc', 
              timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
              status: 'complete'
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
              <ListItem alignItems="flex-start">
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
                    </>
                  }
                />
              </ListItem>
            </React.Fragment>
          ))}
        </List>
      )}
    </Paper>
  );
};

export default QueueDisplay;