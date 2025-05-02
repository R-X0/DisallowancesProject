// client/src/components/BulkSubmissionUploader.js

import React, { useState } from 'react';
import { 
  Box, 
  Button, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  Typography, 
  Paper, 
  CircularProgress, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Alert, 
  Tooltip,
  IconButton,
  Chip,
  LinearProgress
} from '@mui/material';
import { 
  Upload as UploadIcon, 
  CloudUpload as CloudUploadIcon, 
  Check as CheckIcon, 
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Close as CloseIcon,
  DataArray as DataArrayIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import axios from 'axios';
import * as XLSX from 'xlsx';

const BulkSubmissionUploader = ({ onUploadsComplete }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [processedItems, setProcessedItems] = useState([]);
  const [error, setError] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  
  // Helper function to map quarter names to standard format
  const mapQuarterFormat = (quarter) => {
    // Standardize quarter format to "Q1 2021" style
    if (quarter.startsWith('1Q')) return `Q1 ${quarter.substring(2)}`;
    if (quarter.startsWith('2Q')) return `Q2 ${quarter.substring(2)}`;
    if (quarter.startsWith('3Q')) return `Q3 ${quarter.substring(2)}`;
    if (quarter.startsWith('4Q')) return `Q4 ${quarter.substring(2)}`;
    return quarter; // Return as is if it already matches
  };
  
  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      readExcelFile(selectedFile);
    }
  };
  
  // Parse the Excel file
  const readExcelFile = async (excelFile) => {
    try {
      setProcessing(true);
      setError(null);
      
      // Read the file
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          
          // Get the first worksheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert to JSON with headers
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          setFileData(jsonData);
          setProcessing(false);
          console.log("Excel data loaded:", jsonData);
        } catch (error) {
          console.error("Error parsing Excel file:", error);
          setError(`Error parsing Excel file: ${error.message}`);
          setProcessing(false);
        }
      };
      
      reader.onerror = (event) => {
        setError("Error reading file");
        setProcessing(false);
      };
      
      reader.readAsArrayBuffer(excelFile);
    } catch (error) {
      console.error("File handling error:", error);
      setError(`File handling error: ${error.message}`);
      setProcessing(false);
    }
  };
  
  // Process and upload each row
  const processUploads = async () => {
    if (!fileData || fileData.length === 0) {
      setError("No data to process");
      return;
    }
    
    setProcessing(true);
    setProcessedItems([]);
    setUploadProgress(0);
    setError(null);
    
    const total = fileData.length;
    let processed = 0;
    const results = [];
    
    // Process each row/business
    for (const row of fileData) {
      try {
        // Skip rows without Client Name or EIN
        if (!row['Client Name'] || !row['EIN']) {
          results.push({
            businessName: row['Client Name'] || 'Unknown',
            ein: row['EIN'] || 'Missing',
            status: 'skipped',
            message: 'Missing required data (Client Name or EIN)'
          });
          processed++;
          setUploadProgress(Math.floor((processed / total) * 100));
          continue;
        }
        
        // Identify qualifying quarters
        const qualifyingQuarters = [];
        const qualificationReasons = {};
        const revenueData = {};
        
        // Check all quarter columns for qualification
        for (let i = 2020; i <= 2021; i++) {
          for (let q = 1; q <= 4; q++) {
            // Skip Q1 2020 as it's not applicable for ERC
            if (i === 2020 && q === 1) continue;
            
            const quarterKey = `${q}Q${i.toString().substring(2)}`;
            const qualificationField = `${quarterKey} Qualification`;
            const amountField = `${quarterKey} Amount`;
            
            if (row[qualificationField] && 
                row[qualificationField] !== 'N/A' && 
                row[amountField] > 0) {
              const standardQuarter = mapQuarterFormat(quarterKey);
              qualifyingQuarters.push(standardQuarter);
              qualificationReasons[standardQuarter] = row[qualificationField];
            }
          }
        }
        
        // Gather revenue data from the Excel
        // Map the Excel columns to the field names in the form
        const revenueMapping = {
          '19Q1': 'q1_2019',
          '19Q2': 'q2_2019',
          '19Q3': 'q3_2019',
          '19Q4': 'q4_2019',
          '20Q1': 'q1_2020',
          '20Q2': 'q2_2020',
          '20Q3': 'q3_2020',
          '20Q4': 'q4_2020',
          '21Q1': 'q1_2021',
          '21Q2': 'q2_2021',
          '21Q3': 'q3_2021',
          '21Q4': 'q4_2021'
        };
        
        // Fill in the revenue data object
        for (const [excelField, formField] of Object.entries(revenueMapping)) {
          if (row[excelField] !== undefined && row[excelField] !== null) {
            revenueData[formField] = row[excelField].toString();
          }
        }
        
        // Determine approach based on qualification reasons
        let approach = 'governmentOrders';
        let approachInfo = '';
        
        // Check if any quarter mentions revenue reduction
        const hasRevenueReduction = Object.values(qualificationReasons)
          .some(reason => reason.toLowerCase().includes('revenue'));
          
        // Check if any quarter mentions supply chain
        const hasSupplyChain = Object.values(qualificationReasons)
          .some(reason => reason.toLowerCase().includes('supply chain'));
        
        if (hasRevenueReduction) {
          approach = 'revenueReduction';
          approachInfo = `Business qualified for ERC through revenue reduction in quarters: ${
            Object.entries(qualificationReasons)
              .filter(([_, reason]) => reason.toLowerCase().includes('revenue'))
              .map(([quarter, _]) => quarter)
              .join(', ')
          }`;
        } else if (hasSupplyChain) {
          approach = 'governmentOrders';
          approachInfo = `Business qualified through government orders affecting supply chain during: ${
            Object.entries(qualificationReasons)
              .filter(([_, reason]) => reason.toLowerCase().includes('supply chain'))
              .map(([quarter, _]) => quarter)
              .join(', ')
          }`;
        } else {
          approachInfo = `Business qualified through government orders/shutdown during: ${
            Object.entries(qualificationReasons)
              .map(([quarter, _]) => quarter)
              .join(', ')
          }`;
        }
        
        // Create the submission data
        const submissionData = {
          businessName: row['Client Name'],
          ein: row['EIN'],
          location: 'Unknown', // Set default location
          timePeriods: qualifyingQuarters,
          status: 'Gathering data'
        };
        
        // Add approach specific fields
        if (approach === 'revenueReduction') {
          submissionData.revenueReductionInfo = approachInfo;
        } else {
          submissionData.governmentOrdersInfo = approachInfo;
        }
        
        // Add all revenue data fields
        for (const [field, value] of Object.entries(revenueData)) {
          submissionData[field] = value;
        }
        
        // Save to the queue
        const response = await axios.post('/api/erc-protest/queue/save', submissionData);
        
        // Store result
        results.push({
          businessName: row['Client Name'],
          ein: row['EIN'],
          status: 'success',
          qualifyingQuarters,
          submissionId: response.data.submissionId,
          message: `Created submission for ${qualifyingQuarters.length} quarters`
        });
        
      } catch (error) {
        console.error(`Error processing row for ${row['Client Name']}:`, error);
        results.push({
          businessName: row['Client Name'] || 'Unknown',
          ein: row['EIN'] || 'Unknown',
          status: 'error',
          message: error.response?.data?.message || error.message
        });
      } finally {
        processed++;
        setProcessedItems([...results]);
        setUploadProgress(Math.floor((processed / total) * 100));
      }
    }
    
    setProcessing(false);
    setShowSummary(true);
    
    // Notify parent that uploads are complete
    if (onUploadsComplete) {
      onUploadsComplete(results);
    }
  };
  
  // Open the dialog
  const handleOpenDialog = () => {
    setDialogOpen(true);
    setFile(null);
    setFileData([]);
    setProcessedItems([]);
    setError(null);
    setShowSummary(false);
    setProcessing(false);
    setUploadProgress(0);
  };
  
  // Close the dialog
  const handleCloseDialog = () => {
    setDialogOpen(false);
  };
  
  // Summary stats
  const getSummaryStats = () => {
    if (!processedItems.length) return { success: 0, error: 0, skipped: 0, total: 0 };
    
    return {
      success: processedItems.filter(item => item.status === 'success').length,
      error: processedItems.filter(item => item.status === 'error').length,
      skipped: processedItems.filter(item => item.status === 'skipped').length,
      total: processedItems.length
    };
  };
  
  const stats = getSummaryStats();
  
  return (
    <>
      <Button
        variant="contained"
        color="primary"
        startIcon={<UploadIcon />}
        onClick={handleOpenDialog}
        sx={{ mb: 2 }}
      >
        Bulk Upload Submissions
      </Button>
      
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Bulk Submission Upload
          <IconButton
            aria-label="close"
            onClick={handleCloseDialog}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent dividers>
          {!showSummary ? (
            <>
              <Box mb={3}>
                <Typography variant="subtitle1" gutterBottom>
                  Upload Excel file with ERC client data
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Upload an Excel file (.xlsx) with client data to create multiple submissions in the queue.
                  The file should include columns for Client Name, EIN, qualification information, and quarterly revenue data.
                </Typography>
                
                <Box display="flex" flexDirection="column" alignItems="center" my={3} p={3} border="1px dashed" borderColor="divider" borderRadius={1}>
                  <input
                    type="file"
                    id="file-upload"
                    accept=".xlsx"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    disabled={processing}
                  />
                  <label htmlFor="file-upload">
                    <Button
                      component="span"
                      variant="contained"
                      startIcon={<CloudUploadIcon />}
                      disabled={processing}
                    >
                      Select Excel File
                    </Button>
                  </label>
                  
                  {file && (
                    <Box mt={2} textAlign="center">
                      <Typography variant="body2">
                        <strong>Selected file:</strong> {file.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {(file.size / 1024).toFixed(2)} KB
                      </Typography>
                    </Box>
                  )}
                </Box>
                
                {error && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {error}
                  </Alert>
                )}
                
                {fileData.length > 0 && (
                  <Box mt={3}>
                    <Typography variant="subtitle1" gutterBottom>
                      File Preview
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {fileData.length} records found in file. Preview of first 5 rows:
                    </Typography>
                    
                    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>Client Name</TableCell>
                            <TableCell>EIN</TableCell>
                            <TableCell>Qualifying Quarters</TableCell>
                            <TableCell>Revenue Data</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {fileData.slice(0, 5).map((row, index) => {
                            // Identify qualifying quarters
                            const qualifyingQuarters = [];
                            
                            // Check all quarter columns for qualification
                            for (let i = 2020; i <= 2021; i++) {
                              for (let q = 1; q <= 4; q++) {
                                // Skip Q1 2020 as it's not applicable for ERC
                                if (i === 2020 && q === 1) continue;
                                
                                const quarterKey = `${q}Q${i.toString().substring(2)}`;
                                const qualificationField = `${quarterKey} Qualification`;
                                const amountField = `${quarterKey} Amount`;
                                
                                if (row[qualificationField] && 
                                    row[qualificationField] !== 'N/A' && 
                                    row[amountField] > 0) {
                                  qualifyingQuarters.push(mapQuarterFormat(quarterKey));
                                }
                              }
                            }
                            
                            // Count how many revenue quarters have data
                            const revenueQuarters = ['19Q1', '19Q2', '19Q3', '19Q4', 
                                                    '20Q1', '20Q2', '20Q3', '20Q4',
                                                    '21Q1', '21Q2', '21Q3', '21Q4']
                              .filter(q => row[q] !== undefined && row[q] !== null)
                              .length;
                            
                            return (
                              <TableRow key={index}>
                                <TableCell>{row['Client Name'] || 'Not specified'}</TableCell>
                                <TableCell>{row['EIN'] || 'Missing'}</TableCell>
                                <TableCell>
                                  {qualifyingQuarters.length > 0 ? (
                                    <Chip 
                                      size="small" 
                                      color="primary"
                                      label={`${qualifyingQuarters.length} quarters`} 
                                      title={qualifyingQuarters.join(', ')}
                                    />
                                  ) : (
                                    <Chip size="small" color="error" label="None found" />
                                  )}
                                </TableCell>
                                <TableCell>
                                  {revenueQuarters > 0 ? (
                                    <Chip 
                                      size="small" 
                                      color="info"
                                      label={`${revenueQuarters} quarters`} 
                                    />
                                  ) : (
                                    <Chip size="small" color="error" label="No revenue data" />
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    
                    <Box mt={2} textAlign="center">
                      <Typography variant="body2" color="text.secondary">
                        {fileData.length > 5 ? `...and ${fileData.length - 5} more records` : ''}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
              
              {processing && (
                <Box mt={3}>
                  <Typography variant="body2" mb={1}>
                    Processing... {uploadProgress}% complete
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={uploadProgress} 
                    sx={{ height: 10, borderRadius: 5 }}
                  />
                </Box>
              )}
            </>
          ) : (
            // Summary view
            <Box>
              <Alert 
                severity={stats.error > 0 ? "warning" : "success"}
                icon={stats.error > 0 ? <InfoIcon /> : <CheckCircleIcon />}
                sx={{ mb: 3 }}
              >
                <Typography variant="subtitle1">
                  Upload Summary: {stats.success} successful, {stats.error} failed, {stats.skipped} skipped
                </Typography>
                <Typography variant="body2">
                  {stats.error > 0 
                    ? "Some submissions had errors. Check the details below." 
                    : "All submissions were processed successfully!"}
                </Typography>
              </Alert>
              
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Business</TableCell>
                      <TableCell>EIN</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Details</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {processedItems.map((item, index) => (
                      <TableRow 
                        key={index}
                        sx={{
                          backgroundColor: 
                            item.status === 'error' ? 'error.lighter' :
                            item.status === 'skipped' ? 'warning.lighter' :
                            'success.lighter'
                        }}
                      >
                        <TableCell>{item.businessName}</TableCell>
                        <TableCell>{item.ein}</TableCell>
                        <TableCell>
                          {item.status === 'success' ? (
                            <Chip 
                              size="small" 
                              icon={<CheckCircleIcon />} 
                              label="Success" 
                              color="success"
                            />
                          ) : item.status === 'error' ? (
                            <Chip 
                              size="small" 
                              icon={<ErrorIcon />} 
                              label="Error" 
                              color="error"
                            />
                          ) : (
                            <Chip 
                              size="small" 
                              icon={<InfoIcon />} 
                              label="Skipped" 
                              color="warning"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {item.status === 'success' ? (
                            <>
                              ID: {item.submissionId}
                              <br />
                              Quarters: {item.qualifyingQuarters.join(', ')}
                            </>
                          ) : (
                            item.message
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions>
          {!showSummary ? (
            <>
              <Button 
                onClick={handleCloseDialog} 
                color="inherit"
                disabled={processing}
              >
                Cancel
              </Button>
              <Button
                onClick={processUploads}
                variant="contained"
                color="primary"
                disabled={!fileData.length || processing}
                startIcon={processing ? <CircularProgress size={20} /> : <DataArrayIcon />}
              >
                {processing ? 'Processing...' : 'Process Bulk Upload'}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => {
                  setShowSummary(false);
                  setFile(null);
                  setFileData([]);
                  setProcessedItems([]);
                }}
                color="primary"
              >
                Upload Another File
              </Button>
              <Button 
                onClick={handleCloseDialog} 
                variant="contained"
                color="primary"
              >
                Close
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default BulkSubmissionUploader;