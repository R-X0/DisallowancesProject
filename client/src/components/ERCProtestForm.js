import React, { useState, useEffect } from 'react';
import { 
  Container, Box, TextField, MenuItem, Button, 
  Typography, Paper, Grid, Divider, CircularProgress,
  Stepper, Step, StepLabel, StepContent, 
  Select, FormControl, InputLabel, OutlinedInput, Checkbox, ListItemText,
  FormControlLabel, Alert, Snackbar
} from '@mui/material';
import { 
  FileUpload, 
  AddCircleOutline as AddIcon, 
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import COVIDPromptGenerator from './COVIDPromptGenerator';
import ERCProtestLetterGenerator from './ERCProtestLetterGenerator';
import SubmissionQueue from './SubmissionQueue';
import axios from 'axios';

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
};

const ERCProtestForm = () => {
  // State for form data
  const [formData, setFormData] = useState({
    businessName: '',
    ein: '',
    location: '',
    businessWebsite: '',
    naicsCode: '',
    timePeriods: [], // Changed from timePeriod (string) to timePeriods (array)
    governmentOrdersInfo: '', // Additional info for Government Orders section
    revenueReductionInfo: '', // Additional info for Revenue Reduction section
    trackingId: '', // Added to track the ID for updates
    isControlledGroup: false, // Added for controlled groups with multiple locations
    // Adding new quarterly revenue fields
    q1_2019: '',
    q2_2019: '',
    q3_2019: '',
    q4_2019: '',
    q1_2020: '',
    q2_2020: '',
    q3_2020: '',
    q4_2020: '',
    q1_2021: '',
    q2_2021: '',
    q3_2021: ''
  });
  
  const [pdfFiles, setPdfFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [protestLetterData, setProtestLetterData] = useState(null);
  
  // Queue-related state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSnackbarOpen, setSaveSnackbarOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(true);
  
  // Available quarters for selection
  const quarters = [
    'Q2 2020', 'Q3 2020', 'Q4 2020', 
    'Q1 2021', 'Q2 2021', 'Q3 2021', 'Q4 2021'
  ];
  
  // Generate array of quarters for revenue reduction section
  const revenueQuarters = [
    'Q1 2019', 'Q2 2019', 'Q3 2019', 'Q4 2019',
    'Q1 2020', 'Q2 2020', 'Q3 2020', 'Q4 2020',
    'Q1 2021', 'Q2 2021', 'Q3 2021'
  ];
  
  // Effect to check for prefill data - FIXED VERSION
  useEffect(() => {
    const loadPrefillData = () => {
      // Check both sessionStorage and localStorage
      const prefillData = sessionStorage.getItem('prefillData') || localStorage.getItem('prefillData');
      
      if (prefillData) {
        try {
          const parsedData = JSON.parse(prefillData);
          console.log('Found prefill data:', parsedData);
          
          // Check if this is fresh data (within last 10 seconds)
          const dataTimestamp = parsedData.timestamp || 0;
          const now = new Date().getTime();
          const isRecent = (now - dataTimestamp) < 10000; // 10 seconds
          
          if (!isRecent) {
            console.log('Prefill data is stale, ignoring:', (now - dataTimestamp) / 1000, 'seconds old');
            // Clear stale data
            localStorage.removeItem('prefillData');
            sessionStorage.removeItem('prefillData');
            return;
          }
          
          console.log('Processing fresh prefill data...');
          
          // IMPORTANT: Clear storage immediately to prevent multiple processing
          localStorage.removeItem('prefillData');
          sessionStorage.removeItem('prefillData');
          
          // More robust form data update
          setFormData(prevData => {
            // Start with previous data
            const newData = { ...prevData };
            
            // Update basic business information
            newData.businessName = parsedData.businessName || prevData.businessName;
            newData.ein = parsedData.ein || prevData.ein;
            newData.location = parsedData.location || prevData.location;
            newData.businessWebsite = parsedData.businessWebsite || prevData.businessWebsite;
            newData.naicsCode = parsedData.naicsCode || prevData.naicsCode || '541110'; // Default to law firm if missing
            
            // IMPORTANT: Preserve the submissionId for updates
            newData.trackingId = parsedData.submissionId || parsedData.trackingId || prevData.trackingId;
            console.log(`Setting tracking ID: ${newData.trackingId}`);
            
            // Handle time periods array properly
            if (parsedData.timePeriods && Array.isArray(parsedData.timePeriods)) {
              newData.timePeriods = parsedData.timePeriods;
            } else if (parsedData.timePeriods) {
              newData.timePeriods = [parsedData.timePeriods]; // Convert string to array if needed
            }
            
            // Apply approach-specific data
            if (parsedData.approach === 'governmentOrders') {
              newData.governmentOrdersInfo = parsedData.governmentOrdersInfo || 
                `This business was affected by government orders during ${parsedData.timePeriods?.[0] || ''}. Please provide details about specific orders that caused a full or partial suspension of operations.`;
            } else if (parsedData.approach === 'revenueReduction') {
              newData.revenueReductionInfo = parsedData.revenueReductionInfo || 
                `This business experienced a significant decline in revenue during ${parsedData.timePeriods?.[0] || ''}. Please provide quarterly revenue data to substantiate the claim.`;
            }
            
            // Include any revenue data if provided
            if (parsedData.q1_2019) newData.q1_2019 = parsedData.q1_2019;
            if (parsedData.q2_2019) newData.q2_2019 = parsedData.q2_2019;
            if (parsedData.q3_2019) newData.q3_2019 = parsedData.q3_2019;
            if (parsedData.q4_2019) newData.q4_2019 = parsedData.q4_2019;
            if (parsedData.q1_2020) newData.q1_2020 = parsedData.q1_2020;
            if (parsedData.q2_2020) newData.q2_2020 = parsedData.q2_2020;
            if (parsedData.q3_2020) newData.q3_2020 = parsedData.q3_2020;
            if (parsedData.q4_2020) newData.q4_2020 = parsedData.q4_2020;
            if (parsedData.q1_2021) newData.q1_2021 = parsedData.q1_2021;
            if (parsedData.q2_2021) newData.q2_2021 = parsedData.q2_2021;
            if (parsedData.q3_2021) newData.q3_2021 = parsedData.q3_2021;
            
            console.log('Updated form data with prefill values:', newData);
            
            return newData;
          });
          
          // IMPORTANT FIX: Automatically advance to step 1 after loading prefill data
          // This ensures the COVIDPromptGenerator is visible and can start working
          setTimeout(() => {
            console.log('Automatically advancing to step 1 (prompt generator)');
            setActiveStep(1);
          }, 500); // Short delay to ensure form data is fully updated
          
        } catch (error) {
          console.error('Error parsing prefill data:', error);
          // Clear bad data
          localStorage.removeItem('prefillData');
          sessionStorage.removeItem('prefillData');
        }
      }
    };
    
    // Load data once on mount - NO INTERVAL
    loadPrefillData();
    
    // No interval needed - just a one-time check
  }, []);
  
  // Debug effect - log whenever protestLetterData changes
  useEffect(() => {
    console.log("protestLetterData changed:", protestLetterData);
  }, [protestLetterData]);
  
  // Function to parse locations 
  // eslint-disable-next-line no-unused-vars
  function parseLocations(locationString) {
    if (!locationString) return [];
    
    return locationString.includes(';') 
      ? locationString.split(';').map(loc => loc.trim()).filter(Boolean)
      : [locationString];
  }
  
  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };
  
  // Handle time periods multi-select change
  const handleTimePeriodsChange = (event) => {
    const { value } = event.target;
    setFormData(prevData => ({
      ...prevData,
      timePeriods: typeof value === 'string' ? value.split(',') : value
    }));
  };
  
  // Handle file uploads
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setPdfFiles(files);
  };
  
  // This function would be passed to ERCProtestLetterGenerator to get protest letter data
  const onProtestLetterGenerated = async (data) => {
    console.log("onProtestLetterGenerated called with data:", data);
    setProtestLetterData(data);
    
    // Save protest letter data to queue when it's generated
    if (data) {
      try {
        // Update status to reflect progress
        const updatedStatus = data.zipPath ? 'PDF done' : 'LLM pass #1 complete';
        
        // Prepare submission data including the protest letter data
        const submissionData = {
          ...formData,
          status: updatedStatus,
          submissionData: {
            protestLetterData: data,
            lastSaved: new Date().toISOString()
          }
        };
        
        // Make API call to save
        await axios.post('/api/erc-protest/queue/save', submissionData);
        console.log('Saved protest letter data to queue with status:', updatedStatus);
      } catch (error) {
        console.error('Error saving protest letter data to queue:', error);
      }
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Debug log before form submission
      console.log("Form submission - protestLetterData:", protestLetterData);
      
      // Create FormData object for file upload
      const submitData = new FormData();
      
      // Append form field data
      Object.keys(formData).forEach(key => {
        if (key === 'timePeriods') {
          // Convert array to JSON string for FormData
          submitData.append(key, JSON.stringify(formData[key]));
        } else {
          submitData.append(key, formData[key]);
        }
      });
      
      // Check for existing trackingId and include it in the submission
      // This is a critical fix to prevent creating new records
      if (formData.trackingId) {
        console.log(`Including existing trackingId in submission: ${formData.trackingId}`);
        submitData.append('trackingId', formData.trackingId);
      }
      
      // Append disallowance notice files
      pdfFiles.forEach(file => {
        submitData.append('disallowanceNotices', file);
      });
      
      // If we have a ZIP package from the protest letter generator, include it
      if (protestLetterData && protestLetterData.zipPath) {
        // Normalize paths to use forward slashes only
        const normalizedZipPath = protestLetterData.zipPath.replace(/\\/g, '/');
        const normalizedPdfPath = protestLetterData.pdfPath ? protestLetterData.pdfPath.replace(/\\/g, '/') : '';
        
        console.log('Including protest package in submission (normalized):', normalizedZipPath);
        submitData.append('protestPackagePath', normalizedZipPath);
        submitData.append('protestLetterPath', normalizedPdfPath);
        
        // Also include the current quarter we processed
        if (protestLetterData.quarter) {
          console.log(`Including processed quarter in submission: ${protestLetterData.quarter}`);
          submitData.append('processedQuarter', protestLetterData.quarter);
        }
      } else {
        console.warn('No protest letter data available for submission');
      }
      
      // Send to backend API
      const response = await fetch('/api/erc-protest/submit', {
        method: 'POST',
        body: submitData
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // Save the trackingId we get back for future submissions
        if (result.trackingId && !formData.trackingId) {
          console.log(`Saving trackingId for future use: ${result.trackingId}`);
          setFormData(prev => ({
            ...prev,
            trackingId: result.trackingId
          }));
        }
        
        setSubmissionStatus({
          success: true,
          message: result.message || 'Submission successful. Processing has begun.',
          data: result
        });
        
        // Update queue entry with new status after successful submission
        try {
          const submissionData = {
            ...formData,
            submissionId: result.trackingId || formData.trackingId,
            status: 'PDF done',
            submissionData: {
              protestLetterData: protestLetterData,
              lastSaved: new Date().toISOString(),
              submitted: true,
              submissionTimestamp: new Date().toISOString()
            }
          };
          
          // Update the queue entry
          await axios.post('/api/erc-protest/queue/save', submissionData);
          console.log('Updated queue entry after successful submission');
        } catch (queueError) {
          console.error('Error updating queue after submission:', queueError);
        }
        
        setActiveStep(2); // Move to the final step
      } else {
        throw new Error(result.message || 'Submission failed');
      }
    } catch (error) {
      console.error("Form submission error:", error);
      setSubmissionStatus({
        success: false,
        message: `Error: ${error.message}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if form is valid to proceed to next step
  const isFormValid = () => {
    // All fields now optional - always return true
    return true;
  };
  
  // Handle next step
  const handleNext = () => {
    // Only save if going from step 0 to step 1
    // This prevents multiple saves when navigating around later steps
    if (activeStep === 0) {
      saveToQueue();
    } else {
      console.log('Skipping save on step transition since not at step 0');
    }
    setActiveStep(prevActiveStep => prevActiveStep + 1);
  };
  
  // Handle going back to previous step
  const handleBack = () => {
    setActiveStep(prevActiveStep => prevActiveStep - 1);
  };
  
  // Save current form data to queue
  const saveToQueue = async () => {
    // Don't save if there's no business name
    if (!formData.businessName.trim()) {
      setSaveMessage('Business name is required to save');
      setSaveSuccess(false);
      setSaveSnackbarOpen(true);
      return;
    }
    
    // Don't save if already saving
    if (isSaving) {
      console.log('Already saving, skipping duplicate save request');
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Prepare the data for saving
      const submissionData = {
        ...formData,
        status: 'Gathering data',
        submissionData: {
          // Include all the important fields explicitly to ensure they're saved
          governmentOrdersInfo: formData.governmentOrdersInfo,
          revenueReductionInfo: formData.revenueReductionInfo,
          isControlledGroup: formData.isControlledGroup,
          
          // Include all revenue data fields
          q1_2019: formData.q1_2019,
          q2_2019: formData.q2_2019,
          q3_2019: formData.q3_2019,
          q4_2019: formData.q4_2019,
          q1_2020: formData.q1_2020,
          q2_2020: formData.q2_2020,
          q3_2020: formData.q3_2020,
          q4_2020: formData.q4_2020,
          q1_2021: formData.q1_2021,
          q2_2021: formData.q2_2021,
          q3_2021: formData.q3_2021
        }
      };
      
      // Add quarter information if available
      if (formData.timePeriods && formData.timePeriods.length > 0) {
        submissionData.submissionData.timePeriodDetails = formData.timePeriods;
      }
      
      // Add timestamp
      submissionData.submissionData.lastSaved = new Date().toISOString();
      
      // IMPORTANT: Log the submission ID we're using for debugging
      console.log(`Saving to queue with ID: ${formData.trackingId || 'NEW SUBMISSION'}`);
      
      // Make API call to save
      const response = await axios.post('/api/erc-protest/queue/save', submissionData);
      
      if (response.data && response.data.success) {
        // Update tracking ID if we got one back
        if (response.data.submissionId && !formData.trackingId) {
          setFormData(prev => ({
            ...prev,
            trackingId: response.data.submissionId
          }));
          console.log(`Received and saved new tracking ID: ${response.data.submissionId}`);
        }
        
        setSaveMessage('Submission saved to queue');
        setSaveSuccess(true);
      } else {
        setSaveMessage('Failed to save submission');
        setSaveSuccess(false);
      }
    } catch (error) {
      console.error('Error saving to queue:', error);
      setSaveMessage('Error saving submission: ' + (error.response?.data?.message || error.message));
      setSaveSuccess(false);
    } finally {
      setIsSaving(false);
      setSaveSnackbarOpen(true);
    }
  };
  
  // Load a submission from the queue
  const handleLoadSubmission = (submission, editMode = false) => {
    // Extract the form data from the submission
    const {
      businessName,
      ein,
      location,
      businessWebsite,
      naicsCode,
      timePeriods,
      governmentOrdersInfo,
      revenueReductionInfo,
      isControlledGroup,
      submissionId,
      q1_2019,
      q2_2019,
      q3_2019,
      q4_2019,
      q1_2020,
      q2_2020,
      q3_2020,
      q4_2020,
      q1_2021,
      q2_2021,
      q3_2021,
      submissionData
    } = submission;
    
    // Update form data state
    setFormData({
      businessName: businessName || '',
      ein: ein || '',
      location: location || '',
      businessWebsite: businessWebsite || '',
      naicsCode: naicsCode || '',
      timePeriods: timePeriods || [],
      // Check both top-level and submissionData for these fields
      governmentOrdersInfo: governmentOrdersInfo || 
                         (submissionData?.governmentOrdersInfo) || '',
      revenueReductionInfo: revenueReductionInfo || 
                         (submissionData?.revenueReductionInfo) || '',
      trackingId: submissionId || '',
      isControlledGroup: isControlledGroup || 
                      (submissionData?.isControlledGroup) || false,
      // Check both top-level and submissionData for revenue fields
      q1_2019: q1_2019 || (submissionData?.q1_2019) || '',
      q2_2019: q2_2019 || (submissionData?.q2_2019) || '',
      q3_2019: q3_2019 || (submissionData?.q3_2019) || '',
      q4_2019: q4_2019 || (submissionData?.q4_2019) || '',
      q1_2020: q1_2020 || (submissionData?.q1_2020) || '',
      q2_2020: q2_2020 || (submissionData?.q2_2020) || '',
      q3_2020: q3_2020 || (submissionData?.q3_2020) || '',
      q4_2020: q4_2020 || (submissionData?.q4_2020) || '',
      q1_2021: q1_2021 || (submissionData?.q1_2021) || '',
      q2_2021: q2_2021 || (submissionData?.q2_2021) || '',
      q3_2021: q3_2021 || (submissionData?.q3_2021) || ''
    });
    
    // Set protest letter data if available
    if (submissionData && submissionData.protestLetterData) {
      setProtestLetterData(submissionData.protestLetterData);
    }
    
    // If editMode is true, always go to step 0 (form)
    // Otherwise, go to step 1 if there's enough data to proceed
    if (editMode) {
      setActiveStep(0);
    } else if (businessName && (timePeriods?.length > 0 || location)) {
      setActiveStep(1);
    } else {
      setActiveStep(0);
    }
    
    // Show success message
    setSaveMessage(`Loaded submission for ${businessName}`);
    setSaveSuccess(true);
    setSaveSnackbarOpen(true);
  };
  
  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 8 }}>
      <Grid container spacing={3}>
        {/* Main form area */}
        <Grid item xs={12} md={8}>
          <Paper elevation={3} sx={{ p: { xs: 2, md: 4 }, minHeight: '600px' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h4" gutterBottom>
                ERC Disallowance Protest Generator
              </Typography>
              <Button
                variant="outlined"
                startIcon={<SaveIcon />}
                onClick={saveToQueue}
                disabled={isSaving || !formData.businessName}
              >
                {isSaving ? 'Saving...' : 'Save to Queue'}
              </Button>
            </Box>
            <Divider sx={{ mb: 3 }} />
            
            <Stepper activeStep={activeStep} orientation="vertical" sx={{ mb: 4 }}>
              {/* Step 1: Business Information */}
              <Step>
                <StepLabel>Enter Business Information</StepLabel>
                <StepContent>
                  <form>
                    <Grid container spacing={3}>
                      {/* Business Information */}
                      <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                          Business Information
                        </Typography>
                        {formData.trackingId && (
                          <Typography variant="subtitle2" color="primary">
                            Tracking ID: {formData.trackingId}
                          </Typography>
                        )}
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Business Name"
                          name="businessName"
                          value={formData.businessName}
                          onChange={handleInputChange}
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="EIN"
                          name="ein"
                          value={formData.ein}
                          onChange={handleInputChange}
                          placeholder="XX-XXXXXXX"
                          inputProps={{
                            pattern: "[0-9]{2}-[0-9]{7}",
                            title: "EIN format: XX-XXXXXXX"
                          }}
                        />
                      </Grid>
                      
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          label="Business Location(s)"
                          name="location"
                          value={formData.location}
                          onChange={handleInputChange}
                          placeholder="City, State (use ; for multiple locations: City1, State1; City2, State2)"
                          helperText={formData.location && formData.location.includes(';') ? 
                            "Multiple locations detected. Orders will be generated for all jurisdictions." : 
                            "For multiple locations, separate each with semicolons (;)"}
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={formData.isControlledGroup || false}
                              onChange={(e) => {
                                setFormData(prevData => ({
                                  ...prevData,
                                  isControlledGroup: e.target.checked
                                }));
                              }}
                              name="isControlledGroup"
                            />
                          }
                          label="This is a controlled group with multiple entities/locations"
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Business Website"
                          name="businessWebsite"
                          value={formData.businessWebsite}
                          onChange={handleInputChange}
                          placeholder="https://example.com"
                          type="url"
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="NAICS Code"
                          name="naicsCode"
                          value={formData.naicsCode}
                          onChange={handleInputChange}
                          placeholder="6-digit NAICS Code"
                          inputProps={{
                            pattern: "[0-9]{6}",
                            title: "6-digit NAICS code"
                          }}
                        />
                      </Grid>
                      
                      {/* Government Orders Section - No longer required */}
                      <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                          Government Orders
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                          <InputLabel id="time-periods-label">Time Periods</InputLabel>
                          <Select
                            labelId="time-periods-label"
                            id="time-periods"
                            multiple
                            value={formData.timePeriods}
                            onChange={handleTimePeriodsChange}
                            input={<OutlinedInput label="Time Periods" />}
                            renderValue={(selected) => selected.join(', ')}
                            MenuProps={MenuProps}
                          >
                            {quarters.map((quarter) => (
                              <MenuItem key={quarter} value={quarter}>
                                <Checkbox checked={formData.timePeriods.indexOf(quarter) > -1} />
                                <ListItemText primary={quarter} />
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>

                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          multiline
                          rows={3}
                          label="Additional Information (Government Orders)"
                          name="governmentOrdersInfo"
                          value={formData.governmentOrdersInfo}
                          onChange={handleInputChange}
                          placeholder="Enter any additional details about government orders affecting your business..."
                        />
                      </Grid>
                      
                      {/* Revenue Reduction Section */}
                      <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                          Revenue Reduction
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Enter quarterly revenue amounts (optional)
                        </Typography>
                      </Grid>
                      
                      {/* Create input fields for each quarter */}
                      {revenueQuarters.map((quarter) => {
                        const fieldName = quarter.toLowerCase().replace(' ', '_');
                        return (
                          <Grid item xs={6} md={3} key={quarter}>
                            <TextField
                              fullWidth
                              label={`${quarter} Revenue`}
                              name={fieldName}
                              value={formData[fieldName]}
                              onChange={handleInputChange}
                              placeholder="0.00"
                              type="number"
                              InputProps={{
                                startAdornment: <span style={{ marginRight: '4px' }}>$</span>,
                              }}
                            />
                          </Grid>
                        );
                      })}
                      
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          multiline
                          rows={3}
                          label="Additional Information (Revenue Reduction)"
                          name="revenueReductionInfo"
                          value={formData.revenueReductionInfo}
                          onChange={handleInputChange}
                          placeholder="Enter any additional details about revenue reductions during COVID periods..."
                        />
                      </Grid>
                    </Grid>
                    
                    <Box sx={{ mb: 2, mt: 2 }}>
                      <Button
                        variant="contained"
                        onClick={handleNext}
                        sx={{ mt: 1, mr: 1 }}
                        disabled={!isFormValid()}
                      >
                        Continue to Generate Documents
                      </Button>
                    </Box>
                  </form>
                </StepContent>
              </Step>
              
              {/* Step 2: Generate COVID Order Prompt and Documents */}
              <Step>
                <StepLabel>Generate Required Documents</StepLabel>
                <StepContent>
                  {/* COVID Prompt Generator */}
                  <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                    COVID Orders Research Prompt
                  </Typography>
                  <COVIDPromptGenerator formData={formData} />
                  
                  <Divider sx={{ my: 3 }} />
                  
                  <Typography variant="h6" gutterBottom>
                    Upload Disallowance Notice
                  </Typography>
                  
                  <Grid container spacing={3}>
                    <Grid item xs={12}>
                      <Button
                        variant="outlined"
                        component="label"
                        startIcon={<FileUpload />}
                        sx={{ mt: 1 }}
                      >
                        Upload Disallowance Notices (PDF)
                        <input
                          type="file"
                          multiple
                          accept=".pdf"
                          hidden
                          onChange={handleFileUpload}
                        />
                      </Button>
                      {pdfFiles.length > 0 && (
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          {pdfFiles.length} file(s) selected
                        </Typography>
                      )}
                    </Grid>
                  </Grid>
                  
                  <Box sx={{ mb: 3, mt: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Generate Protest Letter
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      After completing your COVID orders research in ChatGPT, paste the ChatGPT conversation link below 
                      to generate a formal protest letter that you can download and submit to the IRS.
                    </Typography>
                    
                    {/* Add the Protest Letter Generator component - UPDATED TO PASS PDF FILES */}
                    <ERCProtestLetterGenerator 
                      formData={{
                        ...formData,
                        trackingId: submissionStatus?.data?.trackingId || formData.trackingId
                      }}
                      onGenerated={onProtestLetterGenerated}
                      pdfFiles={pdfFiles} // Pass the PDF files for address extraction
                    />
                  </Box>
                  
                  <Divider sx={{ my: 3 }} />
                  
                  <Box sx={{ mb: 2, mt: 2 }}>
                    <Button
                      variant="contained"
                      onClick={handleSubmit}
                      sx={{ mt: 1, mr: 1 }}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <CircularProgress size={24} sx={{ mr: 1 }} />
                          Processing...
                        </>
                      ) : 'Submit ERC Protest'}
                    </Button>
                    <Button
                      onClick={handleBack}
                      sx={{ mt: 1, mr: 1 }}
                    >
                      Back
                    </Button>
                  </Box>
                </StepContent>
              </Step>
              
              {/* Step 3: Simplified Confirmation */}
              <Step>
                <StepLabel>Submission Complete</StepLabel>
                <StepContent>
                  {submissionStatus && (
                    <Box p={3} bgcolor={submissionStatus.success ? 'success.light' : 'error.light'} borderRadius={1} textAlign="center">
                      {submissionStatus.success ? (
                        <>
                          <Typography variant="h6" mb={2}>
                            Submission Successful!
                          </Typography>
                          <Typography variant="body1" mb={3}>
                            Your ERC protest has been submitted. You can now create another protest letter or start a new submission.
                          </Typography>
                          {submissionStatus.data?.trackingId && (
                            <Typography variant="body2" color="primary">
                              Tracking ID: {submissionStatus.data.trackingId}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography variant="body1">
                          {submissionStatus.message || "An error occurred during submission. Please try again."}
                        </Typography>
                      )}
                    </Box>
                  )}
                  
                  {/* Navigation buttons - centered and prominent */}
                  <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', gap: 3 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      onClick={() => {
                        // Reset the form data
                        setFormData({
                          businessName: '',
                          ein: '',
                          location: '',
                          businessWebsite: '',
                          naicsCode: '',
                          timePeriods: [],
                          governmentOrdersInfo: '',
                          revenueReductionInfo: '',
                          trackingId: '', // Clear the tracking ID for a truly new submission
                          isControlledGroup: false,
                          // Reset all quarterly revenue fields
                          q1_2019: '',
                          q2_2019: '',
                          q3_2019: '',
                          q4_2019: '',
                          q1_2020: '',
                          q2_2020: '',
                          q3_2020: '',
                          q4_2020: '',
                          q1_2021: '',
                          q2_2021: '',
                          q3_2021: ''
                        });
                        // Reset files
                        setPdfFiles([]);
                        // Reset protest letter data
                        setProtestLetterData(null);
                        // Reset submission status
                        setSubmissionStatus(null);
                        // Go to first step
                        setActiveStep(0);
                      }}
                      startIcon={<AddIcon />}
                    >
                      Start New Submission
                    </Button>
                    
                    <Button
                      variant="outlined"
                      size="large"
                      onClick={() => {
                        // Go back to document generation step
                        setActiveStep(1);
                      }}
                      startIcon={<ArrowBackIcon />}
                    >
                      Generate Another Letter
                    </Button>
                  </Box>
                </StepContent>
              </Step>
            </Stepper>
          </Paper>
        </Grid>
        
        {/* Queue panel on the right */}
        <Grid item xs={12} md={4}>
          <SubmissionQueue onLoadSubmission={handleLoadSubmission} />
        </Grid>
      </Grid>
      
      {/* Save notification */}
      <Snackbar
        open={saveSnackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSaveSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSaveSnackbarOpen(false)} 
          severity={saveSuccess ? "success" : "error"}
          sx={{ width: '100%' }}
        >
          {saveMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default ERCProtestForm;