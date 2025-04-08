// client/src/components/ERCProtestLetterGenerator.js

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, Button, Paper, Typography, TextField, 
  Divider, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, LinearProgress,
  ButtonGroup, Tooltip,
  Select, MenuItem, FormControl, InputLabel,
  FormControlLabel, Checkbox, RadioGroup, Radio,
  Grid, CircularProgress, Snackbar, GlobalStyles
} from '@mui/material';
import { ContentCopy, CheckCircle, Description, FileDownload, SwapHoriz } from '@mui/icons-material';
import axios from 'axios';

// Utility function to map NAICS code to business type
const getNaicsDescription = (naicsCode) => {
  // This is a simplified mapping - you'd want a more comprehensive one in production
  const naicsMap = {
    '541110': 'law firm',
    '541211': 'accounting firm',
    '541330': 'engineering firm',
    '561320': 'temporary staffing agency',
    '722511': 'restaurant', 
    '623110': 'nursing home',
    '622110': 'hospital',
    '611110': 'elementary or secondary school',
    '445110': 'supermarket or grocery store',
    '448140': 'clothing store',
    '236220': 'construction company',
    '621111': 'medical office'
  };
  
  return naicsMap[naicsCode] || 'business';
};

// Calculate revenue declines between quarters
const calculateRevenueDeclines = (formData) => {
  const declines = [];
  console.log("Calculating revenue declines with data:", formData);
  
  // Calculate 2020 vs 2019 declines
  if (formData.q1_2020 && formData.q1_2019 && parseFloat(formData.q1_2019) > 0) {
    const decline = (1 - parseFloat(formData.q1_2020) / parseFloat(formData.q1_2019)) * 100;
    console.log(`Q1 2020 decline: ${decline.toFixed(2)}% (threshold: 50%)`);
    if (decline > 0) {
      declines.push({
        quarter: 'Q1 2020',
        baseQuarter: 'Q1 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`,
        qualifies: decline >= 50
      });
    }
  }
  
  if (formData.q2_2020 && formData.q2_2019 && parseFloat(formData.q2_2019) > 0) {
    const decline = (1 - parseFloat(formData.q2_2020) / parseFloat(formData.q2_2019)) * 100;
    console.log(`Q2 2020 decline: ${decline.toFixed(2)}% (threshold: 50%)`);
    if (decline > 0) {
      declines.push({
        quarter: 'Q2 2020',
        baseQuarter: 'Q2 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`,
        qualifies: decline >= 50
      });
    }
  }
  
  if (formData.q3_2020 && formData.q3_2019 && parseFloat(formData.q3_2019) > 0) {
    const decline = (1 - parseFloat(formData.q3_2020) / parseFloat(formData.q3_2019)) * 100;
    console.log(`Q3 2020 decline: ${decline.toFixed(2)}% (threshold: 50%)`);
    if (decline > 0) {
      declines.push({
        quarter: 'Q3 2020',
        baseQuarter: 'Q3 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`,
        qualifies: decline >= 50
      });
    }
  }
  
  if (formData.q4_2020 && formData.q4_2019 && parseFloat(formData.q4_2019) > 0) {
    const decline = (1 - parseFloat(formData.q4_2020) / parseFloat(formData.q4_2019)) * 100;
    console.log(`Q4 2020 decline: ${decline.toFixed(2)}% (threshold: 50%)`);
    if (decline > 0) {
      declines.push({
        quarter: 'Q4 2020',
        baseQuarter: 'Q4 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`,
        qualifies: decline >= 50
      });
    }
  }
  
  // Calculate 2021 vs 2019 declines
  if (formData.q1_2021 && formData.q1_2019 && parseFloat(formData.q1_2019) > 0) {
    const decline = (1 - parseFloat(formData.q1_2021) / parseFloat(formData.q1_2019)) * 100;
    console.log(`Q1 2021 decline: ${decline.toFixed(2)}% (threshold: 20%)`);
    if (decline > 0) {
      declines.push({
        quarter: 'Q1 2021',
        baseQuarter: 'Q1 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`,
        qualifies: decline >= 20
      });
    }
  }
  
  if (formData.q2_2021 && formData.q2_2019 && parseFloat(formData.q2_2019) > 0) {
    const decline = (1 - parseFloat(formData.q2_2021) / parseFloat(formData.q2_2019)) * 100;
    console.log(`Q2 2021 decline: ${decline.toFixed(2)}% (threshold: 20%)`);
    if (decline > 0) {
      declines.push({
        quarter: 'Q2 2021',
        baseQuarter: 'Q2 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`,
        qualifies: decline >= 20
      });
    }
  }
  
  if (formData.q3_2021 && formData.q3_2019 && parseFloat(formData.q3_2019) > 0) {
    const decline = (1 - parseFloat(formData.q3_2021) / parseFloat(formData.q3_2019)) * 100;
    console.log(`Q3 2021 decline: ${decline.toFixed(2)}% (threshold: 20%)`);
    if (decline > 0) {
      declines.push({
        quarter: 'Q3 2021',
        baseQuarter: 'Q3 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`,
        qualifies: decline >= 20
      });
    }
  }
  
  console.log("Calculated declines:", declines);
  return declines;
};

