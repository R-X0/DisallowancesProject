// server/services/documentGenerator.js

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const OpenAI = require('openai').default;
const officegen = require('officegen');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a customized COVID research prompt
 * @param {string} basePrompt - The base prompt template
 * @param {Object} businessInfo - Business information for customization
 * @returns {string} - The customized prompt
 */
async function generateCustomPrompt(basePrompt, businessInfo) {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'o3-mini',
      messages: [
        {
          role: 'system',
          content: `You are a tool that generates COVID-19 government order research prompts. 
          Your output must be ONLY the finished prompt with no explanations, introductions, or meta-commentary.
          Do not include phrases like "Here is a prompt" or "This is a customized prompt."
          Just provide the actual prompt content that the user will copy and paste.`
        },
        {
          role: 'user',
          content: `Create a detailed research prompt about COVID-19 government orders for a ${businessInfo.businessType} 
          in ${businessInfo.city}, ${businessInfo.state} during ${businessInfo.timePeriod}.
          
          Base your response on this template but improve and expand it:
          ${basePrompt}
          
          Make it more specific with questions relevant to this business type and time period.
          Format with numbered sections if appropriate, but do NOT include any explanatory text about what you're doing.
          Your entire response should be ONLY the prompt that will be copied and pasted.`
        }
      ],
    });

    // Get GPT's customized prompt
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating customized prompt:', error);
    throw new Error(`Failed to generate customized prompt: ${error.message}`);
  }
}

/**
 * Get the appropriate template content based on document type
 * @param {string} documentType - The type of document (protestLetter or form886A)
 * @returns {string} - The template content
 */
async function getTemplateContent(documentType) {
  let templatePath;
  let defaultTemplate = '';
  
  if (documentType === 'form886A') {
    templatePath = path.join(__dirname, '../templates/form_886a_template.txt');
    defaultTemplate = 'Form 886-A template with Issue, Facts, Law, Argument, and Conclusion sections';
  } else {
    templatePath = path.join(__dirname, '../templates/haven_for_hope_letter.txt');
    defaultTemplate = 'Standard protest letter format';
  }
  
  try {
    return await fs.readFile(templatePath, 'utf8');
  } catch (err) {
    console.log(`${documentType} template not found, using default template`);
    return defaultTemplate;
  }
}

/**
 * Create a formatted revenue table from business data
 * @param {Object} businessInfo - Business information with revenue data
 * @returns {string} - Formatted revenue table as text
 */
