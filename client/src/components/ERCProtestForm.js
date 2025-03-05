import React, { useState } from 'react';
import { 
  Container, Box, TextField, MenuItem, Button, 
  Typography, Paper, Grid, Divider, CircularProgress,
  Stepper, Step, StepLabel, StepContent, Alert, Chip
} from '@mui/material';
import { FileUpload } from '@mui/icons-material';
import COVIDPromptGenerator from './COVIDPromptGenerator';
import ERCProtestLetterGenerator from './ERCProtestLetterGenerator';

const ERCProtestForm = () => {
  // State for form data
  const [formData, setFormData] = useState({
    businessName: '',
    ein: '',
    location: '',
    businessWebsite: '',
    naicsCode: '',
    timePeriod: '',
    additionalInfo: ''
  });
  
  const [pdfFiles, setPdfFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  
  // Available quarters for selection
  const quarters = [
    'Q2 2020', 'Q3 2020', 'Q4 2020', 
    'Q1 2021', 'Q2 2021', 'Q3 2021', 'Q4 2021'
  ];
  
  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };
  
  // Handle file uploads
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setPdfFiles(files);
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Create FormData object for file upload
      const submitData = new FormData();
      
      // Append form field data
      Object.keys(formData).forEach(key => {
        submitData.append(key, formData[key]);
      });
      
      // Append files
      pdfFiles.forEach(file => {
        submitData.append('disallowanceNotices', file);
      });
      
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

        // Check if submission was added to Google Sheets after a short delay
        setTimeout(async () => {
          try {
            const statusResponse = await fetch(`/api/erc-protest/status/${result.trackingId}`);
            const statusData = await statusResponse.json();
            
            if (statusResponse.ok && statusData.success) {
              console.log('Google Sheets status:', statusData.status);
              setSubmissionStatus(prev => ({
                ...prev,
                googleSheetsStatus: statusData.status,
                message: prev.message + ' Added to admin tracking dashboard.'
              }));
            }
          } catch (statusError) {
            console.error('Error checking Google Sheets status:', statusError);
          }
        }, 2000);
        
        setActiveStep(2); // Move to the final step
      } else {
        throw new Error(result.message || 'Submission failed');
      }
    } catch (error) {
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
      formData.timePeriod
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
                    <TextField
                      fullWidth
                      required
                      select
                      label="Time Period"
                      name="timePeriod"
                      value={formData.timePeriod}
                      onChange={handleInputChange}
                    >
                      {quarters.map((quarter) => (
                        <MenuItem key={quarter} value={quarter}>
                          {quarter}
                        </MenuItem>
                      ))}
                    </TextField>
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
          
          {/* Step 3: Confirmation */}
          <Step>
            <StepLabel>Submission Complete</StepLabel>
            <StepContent>
              {submissionStatus && (
                <Box p={2} bgcolor={submissionStatus.success ? 'success.light' : 'error.light'} borderRadius={1}>
                  <Typography variant="body1">
                    {submissionStatus.message}
                  </Typography>
                  {submissionStatus.success && submissionStatus.data?.trackingId && (
                    <Typography variant="body2" mt={1}>
                      Tracking ID: {submissionStatus.data.trackingId}
                    </Typography>
                  )}
                  
                  {submissionStatus.googleSheetsStatus && (
                    <Typography variant="body2" mt={1}>
                      Admin Dashboard Status: <Chip 
                        size="small" 
                        color="primary"
                        label={submissionStatus.googleSheetsStatus} 
                      />
                    </Typography>
                  )}
                  
                  {submissionStatus.success && (
                    <Typography variant="body2" mt={2}>
                      Your submission has been received. We will process your ERC protest using the information provided.
                      You can track the status of your submission using the tracking ID above.
                    </Typography>
                  )}
                </Box>
              )}
            </StepContent>
          </Step>
        </Stepper>
      </Paper>
    </Container>
  );
};

export default ERCProtestForm;