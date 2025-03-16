import React, { useState, useEffect, useCallback } from 'react';
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

// Calculate revenue decline percentages between quarters
const calculateRevenueDeclines = (formData) => {
  const declines = [];
  
  // Calculate 2020 vs 2019 declines
  if (formData.q1_2020 && formData.q1_2019 && parseFloat(formData.q1_2019) > 0) {
    const decline = (1 - parseFloat(formData.q1_2020) / parseFloat(formData.q1_2019)) * 100;
    if (decline > 0) {
      declines.push({
        quarter: 'Q1 2020',
        baseQuarter: 'Q1 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`
      });
    }
  }
  
  if (formData.q2_2020 && formData.q2_2019 && parseFloat(formData.q2_2019) > 0) {
    const decline = (1 - parseFloat(formData.q2_2020) / parseFloat(formData.q2_2019)) * 100;
    if (decline > 0) {
      declines.push({
        quarter: 'Q2 2020',
        baseQuarter: 'Q2 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`
      });
    }
  }
  
  if (formData.q3_2020 && formData.q3_2019 && parseFloat(formData.q3_2019) > 0) {
    const decline = (1 - parseFloat(formData.q3_2020) / parseFloat(formData.q3_2019)) * 100;
    if (decline > 0) {
      declines.push({
        quarter: 'Q3 2020',
        baseQuarter: 'Q3 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`
      });
    }
  }
  
  if (formData.q4_2020 && formData.q4_2019 && parseFloat(formData.q4_2019) > 0) {
    const decline = (1 - parseFloat(formData.q4_2020) / parseFloat(formData.q4_2019)) * 100;
    if (decline > 0) {
      declines.push({
        quarter: 'Q4 2020',
        baseQuarter: 'Q4 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`
      });
    }
  }
  
  // Calculate 2021 vs 2019 declines
  if (formData.q1_2021 && formData.q1_2019 && parseFloat(formData.q1_2019) > 0) {
    const decline = (1 - parseFloat(formData.q1_2021) / parseFloat(formData.q1_2019)) * 100;
    if (decline > 0) {
      declines.push({
        quarter: 'Q1 2021',
        baseQuarter: 'Q1 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`
      });
    }
  }
  
  if (formData.q2_2021 && formData.q2_2019 && parseFloat(formData.q2_2019) > 0) {
    const decline = (1 - parseFloat(formData.q2_2021) / parseFloat(formData.q2_2019)) * 100;
    if (decline > 0) {
      declines.push({
        quarter: 'Q2 2021',
        baseQuarter: 'Q2 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`
      });
    }
  }
  
  if (formData.q3_2021 && formData.q3_2019 && parseFloat(formData.q3_2019) > 0) {
    const decline = (1 - parseFloat(formData.q3_2021) / parseFloat(formData.q3_2019)) * 100;
    if (decline > 0) {
      declines.push({
        quarter: 'Q3 2021',
        baseQuarter: 'Q3 2019',
        decline: decline.toFixed(2),
        percentDecline: `${decline.toFixed(2)}%`
      });
    }
  }
  
  return declines;
};

// Determine which quarters qualify for ERC based on revenue decline
const getQualifyingQuarters = (declines) => {
  const qualifying = [];
  
  for (const decline of declines) {
    // For 2020, need 50%+ decline to qualify
    if (decline.quarter.includes('2020') && parseFloat(decline.decline) >= 50) {
      qualifying.push(decline.quarter);
    }
    // For 2021, need 20%+ decline to qualify
    else if (decline.quarter.includes('2021') && parseFloat(decline.decline) >= 20) {
      qualifying.push(decline.quarter);
    }
  }
  
  return qualifying;
};

// Determine which approach the user is focusing on - government orders or revenue reduction
const determineUserApproach = (formData) => {
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
  
  if (governmentOrderScore > revenueReductionScore) {
    return 'governmentOrders';
  } else if (revenueReductionScore > governmentOrderScore) {
    return 'revenueReduction';
  } else if (governmentOrderScore > 0) {
    // If scores are tied but we have some government order info, default to that
    return 'governmentOrders';
  } else if (revenueReductionScore > 0) {
    // If scores are tied but we have some revenue info, use that
    return 'revenueReduction';
  } else {
    // Default if no meaningful data in either section
    return 'governmentOrders';
  }
};