function createRevenueTable(businessInfo) {
  // Track which quarters have data
  const quarters = [
    { year: '2020', q: '1', baseYear: '2019' },
    { year: '2020', q: '2', baseYear: '2019' },
    { year: '2020', q: '3', baseYear: '2019' },
    { year: '2020', q: '4', baseYear: '2019' },
    { year: '2021', q: '1', baseYear: '2019' },
    { year: '2021', q: '2', baseYear: '2019' },
    { year: '2021', q: '3', baseYear: '2019' }
  ];
  
  // Build table rows
  let tableRows = [];
  
  for (const quarter of quarters) {
    // Create field keys
    const currentKey = `q${quarter.q}_${quarter.year}`;
    const baseKey = `q${quarter.q}_${quarter.baseYear}`;
    
    // Check if we have data for both quarters
    if (businessInfo[currentKey] && businessInfo[baseKey] && 
        parseFloat(businessInfo[currentKey]) >= 0 && 
        parseFloat(businessInfo[baseKey]) > 0) {
      
      // Get values
      const currentValue = parseFloat(businessInfo[currentKey]);
      const baseValue = parseFloat(businessInfo[baseKey]);
      
      // Calculate decline
      const change = baseValue - currentValue;
      const percentChange = ((1 - currentValue / baseValue) * 100).toFixed(2);
      
      // Determine if quarter qualifies
      const threshold = quarter.year === '2020' ? 50 : 20;
      const qualifies = parseFloat(percentChange) >= threshold;
      
      // Format values with commas
      const formattedBase = baseValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedCurrent = currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedChange = Math.abs(change).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      // Create row
      tableRows.push({
        label: `Q${quarter.q} ${quarter.baseYear}-${quarter.year}`,
        baseValue: formattedBase,
        currentValue: formattedCurrent,
        change: formattedChange,
        percentChange: percentChange,
        qualifies: qualifies ? 'YES' : 'NO'
      });
    }
  }
  
  // Generate the table content
  if (tableRows.length === 0) {
    return "No complete quarterly revenue data available for comparison.";
  }
  
  let tableContent = `
QUARTERLY REVENUE COMPARISON TABLE:
-----------------------------------------------------------------------------------------------------
QUARTER     |  2019 REVENUE    |  COMPARISON REVENUE  |  DOLLAR DECLINE   |  % DECLINE |  QUALIFIES
-----------------------------------------------------------------------------------------------------`;
  
  // Add rows
  for (const row of tableRows) {
    const paddedPercentage = (row.percentChange + '%').padEnd(10);
    tableContent += `
${row.label.padEnd(12)} |  $${row.baseValue.padEnd(16)} |  $${row.currentValue.padEnd(18)} |  $${row.change.padEnd(16)} |  ${paddedPercentage} |  ${row.qualifies}`;
  }
  
  tableContent += `
-----------------------------------------------------------------------------------------------------`;
  
  // List qualifying quarters
  const qualifyingQuarters = tableRows
    .filter(row => row.qualifies === 'YES')
    .map(row => row.label);
  
  if (qualifyingQuarters.length > 0) {
    tableContent += `

Based on the revenue data above, these quarters QUALIFY for ERC based on revenue decline:
${qualifyingQuarters.join(', ')}`;
  } else {
    tableContent += `

Based on the revenue data above, NO quarters qualify for ERC based solely on revenue decline.
The ERC claim is based on partial suspension of operations due to government orders.`;
  }
  
  return tableContent;
}

/**
 * Calculate revenue declines between quarters from business info
 * @param {Object} businessInfo - Business information with quarterly revenue data
 * @returns {Array} - Array of decline objects
 */
function calculateRevenueDeclines(businessInfo) {
  const declines = [];
  console.log('Calculating revenue declines from business info:', businessInfo);
  
  // Helper function to calculate decline
  const calculateDecline = (currentQuarter, baseQuarter, thresholdPercent) => {
    if (businessInfo[currentQuarter] && businessInfo[baseQuarter] && 
        parseFloat(businessInfo[currentQuarter]) >= 0 && 
        parseFloat(businessInfo[baseQuarter]) > 0) {
      const current = parseFloat(businessInfo[currentQuarter]);
      const base = parseFloat(businessInfo[baseQuarter]);
      const decline = (1 - current / base) * 100;
      
      console.log(`Calculating decline for ${currentQuarter} vs ${baseQuarter}:`, {
        currentValue: current,
        baseValue: base,
        declinePercent: decline,
        qualifies: decline >= thresholdPercent
      });
      
      if (decline > 0) {
        return {
          quarter: currentQuarter.toUpperCase().replace('_', ' '),
          baseQuarter: baseQuarter.toUpperCase().replace('_', ' '),
          decline: decline.toFixed(2),
          percentDecline: `${decline.toFixed(2)}%`,
          qualifies: decline >= thresholdPercent
        };
      }
    }
    return null;
  };
  
  // 2020 quarters (50% threshold)
  const q1_2020_decline = calculateDecline('q1_2020', 'q1_2019', 50);
  if (q1_2020_decline) declines.push(q1_2020_decline);
  
  const q2_2020_decline = calculateDecline('q2_2020', 'q2_2019', 50);
  if (q2_2020_decline) declines.push(q2_2020_decline);
  
  const q3_2020_decline = calculateDecline('q3_2020', 'q3_2019', 50);
  if (q3_2020_decline) declines.push(q3_2020_decline);
  
  const q4_2020_decline = calculateDecline('q4_2020', 'q4_2019', 50);
  if (q4_2020_decline) declines.push(q4_2020_decline);
  
  // 2021 quarters (20% threshold)
  const q1_2021_decline = calculateDecline('q1_2021', 'q1_2019', 20);
  if (q1_2021_decline) declines.push(q1_2021_decline);
  
  const q2_2021_decline = calculateDecline('q2_2021', 'q2_2019', 20);
  if (q2_2021_decline) declines.push(q2_2021_decline);
  
  const q3_2021_decline = calculateDecline('q3_2021', 'q3_2019', 20);
  if (q3_2021_decline) declines.push(q3_2021_decline);
  
  console.log('Final calculated declines:', declines);
  return declines;
}

