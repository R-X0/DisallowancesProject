// client/src/components/ERCProtestLetterGenerator.js

import React, { useState, useEffect } from 'react';
import { 
  Box, Button, Paper, Typography, TextField, 
  Divider, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, LinearProgress,
  ButtonGroup, Tooltip,
  Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import { ContentCopy, CheckCircle, Description, Link, FileDownload, SwapHoriz } from '@mui/icons-material';
import { generateERCProtestLetter } from '../services/api';

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

const ERCProtestLetterGenerator = ({ formData, onGenerated }) => {
  const [generating, setGenerating] = useState(false);
  const [protestLetter, setProtestLetter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [chatGptLink, setChatGptLink] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingStep, setProcessingStep] = useState(0);
  const [packageData, setPackageData] = useState(null);
  const [documentType, setDocumentType] = useState('protestLetter'); // State for toggling document type
  const [selectedTimePeriod, setSelectedTimePeriod] = useState(''); // For selecting which period to focus on for protest letter
  const [approachFocus, setApproachFocus] = useState('governmentOrders'); // Default approach

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

  // Function to generate protest letter using our LLM API
  const generateProtestLetter = async () => {
    setGenerating(true);
    setError(null);
    setProcessing(true);
    setProcessingStep(0);
    setPackageData(null);
    
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
      
      // Prepare data for API call
      const letterData = {
        businessName: formData.businessName,
        ein: formData.ein,
        location: formData.location,
        timePeriod: timePeriodToUse,
        allTimePeriods: allTimePeriods,
        chatGptLink: chatGptLink,
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
        approachFocus: currentApproach // Use the confirmed approach
      };
      
      // Update processing steps
      setProcessingMessage('Connecting to ChatGPT conversation...');
      setProcessingStep(1);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      setProcessingMessage('Extracting COVID-19 orders and research data...');
      setProcessingStep(2);
      
      // Call the API to generate the letter
      const response = await generateERCProtestLetter(letterData);
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      setProcessingMessage(documentType === 'protestLetter' ? 
        'Generating protest letter...' : 
        'Generating Form 886-A document...');
      setProcessingStep(3);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      setProcessingMessage('Converting referenced links to PDF attachments...');
      setProcessingStep(4);
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      setProcessingMessage('Creating complete package...');
      setProcessingStep(5);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (response.success) {
        setProtestLetter(response.letter);
        
        // Create package data object
        const newPackageData = {
          pdfPath: response.pdfPath,
          zipPath: response.zipPath,
          attachments: response.attachments || [],
          packageFilename: response.packageFilename || 'complete_package.zip',
          quarter: selectedTimePeriod
        };
        
        console.log('Setting package data:', newPackageData);
        setPackageData(newPackageData);
        
        // Note: No MongoDB update here - we've removed it and will handle it at form submission

        // Immediately call the onGenerated callback with the package data
        console.log('Calling onGenerated with package data:', newPackageData);
        if (onGenerated) {
          onGenerated(newPackageData);
        }
        
        setDialogOpen(true);
        setProcessing(false);
      } else {
        throw new Error(response.message || 'Failed to generate document');
      }
    } catch (error) {
      console.error('Error generating document:', error);
      setProcessing(false);
      setError(`Failed to generate document: ${error.message}`);
    } finally {
      setGenerating(false);
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
  
  const validateChatGptLink = (link) => {
    return link && (
      link.startsWith('https://chat.openai.com/') || 
      link.startsWith('https://chatgpt.com/') ||
      link.includes('chat.openai.com') ||
      link.includes('chatgpt.com')
    );
  };

  const downloadProtestPackage = () => {
    if (packageData && packageData.zipPath) {
      console.log("Downloading protest package with path:", packageData.zipPath);
      
      // Check if it's a Google Drive URL (starts with http/https)
      if (packageData.zipPath.startsWith('http')) {
        // Open it directly in a new tab
        window.open(packageData.zipPath, '_blank');
      } else {
        // Use the public API endpoint for local file downloads (updated to use the new public endpoint)
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
  
  // Check if we have time periods data
  const hasTimePeriods = formData.timePeriods && formData.timePeriods.length > 0;
  
  // Calculate revenue declines for display
  const revenueDeclines = calculateRevenueDeclines(formData);
  const qualifyingQuarters = getQualifyingQuarters(revenueDeclines);
  const hasQualifyingQuarters = qualifyingQuarters.length > 0;
  
  return (
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
        
        {/* Time Period Selector (only show for Protest Letter type) */}
        {hasTimePeriods && documentType === 'protestLetter' && (
          <Box mb={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="select-protest-period-label">Select Quarter for Protest Letter</InputLabel>
              <Select
                labelId="select-protest-period-label"
                id="select-protest-period"
                value={selectedTimePeriod}
                onChange={handleTimePeriodChange}
                label="Select Quarter for Protest Letter"
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
          </Box>
        )}
        
        <TextField
          fullWidth
          label="ChatGPT Conversation Link"
          variant="outlined"
          value={chatGptLink}
          onChange={(e) => setChatGptLink(e.target.value)}
          placeholder="https://chat.openai.com/c/..."
          error={chatGptLink !== '' && !validateChatGptLink(chatGptLink)}
          helperText={chatGptLink !== '' && !validateChatGptLink(chatGptLink) ? 
            "Please enter a valid ChatGPT conversation link" : ""}
          InputProps={{
            startAdornment: <Link color="action" sx={{ mr: 1 }} />,
          }}
          sx={{ mb: 2 }}
        />
        
        <Alert severity="info" sx={{ mb: 2 }}>
          {documentType === 'protestLetter' 
            ? `Make sure your ChatGPT conversation includes specific COVID-19 orders that affected your business during ${selectedTimePeriod || 'the selected time period'}.` 
            : `Make sure your ChatGPT conversation includes comprehensive information about government orders affecting your business across all ERC quarters: ${hasTimePeriods ? formData.timePeriods.join(', ') : 'the selected time periods'}.`}
        </Alert>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <Box display="flex" justifyContent="center" mt={2}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Description />}
            onClick={generateProtestLetter}
            disabled={
              generating || 
              !chatGptLink || 
              !validateChatGptLink(chatGptLink) || 
              (documentType === 'protestLetter' && !selectedTimePeriod && hasTimePeriods)
            }
            sx={{ minWidth: 240 }}
          >
            {generating ? 'Generating...' : documentType === 'protestLetter' 
              ? 'Generate Protest Package' 
              : 'Generate Form 886-A Document'}
          </Button>
        </Box>
        
        {generating && processing && (
          <Box mt={3}>
            <Typography variant="body2" align="center" gutterBottom>
              {processingMessage}
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={(processingStep * 100) / 5} 
              sx={{ mt: 1, mb: 2 }}
            />
            <Typography variant="caption" align="center" display="block" color="text.secondary">
              This process may take 2-3 minutes to extract data from ChatGPT, generate the document, and create PDFs of all referenced sources.
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
                
                <Box display="flex" justifyContent="center" mt={2} mb={3}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<FileDownload />}
                    onClick={downloadProtestPackage}
                    sx={{ minWidth: 240 }}
                  >
                    Download Complete Package
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
  );
};

export default ERCProtestLetterGenerator;