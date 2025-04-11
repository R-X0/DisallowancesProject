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

// Utility function to parse multiple locations
const parseLocations = (locationString) => {
  if (!locationString) return [];
  
  return locationString.includes(';') 
    ? locationString.split(';').map(loc => loc.trim()).filter(Boolean)
    : [locationString];
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
      // Get all locations as an array
      const locations = parseLocations(formData.location || '');
      let locationPrompt = '';
      
      if (locations.length > 1 || formData.isControlledGroup) {
        // Multiple locations/controlled group case
        locationPrompt = `
MULTIPLE LOCATIONS / CONTROLLED GROUP:
This business operates in multiple locations:
${locations.map((loc, i) => `Location ${i+1}: ${loc}`).join('\n')}

IMPORTANT: Research government orders for ALL these jurisdictions during ${selectedTimePeriod}.
Include federal orders and relevant orders for EACH location.
`;
      }

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
      
      // Set up businessInfo with proper location handling
      const businessInfo = {};
      
      if (locations.length > 1 || formData.isControlledGroup) {
        // For multiple locations
        businessInfo.hasMultipleLocations = true;
        businessInfo.locations = locations;
        businessInfo.isControlledGroup = formData.isControlledGroup;
      } else {
        // For single location
        const { city, state } = extractCityState(formData.location || '');
        businessInfo.city = city;
        businessInfo.state = state;
      }
      
      // Add the rest of the business info
      businessInfo.businessType = businessType;
      businessInfo.quarter = quarter;
      businessInfo.year = year;
      businessInfo.timePeriod = timePeriod;
      businessInfo.allPeriods = allPeriods;
      
      // Calculate revenue declines for relevant information
      const revenueDeclines = calculateRevenueDeclines(formData);
      const qualifyingQuarters = getQualifyingQuarters(revenueDeclines);
      
      // Determine which approach the user is focusing on
      const approachFocus = determineUserApproach(formData);
      
      businessInfo.revenueDeclines = revenueDeclines;
      businessInfo.qualifyingQuarters = qualifyingQuarters;
      businessInfo.approachFocus = approachFocus;
      businessInfo.governmentOrdersInfo = formData.governmentOrdersInfo || '';
      businessInfo.revenueReductionInfo = formData.revenueReductionInfo || '';
      
      // Choose the right base prompt based on promptType
      let basePrompt = '';
      
      if (promptType === 'covidOrders') {
        // Improved template prompt for COVID orders research with better structure
        basePrompt = `FIND AND DOCUMENT ONLY OFFICIAL GOVERNMENT ORDERS for COVID-19 that affected a "${businessType}" business located in ${locations.length === 1 ? formData.location : 'multiple jurisdictions'} during ${timePeriod}.

CRITICAL LEGAL REQUIREMENTS:
1. You MUST find and cite the ACTUAL TEXT of official government orders - the IRS will REJECT secondary sources or news articles
2. Each order MUST be verified from government websites (.gov domains) or official archives
3. You MUST provide a direct citation to the official source document with exact page/section numbers
4. NO ORDER = NO CLAIM - The ERC protest will fail without direct evidence of the actual orders

VERIFICATION CHECKLIST FOR EACH ORDER:
✓ Confirm the order was issued by a government entity with legal authority (not guidelines or recommendations)
✓ Verify the order was active during ${timePeriod} (check exact dates and extensions)
✓ Document exactly which section/paragraph contains the business restriction
✓ Confirm the order directly affected "${businessType}" businesses (through specific mention or applicable category)

For each government order, provide this information in EXACTLY this format:

• Order Name: [Full official name of the order/proclamation]
• Order Number: [Official number or identifier]
• Issuing Authority: [Exact government entity that issued the order]
• Legal Authority: [Statute or emergency power authorizing the order]
• Date Enacted: [MM/DD/YYYY]
• Date Rescinded: [MM/DD/YYYY or "Still in effect during ${timePeriod}" if applicable]
• Official Source URL: [Direct link to the official government document]
• Relevant Section(s): [Specific section numbers or page references containing the restrictions]
• Order Summary: [3-4 sentence description quoting the EXACT language of restrictions from the order]
• Impact on ${businessType}: [Detailed explanation of how this specifically affected operations during ${timePeriod}, with quantifiable impacts where possible]

For each level of government (federal, state, county, city), organize the orders chronologically. Only include orders that were in effect during ${timePeriod} or that had a continuing impact on business operations during that quarter.`;

        // Add specific instructions based on approach focus
      if (approachFocus === 'governmentOrders') {
        basePrompt += `\n\nFOCUS YOUR INVESTIGATION ON MANDATORY ORDERS THAT CAUSED OPERATIONAL SUSPENSIONS:
The IRS requires concrete evidence that government orders caused either a full suspension or a partial suspension of business operations. A partial suspension occurs when "more than a nominal portion" (at least 10% of operations) were suspended due to government orders.

YOU MUST DOCUMENT ORDERS THAT IMPOSED ANY OF THESE RESTRICTIONS:
• CAPACITY LIMITATIONS: Mandatory percentage reductions (e.g., 25%, 50%, 75%) or fixed numerical limits
• PHYSICAL DISTANCING: Required spacing between individuals (6ft+) that reduced operational capacity
• GROUP SIZE RESTRICTIONS: Numerical limits on gatherings that affected business functions
• OPERATING HOURS MANDATES: Required closures, curfews, or restricted hours of operation
• SERVICE DELIVERY PROHIBITIONS: Bans on specific services or service methods essential to the business
• MOVEMENT/TRAVEL RESTRICTIONS: Stay-at-home orders, travel limitations affecting employees/customers
• FACILITY MODIFICATIONS: Required physical alterations that limited functional business space

FOR EACH RESTRICTION, YOU MUST:
1. Quote the exact language from the order imposing the restriction
2. Explain why this specific restriction could not be worked around
3. Calculate the percentage of operations affected (must exceed 10%)
4. Document the duration the restriction was legally enforceable

${formData.governmentOrdersInfo ? `\nBUSINESS CONTEXT TO CONSIDER: ${formData.governmentOrdersInfo}` : ''}`;
      } else if (approachFocus === 'revenueReduction') {
        basePrompt += `\n\nFOCUS ON BOTH REVENUE DECLINE AND SUPPORTING GOVERNMENT ORDERS:
The IRS allows qualification through revenue reduction OR partial suspension. You must document both:

1. GOVERNMENT ORDERS: Find all orders that affected this business, even if revenue qualified them
2. CAUSE-EFFECT RELATIONSHIP: Analyze how specific government restrictions directly contributed to revenue decline

${formData.revenueReductionInfo ? `\nREVENUE CONTEXT TO CONSIDER: ${formData.revenueReductionInfo}` : ''}`;

        // If we have revenue data, include it
        if (revenueDeclines.length > 0) {
          basePrompt += `\n\nDOCUMENTED REVENUE DECLINE DATA:
${revenueDeclines.map(d => `• ${d.quarter}: ${d.percentDecline} decline compared to ${d.baseQuarter}`).join('\n')}

${qualifyingQuarters.length > 0 ? `QUALIFYING QUARTERS BY REVENUE THRESHOLD (50%+ for 2020, 20%+ for 2021):
• ${qualifyingQuarters.join('\n• ')}` : 'NO QUARTERS QUALIFY BY REVENUE THRESHOLD ALONE (50%+ for 2020, 20%+ for 2021)'}

IMPORTANT: Even with qualifying revenue declines, you must still document government orders to strengthen the claim.`;
        }
      }

        basePrompt += `

DETAILED IMPACT ANALYSIS FOR EACH ORDER:
For each government order, you MUST provide:

1. EXACT RESTRICTIONS IMPOSED:
   • Quote the precise language from the order that mandated restrictions
   • Specify numerical limits (e.g., "25% capacity" not just "reduced capacity")
   • Identify MANDATORY requirements vs. recommendations
   • Document duration of each restriction to the exact dates

2. SPECIFIC IMPACT ON ${businessType.toUpperCase()}:
   • Explain how each restriction directly affected daily operations
   • Quantify the impact (e.g., "reduced service capacity by 40%" or "eliminated 30% of revenue-generating activities")
   • Document which specific business functions were suspended or modified
   • Explain why the business could not adapt operations to avoid the impact

3. "MORE THAN NOMINAL EFFECT" EVIDENCE:
   • Demonstrate impact exceeded the 10% threshold required by IRS Notice 2021-20
   • Show which specific metric was affected by >10% (revenue, operating hours, customer volume, etc.)
   • Explain why this impact was unavoidable due to the order
   • Provide comparative analysis to pre-COVID operations

SOURCE REQUIREMENTS - CRITICALLY IMPORTANT FOR IRS ACCEPTANCE:
1. ONLY PRIMARY SOURCES ACCEPTED - Official government documents directly from:
   • Federal agency websites (.gov domains)
   • State government official websites
   • County/municipal government archives or official websites
   • Official legislative repositories or law databases

2. REQUIRED DOCUMENTATION FOR EACH ORDER:
   • Direct URL to the official order text (not summaries or press releases)
   • PDF/scanned version of the order when available (with instruction to download)
   • Citation format must include issuing authority, order number, date, and section
   • Screenshot instructions for capturing the relevant portions as proof

3. UNACCEPTABLE SOURCES - DO NOT USE:
   • News articles about orders
   • Blog posts or opinion pieces
   • Law firm summaries
   • Chamber of Commerce or industry guides
   • Wikipedia or similar reference sites

4. VERIFICATION REQUIREMENT:
   • Double-check that each cited order was actually in force during ${timePeriod}
   • Verify extensions or modifications to original orders
   • Document any enforcement mechanisms or penalties
   • Note any legal challenges that affected implementation`;
      } else {
        // Improved template prompt for Form 886-A, now including all selected quarters
        basePrompt = `Please help me create a comprehensive Form 886-A response for ${formData.businessName}, a ${businessType} located in ${locations.length === 1 ? formData.location : 'multiple jurisdictions'}, regarding their Employee Retention Credit (ERC) claim for the following quarters: ${allPeriods}.

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

CRITICAL DOCUMENT STANDARDS FOR IRS ACCEPTANCE:

1. SOURCE HIERARCHY - FOLLOW STRICTLY:
   • PRIMARY REQUIREMENT: Direct links to official government websites with original order text
   • SECONDARY ONLY IF PRIMARY UNAVAILABLE: Official government press releases about specific orders
   • LAST RESORT IF NOTHING ELSE EXISTS: Contemporary legal analyses from bar associations or official legal journals
   • ABSOLUTELY PROHIBITED: News articles, blog posts, social media, opinion pieces, or general summaries

2. DOCUMENTATION FORMAT REQUIREMENTS:
   • Each order must include direct URL to government website
   • Each order must include official reference number and full title
   • Each relevant restriction must be quoted verbatim from the order
   • Page numbers and section references must be provided for each citation
   • Use consistent bullet point formatting (•) throughout the document

3. IMPACT ANALYSIS REQUIREMENTS:
   • Demonstrate direct causal relationship between each order and business limitation
   • Provide explicit calculations showing how restrictions affected >10% of operations
   • Avoid generalized statements - be specific about exact operational impacts
   • Document timeline showing duration of each restriction during the quarter

4. VERIFICATION STANDARDS:
   • Every order must be independently verifiable from government sources
   • Document persistence of orders through the claimed period (with extension references)
   • Note any modifications, amendments, or judicial actions affecting enforcement
   • Document the legal authority under which each order was issued
   
REMEMBER: THE IRS WILL REJECT CLAIMS WITHOUT PROPER ORDER DOCUMENTATION.
FOCUS ON QUALITY AND AUTHENTICITY OVER QUANTITY.`;
      }
      
      // Add location-specific prompt for multiple locations if needed
      if (locationPrompt) {
        basePrompt = `${basePrompt}

${locationPrompt}`;
      }
      
      // Use OpenAI API to generate a customized prompt based on the business info
      try {
        console.log("Calling API to generate customized prompt...");
        const response = await axios.post('/api/erc-protest/chatgpt/generate-prompt', {
          basePrompt,
          businessInfo
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
          
          {formData.location && formData.location.includes(';') && (
            <Typography variant="body2" mt={1}>
              Multiple Locations: {formData.location}
              {formData.isControlledGroup && " (Controlled Group)"}
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