/**
 * Determine qualifying quarters based on revenue declines
 * @param {Array} declines - Array of decline objects
 * @returns {Array} - Array of qualifying quarter strings
 */
function getQualifyingQuarters(declines) {
  return declines
    .filter(decline => decline.qualifies)
    .map(decline => decline.quarter);
}

/**
 * Generate a Word document from text content
 * @param {string} text - The text content to convert to DOCX
 * @param {string} outputPath - The path to save the DOCX file
 * @returns {Promise<string>} - The path to the generated DOCX
 */
async function generateDocx(text, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Create a new docx object
      const docx = officegen('docx');
      
      // Set document properties
      docx.on('finalize', function(written) {
        console.log('Word document created:', outputPath);
        resolve(outputPath);
      });
      
      docx.on('error', function(err) {
        console.error('Error creating Word document:', err);
        reject(err);
      });
      
      // Split text into paragraphs
      const paragraphs = text.split('\n');
      
      // Process each paragraph
      paragraphs.forEach(paragraph => {
        if (!paragraph.trim()) {
          // Add empty paragraph for spacing
          docx.createP();
          return;
        }
        
        const para = docx.createP();
        
        // Check if it's a header (all caps or ends with colon)
        if (paragraph.toUpperCase() === paragraph && paragraph.length > 5) {
          para.addText(paragraph, { bold: true });
        } 
        // Check if it's a bullet point
        else if (paragraph.trim().startsWith('• ')) {
          para.addText(paragraph.trim().substring(2), { bullet: true });
        }
        // Check if it's a detail line with a label
        else if (paragraph.includes(': ')) {
          const [label, ...rest] = paragraph.split(': ');
          const value = rest.join(': '); // In case there are multiple colons
          
          para.addText(`${label}: `, { bold: true });
          para.addText(value);
        }
        // Regular paragraph
        else {
          para.addText(paragraph);
        }
      });
      
      // Generate the docx file
      const out = fsSync.createWriteStream(outputPath);
      out.on('error', (err) => {
        console.error('Error writing Word document:', err);
        reject(err);
      });
      
      // Async callback is called after document is created
      docx.generate(out);
      
    } catch (err) {
      console.error('Error generating Word document:', err);
      reject(err);
    }
  });
}

/**
 * Get disallowance reason description text
 * @param {string} reasonCode - The disallowance reason code
 * @param {string} customReason - Custom reason text if reason is 'other'
 * @returns {string} - Formatted text describing the disallowance reason
 */
function getDisallowanceReasonText(reasonCode, customReason = '') {
  const reasonMap = {
    'no_orders': 'no government orders were in effect',
    'not_in_operation': 'the business was not in operation',
    'excess_amount': 'the amount claimed exceeded the allowable maximum',
    'no_w2': 'no W-2s were filed',
    'no_941': 'no Forms 941 were filed',
    'no_deposits': 'no employment tax deposits were found'
  };
  
  if (reasonCode === 'other' && customReason) {
    return customReason;
  }
  
  return reasonMap[reasonCode] || 'no government orders were in effect';
}

/**
 * Generate an ERC document (protest letter or Form 886-A)
 * @param {Object} businessInfo - Business information
 * @param {string} covidData - Sanitized ChatGPT conversation containing COVID research
 * @param {string} templateContent - Template content for the document
 * @returns {string} - The generated document
 */
