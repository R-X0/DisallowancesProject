import React, { useState, useEffect } from 'react';
import { 
  Box, Button, Paper, Typography, TextField, CircularProgress,
  Divider, Alert, Snackbar, IconButton, ButtonGroup, Tooltip,
  Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import { ContentCopy, CheckCircle, SwapHoriz } from '@mui/icons-material';
import axios from 'axios';

// Utility function to extract city and state from location string
const extractCityState = (location) => {
  // Assuming location format is "City, State"
  const parts = location.split(',');
  if (parts.length < 2) return { city: location.trim(), state: '' };
  
  return {
    city: parts[0].trim(),
    state: parts[1].trim()
  };
};

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

const COVIDPromptGenerator = ({ formData }) => {
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [promptType, setPromptType] = useState('covidOrders'); // Default to COVID orders
  const [selectedTimePeriod, setSelectedTimePeriod] = useState(''); // For selecting which period to focus on
  
  // Generate prompt function
  const generatePrompt = async () => {
    setGenerating(true);
    
    try {
      const { city, state } = extractCityState(formData.location || '');
      const businessType = getNaicsDescription(formData.naicsCode);
      
      // Use the selected time period for generating the prompt
      const timePeriod = selectedTimePeriod;
      
      // Get all selected time periods for context
      const allPeriods = formData.timePeriods ? formData.timePeriods.join(', ') : timePeriod;
      
      // Extract quarter and year from time period
      let quarter = '';
      let year = '';
      
      if (timePeriod) {
        const parts = timePeriod.split(' ');
        if (parts.length === 2) {
          quarter = parts[0];
          year = parts[1];
        }
      }
      
      // Choose the right base prompt based on promptType
      let basePrompt = '';
      
      if (promptType === 'covidOrders') {
        // Improved template prompt for COVID orders research with better structure
        basePrompt = `Please provide all federal, state, county, and city COVID-related government orders that would affect a "${businessType}" business located in ${city}, ${state} during ${timePeriod}.

For each order, provide the following information using this EXACT format:

• Order Name: [Full name of the order/proclamation]
• Order Number: [Official number or identifier]
• Date Enacted: [MM/DD/YYYY]
• Date Rescinded: [MM/DD/YYYY or "Still in effect during ${timePeriod}" if applicable]
• Order Summary: [2-3 sentence description of what the order mandated]
• Impact on Quarter: [How this specifically affected a ${businessType} during ${timePeriod}]

For each level of government (federal, state, county, city), organize the orders chronologically. Only include orders that were in effect during ${timePeriod} or that had a continuing impact on business operations during that quarter.

For each order, explain:
1. Exactly what restrictions were imposed (capacity limits, mask requirements, social distancing, etc.)
2. How these restrictions specifically impacted a ${businessType}
3. Whether the business would have experienced a "more than nominal" effect (at least 10% impact on operations or revenue)

Please be as specific and detailed as possible about the impact on normal business operations during ${timePeriod}.

IMPORTANT: Do NOT include web links or URLs in your response. Do NOT refer to any business internal records or documentation.`;
      } else {
        // Improved template prompt for Form 886-A, now including all selected quarters
        basePrompt = `Please help me create a comprehensive Form 886-A response for ${formData.businessName}, a ${businessType} located in ${city}, ${state}, regarding their Employee Retention Credit (ERC) claim for the following quarters: ${allPeriods}.

First, provide a general overview of the business operations for ${formData.businessName}.

Then, research and list ALL federal, state, county, and city government orders that would have affected this ${businessType} from Q2 2020 through Q3 2021, with particular focus on ${allPeriods}.

For each government order, use this EXACT format:

• Order Name: [Full name of the order/proclamation]
• Order Number: [Official number or identifier]
• Date Enacted: [MM/DD/YYYY]
• Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
• Order Summary: [2-3 sentence description of what the order mandated]
• Impact on Quarter: [How this specifically affected the business and for what period of time]

Finally, create a Form 886-A document with the following structure:
1. Issue - Define the question of whether the business was fully or partially suspended by government orders
2. Facts - Detail the business operations and how they were affected by specific government orders
3. Law - Explain the ERC provisions, IRS Notice 2021-20, and other relevant guidance
4. Argument - Present the case for why the business qualifies quarter by quarter
5. Conclusion - Summarize the eligibility determination

The document should prioritize official IRS and government sources and all applicable government orders that would have affected the business. Make a strong case that ${formData.businessName} qualified for ERC due to full or partial shutdowns from government orders during each of the following quarters: ${allPeriods}.

IMPORTANT: Do NOT include web links or URLs in your response. Do NOT refer to any business internal records or documentation. Use consistent bullet point formatting (•) throughout the document.`;
      }
      
      // Use OpenAI API to generate a customized prompt based on the business info
      try {
        const response = await axios.post('/api/erc-protest/chatgpt/generate-prompt', {
          basePrompt,
          businessInfo: {
            businessType,
            city,
            state,
            quarter,
            year,
            timePeriod,
            allPeriods
          }
        });
        
        if (response.data && response.data.prompt) {
          setPrompt(response.data.prompt);
        } else {
          // If API fails or isn't available, fall back to the base prompt
          setPrompt(basePrompt);
        }
      } catch (apiError) {
        console.error('Error calling GPT API:', apiError);
        // Fall back to the base prompt if API call fails
        setPrompt(basePrompt);
      }
    } catch (error) {
      console.error('Error generating prompt:', error);
      // In case of any error, just use a simpler version of the prompt
      const { city, state } = extractCityState(formData.location || '');
      const businessType = getNaicsDescription(formData.naicsCode);
      const timePeriod = selectedTimePeriod;
      const allPeriods = formData.timePeriods ? formData.timePeriods.join(', ') : timePeriod;
      
      if (promptType === 'covidOrders') {
        setPrompt(`Please provide all COVID-related government orders affecting a "${businessType}" business in ${city}, ${state} during ${timePeriod}. For each order, include: Order Name, Order Number, Date Enacted, Date Rescinded, Order Summary, and Impact on Quarter. Do NOT include web links or URLs in your response.`);
      } else {
        setPrompt(`Please help create a Form 886-A response for ${formData.businessName}, a ${businessType} in ${city}, ${state}, regarding their ERC claim for the following quarters: ${allPeriods}. Include sections for Issue, Facts, Law, Argument, and Conclusion. Do NOT include web links or URLs in your response.`);
      }
    } finally {
      setGenerating(false);
    }
  };
  
  useEffect(() => {
    if (formData && Object.keys(formData).length > 0) {
      // Set default selected time period when form data changes
      if (formData.timePeriods && formData.timePeriods.length > 0 && !selectedTimePeriod) {
        setSelectedTimePeriod(formData.timePeriods[0]);
      }
      
      if (selectedTimePeriod) {
        generatePrompt();
      }
    }
  }, [formData, promptType, selectedTimePeriod, generatePrompt]); // Added generatePrompt as a dependency
  
  // Handle time period selection change
  const handleTimePeriodChange = (event) => {
    setSelectedTimePeriod(event.target.value);
  };
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(prompt)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  };
  
  // Check if we have time periods data
  const hasTimePeriods = formData.timePeriods && formData.timePeriods.length > 0;
  
  return (
    <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6" gutterBottom>
          Research Prompt Generator
        </Typography>
        <ButtonGroup variant="contained" aria-label="prompt type toggle">
          <Tooltip title="Generate a prompt for COVID-19 orders research">
            <Button 
              color={promptType === 'covidOrders' ? 'primary' : 'inherit'}
              onClick={() => setPromptType('covidOrders')}
            >
              COVID Orders
            </Button>
          </Tooltip>
          <Tooltip title="Generate a prompt for Form 886-A substantiation">
            <Button 
              color={promptType === 'form886A' ? 'primary' : 'inherit'}
              onClick={() => setPromptType('form886A')}
              startIcon={<SwapHoriz />}
            >
              Form 886-A
            </Button>
          </Tooltip>
        </ButtonGroup>
      </Box>
      
      <Divider sx={{ mb: 2 }} />
      
      {/* Time Period Selector (only show for COVID Orders type) */}
      {hasTimePeriods && promptType === 'covidOrders' && (
        <Box mb={3}>
          <FormControl fullWidth size="small">
            <InputLabel id="select-time-period-label">Select Quarter for Research</InputLabel>
            <Select
              labelId="select-time-period-label"
              id="select-time-period"
              value={selectedTimePeriod}
              onChange={handleTimePeriodChange}
              label="Select Quarter for Research"
            >
              {formData.timePeriods.map((period) => (
                <MenuItem key={period} value={period}>{period}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            {promptType === 'covidOrders' 
              ? 'Select a specific quarter to research COVID orders. For Form 886-A documents, all quarters will be included.' 
              : 'Form 886-A documents will include all selected quarters.'}
          </Typography>
        </Box>
      )}
      
      <Typography variant="body2" color="text.secondary" mb={2}>
        {promptType === 'covidOrders' 
          ? `Generate a prompt to research specific COVID-19 orders that affected your business during ${selectedTimePeriod || 'the selected time period'}.`
          : `Generate a prompt to create an IRS Form 886-A response for enhanced ERC claim substantiation for ${hasTimePeriods ? formData.timePeriods.join(', ') : 'the selected time periods'}.`}
      </Typography>
      
      {generating ? (
        <Box display="flex" justifyContent="center" alignItems="center" py={4}>
          <CircularProgress size={40} />
          <Typography variant="body1" sx={{ ml: 2 }}>
            Generating prompt...
          </Typography>
        </Box>
      ) : prompt ? (
        <>
          <Box mb={2}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {promptType === 'covidOrders' 
                ? `Use this prompt in GPT to research COVID-19 orders affecting your business during ${selectedTimePeriod}:`
                : `Use this prompt in GPT to generate a Form 886-A response for your ERC claim for ${hasTimePeriods ? formData.timePeriods.join(', ') : 'the selected time periods'}:`}
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={8}
              value={prompt}
              variant="outlined"
              InputProps={{
                readOnly: true,
                sx: { fontFamily: 'monospace', fontSize: '0.9rem' }
              }}
            />
          </Box>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Copy this prompt and paste it into a GPT interface for detailed research
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={copied ? <CheckCircle /> : <ContentCopy />}
              onClick={copyToClipboard}
              disabled={copied}
            >
              {copied ? 'Copied!' : 'Copy Prompt'}
            </Button>
          </Box>
        </>
      ) : (
        <Alert severity="info">
          {!hasTimePeriods 
            ? 'Please select at least one time period in the business information form.' 
            : promptType === 'covidOrders' && !selectedTimePeriod
              ? 'Please select a specific quarter for COVID orders research.'
              : 'Fill out the business information form to generate a research prompt.'}
        </Alert>
      )}
      
      <Snackbar
        open={copied}
        autoHideDuration={3000}
        onClose={() => setCopied(false)}
        message="Prompt copied to clipboard!"
        action={
          <IconButton size="small" color="inherit" onClick={() => setCopied(false)}>
            <CheckCircle />
          </IconButton>
        }
      />
    </Paper>
  );
};

export default COVIDPromptGenerator;