// Determine which quarters qualify for ERC based on revenue decline
const getQualifyingQuarters = (declines) => {
  const qualifying = declines.filter(decline => decline.qualifies).map(decline => decline.quarter);
  console.log("Qualifying quarters:", qualifying);
  return qualifying;
};

// Determine which approach the user is focusing on - government orders or revenue reduction
const determineUserApproach = (formData) => {
  // FIRST: Check if we have qualifying revenue quarters - THIS TAKES PRIORITY
  const revenueDeclines = calculateRevenueDeclines(formData);
  const qualifyingQuarters = getQualifyingQuarters(revenueDeclines);
  
  // If we have ANY qualifying quarters based on revenue decline, ALWAYS use revenue approach
  if (qualifyingQuarters.length > 0) {
    console.log("Using REVENUE REDUCTION approach - Found qualifying quarters:", qualifyingQuarters);
    return 'revenueReduction';
  }
  
  // Only if no qualifying quarters, use the scoring approach
  console.log("No qualifying quarters found, using scoring method");
  
  const hasGovernmentOrderInfo = formData.timePeriods && formData.timePeriods.length > 0;
  const hasGovernmentOrderNotes = formData.governmentOrdersInfo && formData.governmentOrdersInfo.trim().length > 0;
  
  const hasRevenueData = 
    formData.q1_2019 || formData.q2_2019 || formData.q3_2019 || formData.q4_2019 ||
    formData.q1_2020 || formData.q2_2020 || formData.q3_2020 || formData.q4_2020 ||
    formData.q1_2021 || formData.q2_2021 || formData.q3_2021;
  const hasRevenueNotes = formData.revenueReductionInfo && formData.revenueReductionInfo.trim().length > 0;
  
  // Calculate detail scores to determine which approach has more info
  const governmentOrderScore = (hasGovernmentOrderInfo ? 2 : 0) + (hasGovernmentOrderNotes ? 3 : 0);
  const revenueReductionScore = (hasRevenueData ? 2 : 0) + (hasRevenueNotes ? 3 : 0);
  
  console.log("Approach scores - Government:", governmentOrderScore, "Revenue:", revenueReductionScore);
  
  if (revenueReductionScore > governmentOrderScore) {
    return 'revenueReduction';
  } else if (governmentOrderScore > revenueReductionScore) {
    return 'governmentOrders';
  } else if (revenueReductionScore > 0) {
    // If scores are tied but we have some revenue info, prefer that
    return 'revenueReduction';
  } else {
    // Default if no meaningful data in either section
    return 'governmentOrders';
  }
};

// Common disallowance reasons
const disallowanceReasons = [
  { value: 'no_orders', label: 'No government orders in effect' },
  { value: 'not_in_operation', label: 'Business not in operation' },
  { value: 'excess_amount', label: 'Amount claimed exceeded allowable maximum' },
  { value: 'no_w2', label: 'No W-2s were filed' },
  { value: 'no_941', label: 'No Forms 941 were filed' },
  { value: 'no_deposits', label: 'No employment tax deposits found' },
  { value: 'other', label: 'Other reason' }
];