async function generateERCDocument(businessInfo, covidData, templateContent) {
  try {
    console.log('Generating document using GPT...');
    
    // Enhanced check for meaningful revenue data
    // Only consider revenue data valid if it's actually a positive number
    const hasValidRevenueData = 
      (businessInfo.q1_2019 && parseFloat(businessInfo.q1_2019) > 0) || 
      (businessInfo.q2_2019 && parseFloat(businessInfo.q2_2019) > 0) || 
      (businessInfo.q3_2019 && parseFloat(businessInfo.q3_2019) > 0) || 
      (businessInfo.q4_2019 && parseFloat(businessInfo.q4_2019) > 0) ||
      (businessInfo.q1_2020 && parseFloat(businessInfo.q1_2020) > 0) ||
      (businessInfo.q2_2020 && parseFloat(businessInfo.q2_2020) > 0) ||
      (businessInfo.q3_2020 && parseFloat(businessInfo.q3_2020) > 0) ||
      (businessInfo.q4_2020 && parseFloat(businessInfo.q4_2020) > 0) ||
      (businessInfo.q1_2021 && parseFloat(businessInfo.q1_2021) > 0) ||
      (businessInfo.q2_2021 && parseFloat(businessInfo.q2_2021) > 0) ||
      (businessInfo.q3_2021 && parseFloat(businessInfo.q3_2021) > 0);

    console.log('Has valid revenue data:', hasValidRevenueData);
    
    // Check if we should include revenue section (default to include if not specified)
    const includeRevenueSection = 
      businessInfo.includeRevenueSection === undefined ? true : businessInfo.includeRevenueSection;
    console.log('Include revenue section:', includeRevenueSection);
    
    if (hasValidRevenueData && includeRevenueSection) {
      console.log('Valid revenue data found for calculation:', {
        q1_2019: businessInfo.q1_2019,
        q2_2019: businessInfo.q2_2019,
        q3_2019: businessInfo.q3_2019,
        q4_2019: businessInfo.q4_2019,
        q1_2020: businessInfo.q1_2020,
        q2_2020: businessInfo.q2_2020,
        q3_2020: businessInfo.q3_2020,
        q4_2020: businessInfo.q4_2020,
        q1_2021: businessInfo.q1_2021,
        q2_2021: businessInfo.q2_2021,
        q3_2021: businessInfo.q3_2021
      });
    } else {
      console.log('Revenue data will not be included in the document.');
    }
    
    // Get disallowance reason
    const disallowanceReason = businessInfo.disallowanceReason || 'no_orders';
    const customDisallowanceReason = businessInfo.customDisallowanceReason || '';
    const disallowanceReasonText = getDisallowanceReasonText(disallowanceReason, customDisallowanceReason);
    console.log('Disallowance reason:', disallowanceReason, '- Text:', disallowanceReasonText);
    
    // Handle multiple time periods
    let timePeriods = businessInfo.timePeriod;
    let allTimePeriods = businessInfo.allTimePeriods || [businessInfo.timePeriod];
    
    // Format the time periods for display
    const timePeriodsFormatted = Array.isArray(allTimePeriods) 
      ? allTimePeriods.join(', ') 
      : timePeriods;
    
    // Process revenue data only if we have actual values and includeRevenueSection is true
    let revenueDeclines = [];
    let qualifyingQuarters = [];
    let approachFocus = businessInfo.approachFocus || 'governmentOrders';
    
    // If revenue data is sent directly from client and valid, use it
    if (businessInfo.revenueDeclines && Array.isArray(businessInfo.revenueDeclines) && 
        businessInfo.revenueDeclines.length > 0 && hasValidRevenueData && includeRevenueSection) {
      console.log('Using pre-calculated revenue declines from client');
      revenueDeclines = businessInfo.revenueDeclines;
      if (businessInfo.qualifyingQuarters && Array.isArray(businessInfo.qualifyingQuarters)) {
        qualifyingQuarters = businessInfo.qualifyingQuarters;
      }
    } else if (hasValidRevenueData && includeRevenueSection) {
      // Otherwise calculate from individual quarter data if we have some
      console.log('Calculating revenue declines from individual quarter data');
      revenueDeclines = calculateRevenueDeclines(businessInfo);
      qualifyingQuarters = getQualifyingQuarters(revenueDeclines);
    } else {
      console.log('No valid revenue data available or revenue section disabled, skipping revenue decline calculations');
      // Force approach to be government orders only when no revenue data exists
      approachFocus = 'governmentOrders';
    }
    
    console.log('Calculated revenue declines:', revenueDeclines);
    console.log('Qualifying quarters:', qualifyingQuarters);
    
    // Check what evidence we have available
    const hasRevenueDeclines = revenueDeclines.length > 0 && hasValidRevenueData && includeRevenueSection;
    const hasQualifyingQuarters = qualifyingQuarters.length > 0 && hasValidRevenueData && includeRevenueSection;

    // Check for government orders info
    const hasGovernmentOrdersInfo = 
      (businessInfo.timePeriods && businessInfo.timePeriods.length > 0) || 
      (businessInfo.governmentOrdersInfo && businessInfo.governmentOrdersInfo.trim().length > 0);

    // Build content that includes ONLY available evidence
    let evidenceContent = '';

    // Include revenue data in the evidence content ONLY if we have actual valid data and includeRevenueSection is true
    if (hasRevenueDeclines && includeRevenueSection) {
      // Create a revenue section with the table format
      evidenceContent += `
REVENUE REDUCTION INFORMATION:

`;
      
      // Generate the formatted table with all quarterly data
      evidenceContent += createRevenueTable(businessInfo);
      
      // Add any additional context provided by the user
      if (businessInfo.revenueReductionInfo) {
        evidenceContent += `\n\nAdditional context about revenue reduction: ${businessInfo.revenueReductionInfo}\n`;
      }
    } else {
      // If no revenue data was provided, explicitly state that we're not using revenue approach
      evidenceContent += `
IMPORTANT: This protest is based SOLELY on the government orders approach. NO revenue data was provided, so DO NOT include ANY revenue analysis or revenue figures in the document. DO NOT fabricate or invent revenue numbers. Focus EXCLUSIVELY on the partial suspension of operations due to government orders.
`;
    }

    // Always include government orders info regardless of revenue data
    if (hasGovernmentOrdersInfo) {
      evidenceContent += `
GOVERNMENT ORDERS INFORMATION:
This business was affected by governmental orders that caused a full or partial suspension of business operations.
${businessInfo.governmentOrdersInfo ? `\nDetails about government orders: ${businessInfo.governmentOrdersInfo}` : ''}
${businessInfo.timePeriods && businessInfo.timePeriods.length > 0 ? `\nRelevant time periods: ${businessInfo.timePeriods.join(', ')}` : ''}

IMPORTANT: Include information about how government orders caused full or partial suspension of operations.
`;
    }

    // Determine which template to use based on the document type
    let promptTemplate;
    let systemPrompt;
    
    if (businessInfo.documentType === 'form886A') {
      // For Form 886-A document
      systemPrompt = `You are an expert in creating IRS Form 886-A documents for Employee Retention Credit (ERC) substantiation.
      CRITICAL REQUIREMENT: This is a legal tax document. If exact revenue figures are provided, you MUST include them without rounding or generalizing.
      If NO revenue data is provided, DO NOT mention any revenue figures or analysis - focus solely on government orders.
      Create a comprehensive Form 886-A document with sections for Issue, Facts, Law, Argument, and Conclusion based on the specific business information and COVID-19 research data provided.`;
      
      promptTemplate = `Please create a Form 886-A document for ERC substantiation using the following information:

BUSINESS INFORMATION:
Business Name: ${businessInfo.businessName}
EIN: ${businessInfo.ein}
Location: ${businessInfo.location}
Time Periods: ${timePeriodsFormatted}
Business Type: ${businessInfo.businessType || 'business'}

DISALLOWANCE REASON:
The ERC claim was disallowed because ${disallowanceReasonText}. Address this specific reason in your response.

${evidenceContent}

COVID-19 RESEARCH DATA:
${covidData}

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT include direct links or URLs in the document - they will be processed separately and added as attachments
2. Instead of URLs, reference orders and sources by their names and dates
3. Use CONSISTENT formatting throughout - use bullet points (•) for all lists, not dashes or mixed formats
4. Include ONLY the evidence that has been provided - ${hasValidRevenueData && includeRevenueSection ? 'revenue decline AND/OR' : 'ONLY'} government orders
5. ${hasValidRevenueData && includeRevenueSection ? 'If revenue decline data shows qualifying quarters, make this a PROMINENT part of the document' : 'DO NOT fabricate or invent revenue figures, as none were provided. Focus EXCLUSIVELY on the government orders approach.'}
6. ${disallowanceReason === 'not_in_operation' ? 'Make sure to specifically address that the business was in operation during the claimed period, providing evidence from the research data.' : ''}

SPECIFIC FORMAT REQUIREMENTS FOR GOVERNMENT ORDERS:
For each government order mentioned, you MUST use this EXACT detailed format:

• Order Name: [Full Name of Order]
• Order Number: [Official Number/Identifier]
• Date Enacted: [MM/DD/YYYY]
• Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
• Order Summary: [2-3 sentence detailed description of what the order mandated]
• Impact on Quarter: [Specific explanation of how this affected the business operations]

IMPORTANT: Each order must be listed individually with ALL six fields above. Do not abbreviate or simplify this format, even for minor orders.`;

      // Only include revenue instructions if we have revenue data and includeRevenueSection is true
      if (hasValidRevenueData && includeRevenueSection) {
        promptTemplate += `

REVENUE DECLINE PRESENTATION FORMAT:
When including revenue decline information, use the following tabular format:

1. Create a header paragraph that introduces the revenue data:
"In addition to the government orders discussed above, we are submitting quarterly revenue data that demonstrates the revenue reductions for [BUSINESS_NAME]. The following table presents the quarterly revenue amounts and percentage changes for comparison purposes."

2. Present the comprehensive revenue data in a clear, table-like format showing ALL quarters with available data. For each quarter, include:
   - The quarter being compared (e.g., "Q1 2019-2020")
   - 2019 baseline revenue
   - Comparison period revenue (2020 or 2021)
   - Dollar amount of decline
   - Percentage decline
   - Whether the quarter qualifies for ERC based on revenue decline

3. After the table, add a summary paragraph:
"As shown in the revenue table above, the quarters with 'YES' in the QUALIFIES column meet the ERC threshold for revenue decline (50%+ for 2020, 20%+ for 2021). These revenue reductions, combined with the impact of government orders described earlier, provide substantiation for our ERC claim."

DO NOT USE PHRASES like "audited figures" or "exact amounts" or "EXACT" revenues, as these values have not been audited. Simply present the data as reported by the business.

IMPORTANT: Include ALL quarters where data is available in the table, not just the qualifying quarters. This comprehensive presentation provides better context for the ERC claim.`;
      } else {
        promptTemplate += `

CRITICAL INSTRUCTION: ${includeRevenueSection ? 'NO REVENUE DATA WAS PROVIDED.' : 'DO NOT INCLUDE REVENUE ANALYSIS IN THIS DOCUMENT.'} DO NOT FABRICATE OR INVENT ANY REVENUE FIGURES. DO NOT INCLUDE ANY REVENUE DECLINE ANALYSIS. This protest should be based SOLELY on the partial suspension of operations caused by government orders.`;
      }

      promptTemplate += `

FORMAT: Create a comprehensive Form 886-A document with the following structure:
1. Issue - Define the question of whether the business qualifies for ERC based on ${hasValidRevenueData && includeRevenueSection ? 'ALL available evidence' : 'partial suspension of operations due to government orders'}
2. Facts - Detail the business operations and include ${hasValidRevenueData && includeRevenueSection ? 'ALL relevant evidence (revenue decline data AND/OR government orders)' : 'information about how government orders affected operations'}
3. Law - Explain the ERC provisions, IRS Notice 2021-20, and other relevant guidance for ${hasValidRevenueData && includeRevenueSection ? 'ALL qualification methods' : 'the government orders approach'}
4. Argument - Present the case for why the business qualifies based on ${hasValidRevenueData && includeRevenueSection ? 'ALL available evidence' : 'government orders causing partial suspension'}
5. Conclusion - Summarize the eligibility determination 

Use today's date: ${new Date().toLocaleDateString()}

FINAL CRITICAL INSTRUCTION:
1. Include ONLY the evidence that has actually been provided
2. MAINTAIN the exact format for government orders specified above - this format is REQUIRED
3. Do not abbreviate or simplify the government order format, even for minor orders
4. ${hasValidRevenueData && includeRevenueSection ? 'If both revenue reduction and government orders information is available, include BOTH' : 'DO NOT fabricate or invent ANY revenue figures, as none were provided'}
5. Format each government order with all six required fields (Name, Number, Dates, Summary, Impact)
6. ${hasValidRevenueData && includeRevenueSection ? 'Present the revenue data in a clear tabular format showing ALL available quarters - do not imply the figures were audited' : 'Focus EXCLUSIVELY on how government orders caused a partial suspension of operations'}
7. Directly address the disallowance reason: ${disallowanceReasonText}`;
    
    } else {
      // Default to protest letter (original functionality)
      systemPrompt = `You are an expert in creating IRS Employee Retention Credit (ERC) protest letters.
      CRITICAL REQUIREMENT: This is a legal tax document. If exact revenue figures are provided, you MUST include them without rounding or generalizing.
      If NO revenue data is provided, DO NOT mention any revenue figures or analysis - focus solely on government orders.
      Create a formal protest letter following the exact format and style of the example letter provided,
      using the specific business information and COVID-19 research data provided.`;
      
      promptTemplate = `Please create an ERC protest letter using the following information:

BUSINESS INFORMATION:
Business Name: ${businessInfo.businessName}
EIN: ${businessInfo.ein}
Location: ${businessInfo.location}
Time Period: ${timePeriods}
Business Type: ${businessInfo.businessType || 'business'}

DISALLOWANCE REASON:
The ERC claim was disallowed because ${disallowanceReasonText}. Address this specific reason in your response.

${evidenceContent}

COVID-19 RESEARCH DATA FROM CHATGPT:
${covidData}

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT include direct links or URLs in the letter body - they will be processed separately and added as attachments
2. Instead of URLs, reference orders and sources by their names and dates
3. Use CONSISTENT formatting throughout - use bullet points (•) for all lists, not dashes or mixed formats
4. Include ONLY the evidence that has been provided - ${hasValidRevenueData && includeRevenueSection ? 'revenue decline AND/OR' : 'ONLY'} government orders
5. ${hasValidRevenueData && includeRevenueSection ? 'If revenue decline data shows qualifying quarters, make this a PROMINENT part of the document' : 'DO NOT fabricate or invent revenue figures, as none were provided. Focus EXCLUSIVELY on the government orders approach.'}
6. ${disallowanceReason === 'not_in_operation' ? 'Make sure to specifically address that the business was in operation during the claimed period, providing evidence from the research data.' : ''}

SPECIFIC FORMAT REQUIREMENTS FOR GOVERNMENT ORDERS:
For each government order mentioned, you MUST use this EXACT detailed format:

• Order Name: [Full Name of Order]
• Order Number: [Official Number/Identifier]
• Date Enacted: [MM/DD/YYYY]
• Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
• Order Summary: [2-3 sentence detailed description of what the order mandated]
• Impact on Quarter: [Specific explanation of how this affected the business operations]

IMPORTANT: Each order must be listed individually with ALL six fields above. Do not abbreviate or simplify this format, even for minor orders.`;

      // Only include revenue instructions if we have revenue data and includeRevenueSection is true
      if (hasValidRevenueData && includeRevenueSection) {
        promptTemplate += `

REVENUE DECLINE PRESENTATION FORMAT:
When including revenue decline information, use the following tabular format:

1. Create a header paragraph that introduces the revenue data:
"In addition to the government orders discussed above, we are submitting quarterly revenue data that demonstrates the revenue reductions for [BUSINESS_NAME]. The following table presents the quarterly revenue amounts and percentage changes for comparison purposes."

2. Present the comprehensive revenue data in a clear, table-like format showing ALL quarters with available data. For each quarter, include:
   - The quarter being compared (e.g., "Q1 2019-2020")
   - 2019 baseline revenue
   - Comparison period revenue (2020 or 2021)
   - Dollar amount of decline
   - Percentage decline
   - Whether the quarter qualifies for ERC based on revenue decline

3. After the table, add a summary paragraph:
"As shown in the revenue table above, the quarters with 'YES' in the QUALIFIES column meet the ERC threshold for revenue decline (50%+ for 2020, 20%+ for 2021). These revenue reductions, combined with the impact of government orders described earlier, provide substantiation for our ERC claim."

DO NOT USE PHRASES like "audited figures" or "exact amounts" or "EXACT" revenues, as these values have not been audited. Simply present the data as reported by the business.

IMPORTANT: Include ALL quarters where data is available in the table, not just the qualifying quarters. This comprehensive presentation provides better context for the ERC claim.`;
      } else {
        promptTemplate += `

CRITICAL INSTRUCTION: ${includeRevenueSection ? 'NO REVENUE DATA WAS PROVIDED.' : 'DO NOT INCLUDE REVENUE ANALYSIS IN THIS DOCUMENT.'} DO NOT FABRICATE OR INVENT ANY REVENUE FIGURES. DO NOT INCLUDE ANY REVENUE DECLINE ANALYSIS. This protest should be based SOLELY on the partial suspension of operations caused by government orders.`;
      }

      promptTemplate += `

FORMAT EXAMPLE (FOLLOW THIS GENERAL STRUCTURE BUT INCLUDE ONLY THE AVAILABLE EVIDENCE):
${templateContent}

Create a comprehensive protest letter using the business information and ONLY the available evidence above, following the general format and structure of the example letter. Make it specific to the time period ${timePeriods} and location of the business. Use today's date: ${new Date().toLocaleDateString()}

FINAL CRITICAL INSTRUCTION:
1. Include ONLY the evidence that has actually been provided
2. MAINTAIN the exact format for government orders specified above - this format is REQUIRED
3. Do not abbreviate or simplify the government order format, even for minor orders
4. ${hasValidRevenueData && includeRevenueSection ? 'If both revenue reduction and government orders information is available, include BOTH' : 'DO NOT fabricate or invent ANY revenue figures, as none were provided'}
5. Format each government order with all six required fields (Name, Number, Dates, Summary, Impact)
6. ${hasValidRevenueData && includeRevenueSection ? 'Present the revenue data in a clear tabular format showing ALL available quarters - do not imply the figures were audited' : 'Focus EXCLUSIVELY on how government orders caused a partial suspension of operations'}
7. For revenue figures, create a tabular format with ALL quarters where data is available - DO NOT selectively include only some quarters
8. Directly address the disallowance reason: ${disallowanceReasonText}`;
    }
    
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'o3-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: promptTemplate
        }
      ],
    });
    
    const generatedDocument = response.choices[0].message.content.trim();
    console.log('Document successfully generated');
    
    return generatedDocument;
  } catch (error) {
    console.error('Error generating document:', error);
    throw new Error(`Failed to generate document: ${error.message}`);
  }
}

module.exports = {
  generateCustomPrompt,
  getTemplateContent,
  generateERCDocument,
  generateDocx
};