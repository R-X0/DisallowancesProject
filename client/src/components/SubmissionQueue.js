import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, List, ListItem, ListItemText, 
  Paper, Divider, Chip, IconButton,
  ListItemSecondaryAction, Tooltip, CircularProgress,
  Alert
} from '@mui/material';
import { 
  Refresh, Delete, PlayArrow, Edit,
  AccessTime as TimeIcon
} from '@mui/icons-material';
import axios from 'axios';

const SubmissionQueue = ({ onLoadSubmission }) => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Function to fetch submissions for the queue
  const fetchSubmissions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get('/api/erc-protest/queue/submissions');
      
      if (response.data && response.data.success) {
        setSubmissions(response.data.submissions);
      } else {
        setError('Failed to load submissions');
      }
    } catch (err) {
      console.error('Error fetching submissions:', err);
      setError('Error loading queue. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load submissions on component mount
  useEffect(() => {
    fetchSubmissions();
    
    // Set up auto-refresh every 60 seconds
    const interval = setInterval(() => {
      fetchSubmissions();
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Handle loading a submission for viewing/continuing
  const handleLoadSubmission = async (submissionId) => {
    try {
      const response = await axios.get(`/api/erc-protest/queue/submission/${submissionId}`);
      
      if (response.data && response.data.success) {
        // Call the parent component's handler with the submission data
        onLoadSubmission(response.data.submission);
      } else {
        setError('Failed to load submission details');
      }
    } catch (err) {
      console.error('Error loading submission details:', err);
      setError('Error loading submission details. Please try again.');
    }
  };

  // Handle editing a submission (go to first step)
  const handleEditSubmission = async (submissionId) => {
    try {
      const response = await axios.get(`/api/erc-protest/queue/submission/${submissionId}`);
      
      if (response.data && response.data.success) {
        // Call the parent component's handler with the submission data and edit flag
        onLoadSubmission(response.data.submission, true);
      } else {
        setError('Failed to load submission for editing');
      }
    } catch (err) {
      console.error('Error loading submission for editing:', err);
      setError('Error loading submission for editing. Please try again.');
    }
  };

  // Handle deleting a submission
  const handleDeleteSubmission = async (submissionId) => {
    if (!window.confirm('Are you sure you want to remove this submission from the queue?')) {
      return;
    }
    
    try {
      const response = await axios.delete(`/api/erc-protest/queue/submission/${submissionId}`);
      
      if (response.data && response.data.success) {
        // Remove from local state
        setSubmissions(prevSubmissions => 
          prevSubmissions.filter(sub => sub.submissionId !== submissionId)
        );
      } else {
        setError('Failed to delete submission');
      }
    } catch (err) {
      console.error('Error deleting submission:', err);
      setError('Error deleting submission. Please try again.');
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Gathering data':
        return 'default';
      case 'LLM pass #1 complete':
        return 'info';
      case 'Links verified':
        return 'warning';
      case 'PDF done':
        return 'success';
      case 'mailed':
        return 'secondary';
      default:
        return 'default';
    }
  };

  return (
    <Paper 
      elevation={3} 
      sx={{ 
        p: 2, 
        display: 'flex', 
        flexDirection: 'column',
        height: '100%',
        minHeight: { xs: '400px', md: '600px' }
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="h6">Submission Queue</Typography>
        <Tooltip title="Refresh queue">
          <IconButton 
            size="small" 
            onClick={fetchSubmissions}
            disabled={loading}
          >
            <Refresh />
          </IconButton>
        </Tooltip>
      </Box>
      
      <Divider sx={{ mb: 2 }} />
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {loading ? (
        <Box display="flex" justifyContent="center" my={3}>
          <CircularProgress size={30} />
        </Box>
      ) : submissions.length === 0 ? (
        <Box textAlign="center" my={3}>
          <Typography variant="body2" color="text.secondary">
            No submissions in queue
          </Typography>
        </Box>
      ) : (
        <List 
          dense 
          sx={{ 
            overflowY: 'auto',
            flexGrow: 1,
            maxHeight: { xs: '300px', md: 'calc(100vh - 280px)' }
          }}
        >
          {submissions.map((submission) => (
            <React.Fragment key={submission.submissionId}>
              <ListItem 
                alignItems="flex-start"
                sx={{ py: 1 }}
              >
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center">
                      <Typography 
                        variant="subtitle2" 
                        noWrap 
                        sx={{ 
                          mr: 1, 
                          maxWidth: { xs: '120px', md: '150px' },
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {submission.businessName}
                      </Typography>
                      <Chip 
                        label={submission.status} 
                        size="small"
                        color={getStatusColor(submission.status)}
                        sx={{ ml: 'auto' }}
                      />
                    </Box>
                  }
                  secondary={
                    <React.Fragment>
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.primary"
                        sx={{ 
                          display: 'block',
                          fontSize: '0.75rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {submission.submissionId}
                      </Typography>
                      <Box display="flex" alignItems="center" mt={0.5}>
                        <TimeIcon fontSize="small" sx={{ mr: 0.5, fontSize: '0.75rem', color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(submission.lastUpdated)}
                        </Typography>
                        {submission.timePeriods && submission.timePeriods.length > 0 && (
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              ml: 1,
                              maxWidth: '100px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            • {submission.timePeriods.join(', ')}
                          </Typography>
                        )}
                      </Box>
                    </React.Fragment>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Edit submission (go to first step)">
                    <IconButton 
                      edge="end" 
                      aria-label="edit" 
                      size="small"
                      onClick={() => handleEditSubmission(submission.submissionId)}
                      sx={{ mr: 1 }}
                    >
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Load submission">
                    <IconButton 
                      edge="end" 
                      aria-label="load" 
                      size="small"
                      onClick={() => handleLoadSubmission(submission.submissionId)}
                      sx={{ mr: 1 }}
                    >
                      <PlayArrow fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete from queue">
                    <IconButton 
                      edge="end" 
                      aria-label="delete" 
                      size="small"
                      onClick={() => handleDeleteSubmission(submission.submissionId)}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
              <Divider component="li" />
            </React.Fragment>
          ))}
        </List>
      )}
    </Paper>
  );
};

export default SubmissionQueue;