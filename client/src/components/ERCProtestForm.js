import React, { useState, useEffect } from 'react';
import { 
  Container, Box, TextField, MenuItem, Button, 
  Typography, Paper, Grid, Divider, CircularProgress,
  Stepper, Step, StepLabel, StepContent, 
  Select, FormControl, InputLabel, OutlinedInput, Checkbox, ListItemText
} from '@mui/material';
import { 
  FileUpload, 
  AddCircleOutline as AddIcon, 
  ArrowBack as ArrowBackIcon 
} from '@mui/icons-material';
import COVIDPromptGenerator from './COVIDPromptGenerator';
import ERCProtestLetterGenerator from './ERCProtestLetterGenerator';

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
    additionalInfo: ''
  });
  
  const [pdfFiles, setPdfFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [protestLetterData, setProtestLetterData] = useState(null);
  
  // Available quarters for selection
  const quarters = [
    'Q2 2020', 'Q3 2020', 'Q4 2020', 
    'Q1 2021', 'Q2 2021', 'Q3 2021', 'Q4 2021'
  ];
  
  // Debug effect - log whenever protestLetterData changes
  useEffect(() => {
    console.log("protestLetterData changed:", protestLetterData);
  }, [protestLetterData]);
  
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
  const onProtestLetterGenerated = (data) => {
    console.log("onProtestLetterGenerated called with data:", data);
    setProtestLetterData(data);
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
        
        // Debug log to verify the data was added to FormData
        console.log('FormData after adding paths:', { 
          packagePath: submitData.get('protestPackagePath'), 
          letterPath: submitData.get('protestLetterPath')
        });
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
        setSubmissionStatus({
          success: true,
          message: 'Submission successful. Processing has begun.',
          data: result
        });
        
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
    return (
      formData.businessName &&
      formData.ein &&
      formData.location &&
      formData.naicsCode &&
      formData.timePeriods.length > 0 // Check for at least one selected time period
    );
  };
  
  // Handle next step
  const handleNext = () => {
    setActiveStep(prevActiveStep => prevActiveStep + 1);
  };
  
  // Handle going back to previous step
  const handleBack = () => {
    setActiveStep(prevActiveStep => prevActiveStep - 1);
  };
  
  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          ERC Disallowance Protest Generator
        </Typography>
        <Divider sx={{ mb: 3 }} />
        
        <Stepper activeStep={activeStep} orientation="vertical">
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
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      required
                      label="Business Name"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleInputChange}
                    />
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      required
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
                      required
                      label="Business Location"
                      name="location"
                      value={formData.location}
                      onChange={handleInputChange}
                      placeholder="City, State"
                    />
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      required
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
                      required
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
                  
                  {/* Time Period */}
                  <Grid item xs={12}>
                    <Typography variant="h6" gutterBottom>
                      Claim Information
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    {/* Replaced single select with multi-select */}
                    <FormControl fullWidth required>
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
                      rows={4}
                      label="Additional Information"
                      name="additionalInfo"
                      value={formData.additionalInfo}
                      onChange={handleInputChange}
                      placeholder="Any additional details about the business operation during COVID..."
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
                
                {/* Add the Protest Letter Generator component */}
                <ERCProtestLetterGenerator 
                  formData={{
                    ...formData,
                    trackingId: submissionStatus?.data?.trackingId
                  }}
                  onGenerated={onProtestLetterGenerated}
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
              
              {/* Debug section to show current protestLetterData */}
              <Box mt={3} p={2} bgcolor="grey.100" borderRadius={1}>
                <Typography variant="subtitle2">Debug - Current Document Data:</Typography>
                <pre style={{ overflow: 'auto', maxHeight: '100px' }}>
                  {protestLetterData ? JSON.stringify(protestLetterData, null, 2) : 'No data yet'}
                </pre>
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
                      additionalInfo: ''
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
    </Container>
  );
};

export default ERCProtestForm;