const COVIDPromptGenerator = ({ formData }) => {
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [promptType, setPromptType] = useState('covidOrders'); // Default to COVID orders
  const [selectedTimePeriod, setSelectedTimePeriod] = useState(''); // For selecting which period to focus on
  
  // Wrap generatePrompt in useCallback to prevent it from changing on every render
  const generatePrompt = useCallback(async () => {
    // Don't generate if we don't have basic business info
    if (!formData.businessName || !formData.ein || !formData.location) {
      console.log("Missing basic business info, skipping prompt generation");
      return;
    }
    
    // Don't generate for COVID Orders if no time period is selected and we have time periods
    if (
      promptType === 'covidOrders' && 
      !selectedTimePeriod && 
      formData.timePeriods && 
      formData.timePeriods.length > 0
    ) {
      console.log("No time period selected for COVID Orders, skipping prompt generation");
      return;
    }
    
    setGenerating(true);
    console.log("Generating prompt...");
    
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
      
      // Calculate revenue declines for relevant information
      const revenueDeclines = calculateRevenueDeclines(formData);
      const qualifyingQuarters = getQualifyingQuarters(revenueDeclines);
      
      // Determine which approach the user is focusing on
      const approachFocus = determineUserApproach(formData);
      
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

For each level of government (federal, state, county, city), organize the orders chronologically. Only include orders that were in effect during ${timePeriod} or that had a continuing impact on business operations during that quarter.`;

        // Add specific instructions based on approach focus
        if (approachFocus === 'governmentOrders') {
          basePrompt += `\n\nSpecifically focus on orders that would have caused a partial or full suspension of business operations. A partial suspension means that "more than a nominal portion" (at least 10% of operations) were suspended due to government orders. Pay particular attention to: 
- Capacity restrictions (indoor/outdoor)
- Social distancing requirements
- Group gathering limits
- Business hours limitations
- Service delivery restrictions
- Any requirements that significantly altered how the business operated

${formData.governmentOrdersInfo ? `\nAdditional context about the business operations: ${formData.governmentOrdersInfo}` : ''}`;
        } else if (approachFocus === 'revenueReduction') {
          basePrompt += `\n\nIn addition to identifying government orders, please analyze how these orders might have contributed to the business's revenue decline during this period.

${formData.revenueReductionInfo ? `\nContext about the business's revenue situation: ${formData.revenueReductionInfo}` : ''}`;

          // If we have revenue data, include it
          if (revenueDeclines.length > 0) {
            basePrompt += `\n\nFor context, the business experienced the following revenue declines:
${revenueDeclines.map(d => `- ${d.quarter}: ${d.percentDecline} decline compared to ${d.baseQuarter}`).join('\n')}

${qualifyingQuarters.length > 0 ? `Based on revenue decline thresholds (50%+ for 2020, 20%+ for 2021), the following quarters would qualify for ERC: ${qualifyingQuarters.join(', ')}` : 'None of the quarters meet the ERC revenue decline thresholds (50%+ for 2020, 20%+ for 2021).'}`;
          }
        }

        basePrompt += `\n\nFor each order, explain:
1. Exactly what restrictions were imposed (capacity limits, mask requirements, social distancing, etc.)
2. How these restrictions specifically impacted a ${businessType}
3. Whether the business would have experienced a "more than nominal" effect (at least 10% impact on operations or revenue)

Please be as specific and detailed as possible about the impact on normal business operations during ${timePeriod}.

IMPORTANT: 
1. PRIORITIZE providing the official government orders themselves as your primary sources - include direct links to the actual order text when available (e.g., official government websites hosting the orders).
2. For each order, include a link to the full text of the original order if possible.
3. Only use news articles or secondary sources if the original government order text cannot be found.
4. The best attachments will always be a copy of the order itself rather than an article about the order.
5. Include comprehensive information about each order's impact on the specific business type.`;
      } else {
        // Improved template prompt for Form 886-A, now including all selected quarters
        basePrompt = `Please help me create a comprehensive Form 886-A response for ${formData.businessName}, a ${businessType} located in ${city}, ${state}, regarding their Employee Retention Credit (ERC) claim for the following quarters: ${allPeriods}.

First, provide a general overview of the business operations for ${formData.businessName}.`;

        // Add approach-specific content
        if (approachFocus === 'governmentOrders') {
          basePrompt += `\n\nThis ERC claim is primarily based on the full or partial suspension of operations due to government orders. 

${formData.governmentOrdersInfo ? `Additional context about how government orders affected the business: ${formData.governmentOrdersInfo}` : ''}

Research and list ALL federal, state, county, and city government orders that would have affected this ${businessType} from Q2 2020 through Q3 2021, with particular focus on ${allPeriods}.`;
        } else if (approachFocus === 'revenueReduction') {
          basePrompt += `\n\nThis ERC claim is primarily based on the significant decline in gross receipts due to the COVID-19 pandemic.

${formData.revenueReductionInfo ? `Additional context about the business's revenue situation: ${formData.revenueReductionInfo}` : ''}`;

          // If we have revenue data, include it
          if (revenueDeclines.length > 0) {
            basePrompt += `\n\nThe business experienced the following revenue declines:
${revenueDeclines.map(d => `- ${d.quarter}: ${d.percentDecline} decline compared to ${d.baseQuarter}`).join('\n')}

${qualifyingQuarters.length > 0 ? `Based on revenue decline thresholds (50%+ for 2020, 20%+ for 2021), the following quarters qualify for ERC based on revenue decline: ${qualifyingQuarters.join(', ')}` : 'None of the quarters meet the ERC revenue decline thresholds (50%+ for 2020, 20%+ for 2021).'}`;
          }
          
          // Still include information about government orders as context
          basePrompt += `\n\nAlthough the claim is primarily based on revenue decline, please also research and list any government orders that may have affected this ${businessType} during the claimed quarters.`;
        }

        basePrompt += `\n\nFor each government order, use this EXACT format:

• Order Name: [Full name of the order/proclamation]
• Order Number: [Official number or identifier]
• Date Enacted: [MM/DD/YYYY]
• Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
• Order Summary: [2-3 sentence description of what the order mandated]
• Impact on Quarter: [How this specifically affected the business and for what period of time]

Finally, create a Form 886-A document with the following structure:
1. Issue - Define the question of whether the business was fully or partially suspended by government orders or experienced a significant decline in gross receipts
2. Facts - Detail the business operations and how they were affected by specific government orders and/or the pandemic's economic impact
3. Law - Explain the ERC provisions, IRS Notice 2021-20, and other relevant guidance
4. Argument - Present the case for why the business qualifies quarter by quarter
5. Conclusion - Summarize the eligibility determination

The document should prioritize official IRS and government sources and all applicable government orders that would have affected the business. Make a strong case that ${formData.businessName} qualified for ERC due to ${approachFocus === 'governmentOrders' ? 'full or partial shutdowns from government orders' : 'significant decline in gross receipts and/or full or partial shutdowns'} during each of the following quarters: ${allPeriods}.

IMPORTANT: 
1. PRIORITIZE citing official government orders as your primary sources - include direct links to the actual order text when available (e.g., official government websites hosting the orders).
2. For each order referenced, provide a link to the full text of the original order if possible.
3. Only use news articles or secondary sources if the original government order text cannot be found.
4. The best attachments will always be a copy of the order itself rather than an article about the order.
5. Use consistent bullet point formatting (•) throughout the document.
6. Include comprehensive information about each order's impact on the specific business type.`;
      }
      
      // Use OpenAI API to generate a customized prompt based on the business info
      try {
        console.log("Calling API to generate customized prompt...");
        const response = await axios.post('/api/erc-protest/chatgpt/generate-prompt', {
          basePrompt,
          businessInfo: {
            businessType,
            city,
            state,
            quarter,
            year,
            timePeriod,
            allPeriods,
            revenueDeclines,
            qualifyingQuarters,
            approachFocus,
            governmentOrdersInfo: formData.governmentOrdersInfo || '',
            revenueReductionInfo: formData.revenueReductionInfo || ''
          }
        });
        
        if (response.data && response.data.prompt) {
          console.log("Successfully received customized prompt from API");
          setPrompt(response.data.prompt);
        } else {
          // If API fails or isn't available, fall back to the base prompt
          console.log("API response missing prompt, falling back to base prompt");
          setPrompt(basePrompt);
        }
      } catch (apiError) {
        console.error('Error calling GPT API:', apiError);
        // Fall back to the base prompt if API call fails
        console.log("API call failed, falling back to base prompt");
        setPrompt(basePrompt);
      }
    } catch (error) {
      console.error('Error generating prompt:', error);
      // Don't set any fallback prompt
    } finally {
      setGenerating(false);
    }
  }, [formData, promptType, selectedTimePeriod]); // Added dependencies here
  
  // Effect to set default selected time period when form data changes
  // This needs to run FIRST before any prompt generation
  useEffect(() => {
    console.log("Effect for setting default time period running...");
    if (formData && formData.timePeriods && formData.timePeriods.length > 0) {
      // Only set if not already set or if it's not in the available time periods
      if (!selectedTimePeriod || !formData.timePeriods.includes(selectedTimePeriod)) {
        console.log(`Setting default time period to ${formData.timePeriods[0]}`);
        setSelectedTimePeriod(formData.timePeriods[0]);
      } else {
        console.log(`Keeping existing selected time period: ${selectedTimePeriod}`);
      }
    }
  }, [formData, formData.timePeriods, selectedTimePeriod]);
  
  // Effect to trigger prompt generation when:
  // 1. The prompt type changes
  // 2. The selected time period changes
  // 3. Essential form data changes
  useEffect(() => {
    console.log("Effect for prompt generation running...");
    console.log(`Current state: promptType=${promptType}, selectedTimePeriod=${selectedTimePeriod}`);
    
    const hasBasicInfo = formData.businessName && formData.ein && formData.location;
    
    if (!hasBasicInfo) {
      console.log("Missing basic business info, skipping prompt generation");
      return;
    }
    
    // IMPORTANT FIX: Don't attempt to generate prompt until selectedTimePeriod is set
    if (promptType === 'covidOrders' && !selectedTimePeriod && formData.timePeriods && formData.timePeriods.length > 0) {
      console.log("Time period not yet selected, waiting...");
      return;
    }
    
    // Add a small delay to ensure all state updates have settled
    const timeoutId = setTimeout(() => {
      console.log("Delayed prompt generation starting...");
      
      // For form886A, we don't need a selected time period
      if (promptType === 'form886A') {
        console.log("Form 886A selected, generating prompt");
        generatePrompt();
        return;
      }
      
      // For COVID orders, verify we have a time period selected
      if (promptType === 'covidOrders') {
        if (selectedTimePeriod) {
          // If we already have a selected time period, generate the prompt
          console.log(`Time period selected (${selectedTimePeriod}), generating prompt`);
          generatePrompt();
        } else {
          console.log("No time period selected for COVID Orders, skipping prompt generation");
        }
      }
    }, 300); // Small delay to ensure state is settled
    
    // Clean up timeout if component unmounts or effect runs again
    return () => clearTimeout(timeoutId);
  }, [promptType, selectedTimePeriod, formData.businessName, formData.ein, formData.location, formData.naicsCode, formData.timePeriods, generatePrompt]);
  
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
  
  // Check if we have revenue data
  const hasRevenueData = 
    formData.q1_2019 || formData.q2_2019 || formData.q3_2019 || formData.q4_2019 ||
    formData.q1_2020 || formData.q2_2020 || formData.q3_2020 || formData.q4_2020 ||
    formData.q1_2021 || formData.q2_2021 || formData.q3_2021;
  
  // Determine user approach for display purposes
  const userApproach = determineUserApproach(formData);
  
  // Get qualifying quarters based on revenue data
  const revenueDeclines = calculateRevenueDeclines(formData);
  const qualifyingQuarters = getQualifyingQuarters(revenueDeclines);
  
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
      
      {/* Data Summary - Show what approach we're using */}
      {(hasTimePeriods || hasRevenueData) && (
        <Box mb={3} p={2} bgcolor="info.lighter" borderRadius={1}>
          <Typography variant="subtitle2" fontWeight="bold">
            ERC Qualification Approach: {userApproach === 'governmentOrders' ? 'Government Orders (Suspension)' : 'Revenue Reduction'}
          </Typography>
          
          {hasTimePeriods && (
            <Typography variant="body2">
              Time Periods Selected: {formData.timePeriods.join(', ')}
            </Typography>
          )}
          
          {revenueDeclines.length > 0 && (
            <>
              <Typography variant="body2" mt={1}>
                Revenue Declines:
              </Typography>
              <ul style={{ margin: '4px 0', paddingLeft: '24px' }}>
                {revenueDeclines.map((decline, index) => (
                  <li key={index}>
                    <Typography variant="body2">
                      {decline.quarter}: {decline.percentDecline} decline vs {decline.baseQuarter}
                      {(decline.quarter.includes('2020') && parseFloat(decline.decline) >= 50) || 
                      (decline.quarter.includes('2021') && parseFloat(decline.decline) >= 20) 
                        ? ' (Qualifies)' : ' (Does not qualify)'}
                    </Typography>
                  </li>
                ))}
              </ul>
            </>
          )}
          
          {qualifyingQuarters.length > 0 && (
            <Typography variant="body2" mt={1} fontWeight="medium">
              Qualifying Quarters Based on Revenue: {qualifyingQuarters.join(', ')}
            </Typography>
          )}
        </Box>
      )}
      
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
          {!hasTimePeriods && !hasRevenueData
            ? 'Please enter business information in the form above. You can select government order time periods and/or provide quarterly revenue data.' 
            : promptType === 'covidOrders' && !selectedTimePeriod && hasTimePeriods
              ? 'Please select a specific quarter for COVID orders research.'
              : 'Generating prompt... Please wait.'}
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