const ERCProtestLetterGenerator = ({ formData, onGenerated }) => {
  const [generating, setGenerating] = useState(false);
  const [protestLetter, setProtestLetter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [chatGptContent, setChatGptContent] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingStep, setProcessingStep] = useState(0);
  const [packageData, setPackageData] = useState(null);
  const [documentType, setDocumentType] = useState('protestLetter');
  const [selectedTimePeriod, setSelectedTimePeriod] = useState('');
  const [approachFocus, setApproachFocus] = useState('governmentOrders');
  const [pollInterval, setPollInterval] = useState(null);
  const [pollingStartTime, setPollingStartTime] = useState(null);
  const [includeRevenueSection, setIncludeRevenueSection] = useState(true);
  const [disallowanceReason, setDisallowanceReason] = useState('no_orders');
  const [outputFormat, setOutputFormat] = useState('pdf');
  const [customDisallowanceReason, setCustomDisallowanceReason] = useState('');
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const [includeSupplyChainDisruption, setIncludeSupplyChainDisruption] = useState(false);

  // Initialize selected time period when form data changes
  useEffect(() => {
    if (formData && formData.timePeriods && formData.timePeriods.length > 0 && !selectedTimePeriod) {
      setSelectedTimePeriod(formData.timePeriods[0]);
    }
    
    // Determine approach whenever form data changes
    if (formData) {
      const approach = determineUserApproach(formData);
      setApproachFocus(approach);
      console.log("Set approach focus to:", approach);
    }
  }, [formData, selectedTimePeriod]);

  // Handle time period selection change
  const handleTimePeriodChange = (event) => {
    setSelectedTimePeriod(event.target.value);
  };

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);

  // Function to poll for job status
  const pollJobStatus = useCallback(async (jobId) => {
    if (!jobId) return;
    
    const currentTime = new Date().getTime();
    const maxPollingTime = 300000; // 5 minutes in milliseconds
    
    // Check if we've exceeded the max polling time
    if (pollingStartTime && (currentTime - pollingStartTime > maxPollingTime)) {
      clearInterval(pollInterval);
      setTimeoutWarning(true);
      
      // Continue with reduced frequency polling (every 30 seconds)
      const newPollInterval = setInterval(() => {
        console.log("Continuing with background polling after timeout warning...");
        pollJobStatus(jobId);
      }, 30000);
      
      setPollInterval(newPollInterval);
      setPollingStartTime(currentTime); // Reset the polling start time
      return;
    }
    
    try {
      const response = await axios.get(`/api/erc-protest/chatgpt/job-status/${jobId}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to check job status');
      }
      
      const job = response.data.job;
      console.log(`Job status: ${job.status}, Progress: ${job.progress || 0}%`);
      
      // Update UI based on job status
      if (job.status === 'processing_content') {
        setProcessingMessage('Processing ChatGPT conversation content...');
        setProcessingStep(2);
      } else if (job.status === 'preparing_document' || job.status === 'generating_document') {
        setProcessingMessage(documentType === 'protestLetter' ? 
          'Generating protest letter...' : 
          'Generating Form 886-A document...');
        setProcessingStep(3);
      } else if (job.status === 'extracting_urls') {
        setProcessingMessage('Converting referenced links to PDF attachments...');
        setProcessingStep(4);
      } else if (job.status === 'generating_pdf' || job.status === 'generating_docx' || 
                job.status === 'creating_package' || job.status === 'uploading') {
        setProcessingMessage('Creating complete package...');
        setProcessingStep(5);
      } else if (job.status === 'completed') {
        // Job completed successfully
        console.log('Job completed successfully:', job.result);
        
        // Clear warning if it was shown
        setTimeoutWarning(false);
        
        // Clear polling interval
        if (pollInterval) {
          clearInterval(pollInterval);
          setPollInterval(null);
        }
        
        setProtestLetter(job.result.letter);
        
        // Create package data object
        const newPackageData = {
          pdfPath: job.result.pdfPath,
          docxPath: job.result.docxPath,
          zipPath: job.result.zipPath,
          attachments: job.result.attachments,
          packageFilename: job.result.packageFilename || 'complete_package.zip',
          quarter: selectedTimePeriod,
          outputFormat: outputFormat,
          // Add Google Drive links if available
          googleDriveLink: job.result.googleDriveLink,
          protestLetterLink: job.result.protestLetterLink,
          zipPackageLink: job.result.zipPackageLink
        };
        
        console.log('Setting package data:', newPackageData);
        setPackageData(newPackageData);
        
        // Finally, clear loading states since we've completed
        setGenerating(false);
        setProcessing(false);
        
        // Immediately call the onGenerated callback with the package data
        console.log('Calling onGenerated with package data:', newPackageData);
        if (onGenerated) {
          onGenerated(newPackageData);
        }
        
        // Open the dialog with the result
        setDialogOpen(true);
      } else if (job.status === 'failed') {
        // Job failed
        if (pollInterval) {
          clearInterval(pollInterval);
          setPollInterval(null);
        }
        
        console.error(`Job failed: ${job.error}`);
        setProcessing(false);
        setGenerating(false);
        setError(`Failed to generate document: ${job.error}`);
      }
    } catch (error) {
      console.error('Error checking job status:', error);
      
      // Don't stop polling on network errors - just skip this attempt
      console.log("Will retry polling on next interval");
    }
  }, [documentType, onGenerated, outputFormat, pollInterval, pollingStartTime, selectedTimePeriod]);

  // Function to generate protest letter using our LLM API
  const generateProtestLetter = async () => {
    // Clear any previous error
    setError(null);
    setTimeoutWarning(false);
    
    // Disable button and show loading state immediately
    setGenerating(true);
    setProcessing(true);
    setProcessingStep(0);
    setPackageData(null);
    setProcessingMessage("Initializing document generation...");
    
    try {
      // Get business type based on NAICS code
      const businessType = getNaicsDescription(formData.naicsCode);
      
      // Get all selected time periods for context
      const allTimePeriods = formData.timePeriods ? formData.timePeriods : [formData.timePeriod];
      const timePeriodsText = allTimePeriods.join(', ');
      
      // For protest letters, use the selected time period
      // For Form 886-A, use all time periods
      const timePeriodToUse = documentType === 'protestLetter' ? 
        selectedTimePeriod : 
        timePeriodsText;
      
      // Calculate revenue declines and determine approach
      const revenueDeclines = calculateRevenueDeclines(formData);
      const qualifyingQuarters = getQualifyingQuarters(revenueDeclines);
      
      // CONFIRM we're using the correct approach - re-check right before API call
      const currentApproach = determineUserApproach(formData);
      console.log("Final approach check before API call:", currentApproach);
      console.log("Include revenue section:", includeRevenueSection);
      console.log("Include supply chain disruption:", includeSupplyChainDisruption);
      console.log("Output format:", outputFormat);
      
      // Prepare data for API call
      const letterData = {
        businessName: formData.businessName,
        ein: formData.ein,
        location: formData.location,
        timePeriod: timePeriodToUse,
        allTimePeriods: allTimePeriods,
        chatGptContent: chatGptContent,
        businessType: businessType,
        trackingId: formData.trackingId || '',
        documentType: documentType,
        // Add revenue data
        q1_2019: formData.q1_2019 || '',
        q2_2019: formData.q2_2019 || '',
        q3_2019: formData.q3_2019 || '',
        q4_2019: formData.q4_2019 || '',
        q1_2020: formData.q1_2020 || '',
        q2_2020: formData.q2_2020 || '',
        q3_2020: formData.q3_2020 || '',
        q4_2020: formData.q4_2020 || '',
        q1_2021: formData.q1_2021 || '',
        q2_2021: formData.q2_2021 || '',
        q3_2021: formData.q3_2021 || '',
        // Also pass additional context
        revenueReductionInfo: formData.revenueReductionInfo || '',
        governmentOrdersInfo: formData.governmentOrdersInfo || '',
        // Pass revenue decline metadata
        revenueDeclines: revenueDeclines,
        qualifyingQuarters: qualifyingQuarters,
        approachFocus: currentApproach, // Use the confirmed approach
        // Added new parameters for the requested features - ensure explicit boolean/string types
        includeRevenueSection: includeRevenueSection === true, // Force boolean type
        includeSupplyChainDisruption: includeSupplyChainDisruption === true, // Force boolean type
        disallowanceReason: disallowanceReason,
        customDisallowanceReason: customDisallowanceReason,
        outputFormat: outputFormat
      };
      
      // Update processing steps
      setProcessingMessage('Starting document generation job...');
      setProcessingStep(1);
      
      // Start the job
      const response = await axios.post('/api/erc-protest/chatgpt/process-content', letterData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout for the initial request
      });
      
      if (!response.data.success || !response.data.jobId) {
        throw new Error(response.data.message || 'Failed to start document generation');
      }
      
      const newJobId = response.data.jobId;
      console.log(`Started job with ID: ${newJobId}`);
      
      setProcessingMessage('Processing conversation content...');
      setProcessingStep(1);
      
      // Start the polling with timestamp for timeout tracking
      setPollingStartTime(new Date().getTime());
      
      // Set up polling for job status
      const newPollInterval = setInterval(() => {
        pollJobStatus(newJobId);
      }, 5000); // Check every 5 seconds
      
      setPollInterval(newPollInterval);
      
      // Initial poll to jump-start the process
      setTimeout(() => {
        pollJobStatus(newJobId);
      }, 3000);
      
    } catch (error) {
      console.error('Error generating document:', error);
      setProcessing(false);
      setGenerating(false);
      setError(`Failed to generate document: ${error.message}`);
      
      if (pollInterval) {
        clearInterval(pollInterval);
        setPollInterval(null);
      }
    }
  };
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(protestLetter)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  };
  
  const handleCloseDialog = () => {
    // Make sure we're still calling onGenerated with the package data when closing the dialog
    if (packageData && onGenerated) {
      console.log("Sending package data to parent on dialog close:", packageData);
      onGenerated(packageData);
    }
    
    setDialogOpen(false);
  };
  
  const downloadProtestPackage = () => {
    if (packageData && packageData.zipPath) {
      console.log("Downloading protest package with path:", packageData.zipPath);
      
      // Check if it's a Google Drive URL (starts with http/https)
      if (packageData.zipPath.startsWith('http')) {
        // Open it directly in a new tab
        window.open(packageData.zipPath, '_blank');
      } else {
        // Use the public API endpoint for local file downloads
        window.open(`/api/erc-protest/download?path=${encodeURIComponent(packageData.zipPath)}`, '_blank');
      }
      
      // Also trigger the onGenerated callback again to ensure the parent has the data
      if (onGenerated) {
        console.log("Triggering onGenerated again during download", packageData);
        onGenerated(packageData);
      }
    } else {
      console.warn("No package data or zipPath available for download");
    }
  };

  // Function to download just the document (PDF or DOCX)
  const downloadDocument = () => {
    if (packageData) {
      const path = outputFormat === 'docx' ? packageData.docxPath : packageData.pdfPath;
      
      if (path) {
        console.log(`Downloading ${outputFormat.toUpperCase()} document with path:`, path);
        
        // Check if it's a Google Drive URL
        if (path.startsWith('http')) {
          window.open(path, '_blank');
        } else {
          window.open(`/api/erc-protest/download?path=${encodeURIComponent(path)}`, '_blank');
        }
      } else {
        console.warn(`No ${outputFormat.toUpperCase()} path available for download`);
      }
    }
  };
  
  // Check if we have time periods data
  const hasTimePeriods = formData.timePeriods && formData.timePeriods.length > 0;
  
  // Calculate revenue declines for display
  const revenueDeclines = calculateRevenueDeclines(formData);
  const qualifyingQuarters = getQualifyingQuarters(revenueDeclines);
  const hasQualifyingQuarters = qualifyingQuarters.length > 0;
  
  return (
    <>
      {/* Add CSS keyframes for the button animation */}
      <GlobalStyles styles={`
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.4);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(25, 118, 210, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(25, 118, 210, 0);
          }
        }
        button:disabled {
          cursor: not-allowed !important;
        }
      `} />
      
      <Box mt={3}>
        <Paper elevation={3} sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" gutterBottom>
              Generate ERC Documentation
            </Typography>
            <ButtonGroup variant="contained" aria-label="document type toggle">
              <Tooltip title="Generate a formal protest letter to the IRS">
                <Button 
                  color={documentType === 'protestLetter' ? 'primary' : 'inherit'}
                  onClick={() => setDocumentType('protestLetter')}
                >
                  Protest Letter
                </Button>
              </Tooltip>
              <Tooltip title="Generate a Form 886-A substantiation document">
                <Button 
                  color={documentType === 'form886A' ? 'primary' : 'inherit'}
                  onClick={() => setDocumentType('form886A')}
                  startIcon={<SwapHoriz />}
                >
                  Form 886-A
                </Button>
              </Tooltip>
            </ButtonGroup>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          <Typography variant="body2" color="text.secondary" mb={2}>
            {documentType === 'protestLetter' 
              ? 'Generate a customized protest letter for your ERC claim using your ChatGPT research.'
              : 'Generate a Form 886-A document with Issue, Facts, Law, Argument, and Conclusion sections for enhanced substantiation.'}
          </Typography>
          
          {/* Display revenue approach info if relevant */}
          {hasQualifyingQuarters && (
            <Box mb={3} p={2} bgcolor="info.lighter" borderRadius={1}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>{approachFocus === 'revenueReduction' ? 'Revenue Reduction' : 'Government Orders'} Approach Detected</strong>
              </Typography>
              <Typography variant="body2">
                Your data shows qualifying revenue reductions in the following quarters: {qualifyingQuarters.join(', ')}
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={1}>
                This revenue reduction information will be prominently featured in your generated document as the primary basis for ERC qualification.
              </Typography>
            </Box>
          )}

          <Grid container spacing={2}>
            {/* Time Period Selector (only show for Protest Letter type) */}
            {hasTimePeriods && documentType === 'protestLetter' && (
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel id="select-protest-period-label">Select Quarter for Protest Letter</InputLabel>
                  <Select
                    labelId="select-protest-period-label"
                    id="select-protest-period"
                    value={selectedTimePeriod}
                    onChange={handleTimePeriodChange}
                    label="Select Quarter for Protest Letter"
                    disabled={generating}
                  >
                    {formData.timePeriods.map((period) => (
                      <MenuItem key={period} value={period}>{period}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                  {documentType === 'protestLetter' 
                    ? 'Select a specific quarter for the protest letter. Each quarter typically requires a separate protest letter.' 
                    : 'Form 886-A documents will include all selected quarters.'}
                </Typography>
              </Grid>
            )}

            {/* ChatGPT Content Textarea */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Paste ChatGPT Conversation"
                variant="outlined"
                value={chatGptContent}
                onChange={(e) => setChatGptContent(e.target.value)}
                placeholder="Paste your entire ChatGPT conversation here..."
                multiline
                rows={8}
                error={chatGptContent === ''}
                helperText={chatGptContent === '' ? 
                  "Please paste your ChatGPT conversation" : ""}
                disabled={generating}
              />
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Paste the complete conversation from ChatGPT including all messages and referenced links. The system will extract relevant information and URLs.
              </Typography>
            </Grid>

            {/* Disallowance Reason Selection */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small" disabled={generating}>
                <InputLabel id="disallowance-reason-label">Disallowance Reason</InputLabel>
                <Select
                  labelId="disallowance-reason-label"
                  id="disallowance-reason"
                  value={disallowanceReason}
                  onChange={(e) => setDisallowanceReason(e.target.value)}
                  label="Disallowance Reason"
                >
                  {disallowanceReasons.map((reason) => (
                    <MenuItem key={reason.value} value={reason.value}>{reason.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {disallowanceReason === 'other' && (
                <TextField
                  fullWidth
                  size="small"
                  margin="normal"
                  label="Specify disallowance reason"
                  value={customDisallowanceReason}
                  onChange={(e) => setCustomDisallowanceReason(e.target.value)}
                  placeholder="Enter the specific disallowance reason"
                  disabled={generating}
                />
              )}
            </Grid>

            {/* Include Revenue Section Toggle */}
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeRevenueSection}
                    onChange={(e) => setIncludeRevenueSection(e.target.checked)}
                    name="includeRevenueSection"
                    disabled={generating}
                  />
                }
                label="Include revenue section in document (even if not qualifying)"
              />
            </Grid>

            {/* Supply Chain Disruption Checkbox */}
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeSupplyChainDisruption}
                    onChange={(e) => setIncludeSupplyChainDisruption(e.target.checked)}
                    name="includeSupplyChainDisruption"
                    disabled={generating}
                  />
                }
                label="Include supply chain disruption analysis (Q/A #12)"
              />
            </Grid>

            {/* Output Format Selection */}
            <Grid item xs={12}>
              <Typography variant="body2" gutterBottom>Output Format:</Typography>
              <RadioGroup
                row
                name="outputFormat"
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
              >
                <FormControlLabel 
                  value="pdf" 
                  control={<Radio disabled={generating} />} 
                  label="PDF" 
                  disabled={generating}
                />
                <FormControlLabel 
                  value="docx" 
                  control={<Radio disabled={generating} />} 
                  label="Word Document (.docx)" 
                  disabled={generating}
                />
              </RadioGroup>
            </Grid>
          </Grid>
          
          <Alert severity="info" sx={{ mb: 2, mt: 2 }}>
            {documentType === 'protestLetter' 
              ? `Make sure your pasted ChatGPT conversation includes specific COVID-19 orders that affected your business during ${selectedTimePeriod || 'the selected time period'}.` 
              : `Make sure your pasted ChatGPT conversation includes comprehensive information about government orders affecting your business across all ERC quarters: ${hasTimePeriods ? formData.timePeriods.join(', ') : 'the selected time periods'}.`}
          </Alert>
          
          {timeoutWarning && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="subtitle2">Package generation is taking longer than expected</Typography>
              <Typography variant="body2">
                The document generation is still in progress but is taking longer than the usual 5-minute timeframe. This can happen with complex documents or when processing many sources. 
                You can continue waiting, and we'll notify you when it's complete. The generation will continue in the background even if you navigate away from this page.
              </Typography>
            </Alert>
          )}
          
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          
          <Box display="flex" justifyContent="center" mt={2}>
            <Button
              variant="contained"
              color="primary"
              startIcon={generating ? <CircularProgress size={20} color="inherit" /> : <Description />}
              onClick={generateProtestLetter}
              disabled={
                generating || 
                !chatGptContent || 
                (documentType === 'protestLetter' && !selectedTimePeriod && hasTimePeriods)
              }
              sx={{ 
                minWidth: 240,
                position: 'relative',
                // Add pulsing effect when generating
                animation: generating ? 'pulse 1.5s infinite' : 'none'
              }}
            >
              {generating ? 'Generating Package...' : documentType === 'protestLetter' 
                ? 'Generate Protest Package' 
                : 'Generate Form 886-A Document'}
            </Button>
          </Box>
          
          {/* Enhanced processing indicator */}
          {generating && processing && (
            <Box mt={3} p={2} sx={{ 
              bgcolor: 'info.lighter', 
              borderRadius: 1,
              textAlign: 'center',
              border: '1px solid',
              borderColor: 'info.light'
            }}>
              <Typography variant="subtitle1" gutterBottom>
                <CircularProgress size={16} sx={{ mr: 1, verticalAlign: 'middle' }} />
                Package Generation In Progress
              </Typography>
              <Typography variant="body2" align="center" gutterBottom>
                {processingMessage || "Processing conversation content and generating your documents..."}
              </Typography>
              <LinearProgress 
                variant={processingStep > 0 ? "determinate" : "indeterminate"} 
                value={(processingStep * 100) / 5} 
                sx={{ mt: 1, mb: 2 }}
              />
              <Typography variant="caption" align="center" display="block" color="text.secondary">
                This process takes 2-3 minutes to extract data from your conversation, generate documents, and create PDFs of all referenced sources.
                <strong> Please do not refresh or navigate away from this page.</strong>
              </Typography>
            </Box>
          )}
          
          {/* Document Dialog */}
          <Dialog
            open={dialogOpen}
            onClose={handleCloseDialog}
            maxWidth="md"
            fullWidth
            PaperProps={{
              sx: { 
                height: '80vh',
                display: 'flex',
                flexDirection: 'column'
              }
            }}
          >
            <DialogTitle>
              {documentType === 'protestLetter' ? 'ERC Protest Package' : 'Form 886-A Document'}
              <Button
                aria-label="copy"
                onClick={copyToClipboard}
                sx={{ position: 'absolute', right: 16, top: 8 }}
                startIcon={copied ? <CheckCircle color="success" /> : <ContentCopy />}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </DialogTitle>
            <DialogContent dividers sx={{ flexGrow: 1, overflow: 'auto' }}>
              {packageData && (
                <Box mb={3}>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">
                      {documentType === 'protestLetter' 
                        ? `Complete protest package for ${selectedTimePeriod} generated successfully!` 
                        : `Form 886-A document for ${formData.timePeriods?.join(', ') || 'selected quarters'} generated successfully!`}
                    </Typography>
                    <Typography variant="body2">
                      Your package includes the {documentType === 'protestLetter' ? 'protest letter' : 'Form 886-A document'} and {packageData.attachments.length} PDF attachments 
                      of the referenced sources. You can download the complete package below.
                    </Typography>
                  </Alert>
                  
                  <Box display="flex" justifyContent="center" gap={2} mt={2} mb={3}>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<FileDownload />}
                      onClick={downloadProtestPackage}
                    >
                      Download Complete Package
                    </Button>
                    
                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={<FileDownload />}
                      onClick={downloadDocument}
                    >
                      Download {outputFormat.toUpperCase()} Only
                    </Button>
                  </Box>
                  
                  {packageData.attachments.length > 0 && (
                    <Box mt={3} mb={2}>
                      <Typography variant="subtitle1" gutterBottom>
                        Attachments Created:
                      </Typography>
                      <Paper variant="outlined" sx={{ p: 2 }}>
                        <ol>
                          {packageData.attachments.map((attachment, index) => (
                            <li key={index}>
                              <Typography variant="body2">
                                {attachment.filename} 
                                <Typography variant="caption" component="span" color="text.secondary" sx={{ ml: 1 }}>
                                  (from {attachment.originalUrl})
                                </Typography>
                              </Typography>
                            </li>
                          ))}
                        </ol>
                      </Paper>
                    </Box>
                  )}
                </Box>
              )}
              
              <Typography variant="subtitle1" gutterBottom>
                {documentType === 'protestLetter' ? 'Protest Letter Preview:' : 'Form 886-A Document Preview:'}
              </Typography>
              <TextField
                fullWidth
                multiline
                variant="outlined"
                value={protestLetter}
                InputProps={{
                  readOnly: true,
                  sx: { 
                    fontFamily: 'monospace', 
                    fontSize: '0.9rem'
                  }
                }}
                minRows={15}
                maxRows={30}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={copyToClipboard} startIcon={copied ? <CheckCircle /> : <ContentCopy />}>
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </Button>
              <Button 
                onClick={downloadDocument}
                variant="outlined" 
                color="primary"
                startIcon={<FileDownload />}
              >
                Download {outputFormat.toUpperCase()} Only
              </Button>
              <Button 
                onClick={downloadProtestPackage} 
                variant="contained" 
                color="primary"
                startIcon={<FileDownload />}
              >
                Download Package
              </Button>
              <Button onClick={handleCloseDialog}>Close</Button>
            </DialogActions>
          </Dialog>
        </Paper>
      </Box>
      
      {/* Notification for background processing */}
      <Snackbar
        open={timeoutWarning}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="info" sx={{ width: '100%' }}>
          Processing continues in the background. Please wait...
        </Alert>
      </Snackbar>
    </>
  );
};

export default ERCProtestLetterGenerator;