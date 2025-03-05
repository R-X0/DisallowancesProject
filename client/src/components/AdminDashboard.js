import React, { useState, useEffect } from 'react';
import { 
  Container, Paper, Typography, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, 
  Button, TextField, Box, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip
} from '@mui/material';
import { 
  Refresh, CloudDownload, Edit, Check, Close,
  LocalShipping, Search, FilterList, Link
} from '@mui/icons-material';

const ERCAdminDashboard = () => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  
  // Fetch all submissions
  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/erc-protest/admin/submissions');
      const data = await response.json();
      
      if (response.ok) {
        setSubmissions(data.submissions);
      } else {
        console.error('Failed to fetch submissions:', data.message);
      }
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Initial data load
  useEffect(() => {
    fetchSubmissions();
  }, []);
  
  // Handle status filter change
  const handleStatusFilterChange = (status) => {
    setStatusFilter(status);
  };
  
  // Handle tracking number update
  const handleTrackingUpdate = async (submissionId) => {
    try {
      const response = await fetch(`/api/erc-protest/admin/update-tracking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          submissionId,
          trackingNumber,
          status: 'mailed'
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Update the local state
        setSubmissions(prevSubmissions => 
          prevSubmissions.map(submission => 
            submission.id === submissionId
              ? { ...submission, trackingNumber, status: 'mailed' }
              : submission
          )
        );
        setEditingId(null);
        setTrackingNumber('');
      } else {
        console.error('Failed to update tracking number:', data.message);
      }
    } catch (error) {
      console.error('Error updating tracking number:', error);
    }
  };
  
  // Open details dialog
  const openDetailsDialog = (submission) => {
    setSelectedSubmission(submission);
    setDialogOpen(true);
  };
  
  // Filter submissions based on search and status
  const filteredSubmissions = submissions.filter(submission => {
    const matchesSearch = 
      submission.businessName.toLowerCase().includes(filter.toLowerCase()) ||
      (submission.trackingId && submission.trackingId.toLowerCase().includes(filter.toLowerCase()));
    
    const matchesStatus = 
      statusFilter === 'all' || 
      submission.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });
  
  // Get status chip color
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
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h4">ERC Protest Admin Dashboard</Typography>
          <Button 
            variant="contained" 
            startIcon={<Refresh />}
            onClick={fetchSubmissions}
          >
            Refresh
          </Button>
        </Box>
        
        {/* Filters */}
        <Box display="flex" mb={3} gap={2}>
          <TextField
            label="Search business or tracking ID"
            variant="outlined"
            size="small"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            sx={{ flexGrow: 1 }}
            InputProps={{
              startAdornment: <Search color="action" sx={{ mr: 1 }} />,
            }}
          />
          
          <Box display="flex" alignItems="center">
            <FilterList color="action" sx={{ mr: 1 }} />
            <Typography variant="body2" sx={{ mr: 1 }}>Status:</Typography>
            {['all', 'Gathering data', 'LLM pass #1 complete', 'Links verified', 'PDF done', 'mailed'].map((status) => (
              <Chip
                key={status}
                label={status === 'all' ? 'All' : status}
                onClick={() => handleStatusFilterChange(status)}
                color={statusFilter === status ? 'primary' : 'default'}
                variant={statusFilter === status ? 'filled' : 'outlined'}
                size="small"
                sx={{ mr: 0.5 }}
              />
            ))}
          </Box>
        </Box>
        
        {/* Data Table */}
        {loading ? (
          <Box display="flex" justifyContent="center" my={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table aria-label="ERC submissions table">
              <TableHead>
                <TableRow>
                  <TableCell>Business Name</TableCell>
                  <TableCell>EIN</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Quarter</TableCell>
                  <TableCell>Tracking ID</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Updated</TableCell>
                  <TableCell>Package</TableCell>
                  <TableCell>Tracking #</TableCell>
                  <TableCell>Google Drive</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSubmissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} align="center">
                      No submissions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubmissions.map((submission) => (
                    <TableRow key={submission.trackingId}>
                      <TableCell>{submission.businessName}</TableCell>
                      <TableCell>{submission.ein}</TableCell>
                      <TableCell>{submission.location}</TableCell>
                      <TableCell>{submission.timePeriod}</TableCell>
                      <TableCell>{submission.trackingId}</TableCell>
                      <TableCell>
                        <Chip 
                          label={submission.status}
                          color={getStatusColor(submission.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(submission.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {submission.zipPath && (
                          <Tooltip title="Download package">
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => window.open(`/api/erc-protest/admin/download?path=${submission.zipPath}`, '_blank')}
                            >
                              <CloudDownload />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === submission.trackingId ? (
                          <Box display="flex" alignItems="center">
                            <TextField
                              size="small"
                              variant="outlined"
                              value={trackingNumber}
                              onChange={(e) => setTrackingNumber(e.target.value)}
                              placeholder="Enter tracking #"
                              sx={{ width: 150 }}
                            />
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => handleTrackingUpdate(submission.trackingId)}
                            >
                              <Check />
                            </IconButton>
                            <IconButton 
                              size="small" 
                              color="error"
                              onClick={() => {
                                setEditingId(null);
                                setTrackingNumber('');
                              }}
                            >
                              <Close />
                            </IconButton>
                          </Box>
                        ) : (
                          <Box display="flex" alignItems="center">
                            {submission.trackingNumber ? (
                              <>
                                <Typography variant="body2">
                                  {submission.trackingNumber}
                                </Typography>
                                <IconButton 
                                  size="small" 
                                  color="primary"
                                  onClick={() => {
                                    setEditingId(submission.trackingId);
                                    setTrackingNumber(submission.trackingNumber);
                                  }}
                                >
                                  <Edit fontSize="small" />
                                </IconButton>
                              </>
                            ) : (
                              <Button
                                size="small"
                                startIcon={<LocalShipping />}
                                variant="outlined"
                                onClick={() => {
                                  setEditingId(submission.trackingId);
                                  setTrackingNumber('');
                                }}
                                disabled={submission.status !== 'PDF done'}
                              >
                                Add Tracking
                              </Button>
                            )}
                          </Box>
                        )}
                      </TableCell>
                      <TableCell>
                        {submission.googleDriveLink && (
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => window.open(submission.googleDriveLink, '_blank')}
                          >
                            <Link />
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => openDetailsDialog(submission)}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      
      {/* Details Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        {selectedSubmission && (
          <>
            <DialogTitle>
              Submission Details: {selectedSubmission.businessName}
            </DialogTitle>
            <DialogContent dividers>
              <Typography variant="h6" gutterBottom>
                Basic Information
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell variant="head" width="30%">Business Name</TableCell>
                      <TableCell>{selectedSubmission.businessName}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell variant="head">EIN</TableCell>
                      <TableCell>{selectedSubmission.ein}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell variant="head">Location</TableCell>
                      <TableCell>{selectedSubmission.location}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell variant="head">Business Website</TableCell>
                      <TableCell>{selectedSubmission.businessWebsite}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell variant="head">NAICS Code</TableCell>
                      <TableCell>{selectedSubmission.naicsCode}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell variant="head">Time Period</TableCell>
                      <TableCell>{selectedSubmission.timePeriod}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell variant="head">Additional Info</TableCell>
                      <TableCell>{selectedSubmission.additionalInfo}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell variant="head">Tracking ID</TableCell>
                      <TableCell>{selectedSubmission.trackingId}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell variant="head">Status</TableCell>
                      <TableCell>
                        <Chip 
                          label={selectedSubmission.status}
                          color={getStatusColor(selectedSubmission.status)}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell variant="head">Last Updated</TableCell>
                      <TableCell>
                        {new Date(selectedSubmission.timestamp).toLocaleString()}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell variant="head">Mailing Tracking #</TableCell>
                      <TableCell>
                        {selectedSubmission.trackingNumber || 'Not mailed yet'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              
              <Typography variant="h6" gutterBottom>
                Files
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>File Type</TableCell>
                      <TableCell>Path</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>Protest Letter</TableCell>
                      <TableCell>{selectedSubmission.protestLetterPath}</TableCell>
                      <TableCell>
                        {selectedSubmission.protestLetterPath && (
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => window.open(`/api/erc-protest/admin/download?path=${selectedSubmission.protestLetterPath}`, '_blank')}
                          >
                            <CloudDownload />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Complete Package (ZIP)</TableCell>
                      <TableCell>{selectedSubmission.zipPath}</TableCell>
                      <TableCell>
                        {selectedSubmission.zipPath && (
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => window.open(`/api/erc-protest/admin/download?path=${selectedSubmission.zipPath}`, '_blank')}
                          >
                            <CloudDownload />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              
              {selectedSubmission.googleDriveLink && (
                <Box mb={3}>
                  <Typography variant="h6" gutterBottom>
                    Google Drive
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<Link />}
                    onClick={() => window.open(selectedSubmission.googleDriveLink, '_blank')}
                  >
                    Open in Google Drive
                  </Button>
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialogOpen(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Container>
  );
};

export default ERCAdminDashboard;