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
    defaultTemplate = `Form 886-A – ERC Eligibility Analysis
Issue
Was the business fully or partially suspended by governmental orders during the claimed periods?

Facts
[Detailed business operations facts should be provided here]

Law
[Comprehensive legal analysis of ERC provisions should be included here]

Argument
[Detailed analysis of government orders and their impact should be documented here]

Conclusion
[Summary of eligibility determination with specific findings]`;
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
      console.log(`Starting DOCX generation for: ${outputPath}`);
      
      // First, ensure the destination directory exists
      const dir = path.dirname(outputPath);
      fsSync.mkdirSync(dir, { recursive: true });
      
      // Create a new docx object
      const docx = officegen('docx');
      
      // Set document properties
      docx.on('finalize', function(written) {
        console.log('Word document created:', outputPath);
        
        // Verify the file exists and has content
        setTimeout(() => {
          try {
            const stats = fsSync.statSync(outputPath);
            console.log(`DOCX file verified: ${outputPath} (${stats.size} bytes)`);
            resolve(outputPath);
          } catch (verifyErr) {
            console.error('Error verifying DOCX file:', verifyErr);
            reject(verifyErr);
          }
        }, 1000); // Give a small delay to allow file system to flush
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
      
      out.on('close', () => {
        console.log(`DOCX file stream closed: ${outputPath}`);
        // Note: We don't resolve here because officegen will call 'finalize' event
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
 * Helper function to ensure consistent formatting in generated documents
 * @param {string} document - The generated document text
 * @param {string} documentType - The type of document
 * @returns {string} - The formatted document
 */
function ensureConsistentFormatting(document, documentType) {
  if (documentType !== 'form886A') {
    return document; // Only apply to Form 886-A documents
  }
  
  let processed = document;
  
  // Ensure consistent bullet points
  processed = processed.replace(/[-*]\s/g, '• ');
  
  // Fix date formats to be consistent MM/DD/YYYY
  processed = processed.replace(/(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d)/g, (match, month, day, year) => {
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    return `${paddedMonth}/${paddedDay}/20${year}`;
  });
  
  // Ensure government order formats are consistent
  // Look for patterns like "Order Name:" or "Date Enacted:" that might be formatted incorrectly
  const orderFields = [
    'Order Name:',
    'Order Number:',
    'Date Enacted:',
    'Date Rescinded:',
    'Order Summary:',
    'Impact on Quarter:'
  ];
  
  orderFields.forEach(field => {
    // Convert any variation like "Order name:" or "ORDER NAME:" to the correct format
    const regex = new RegExp(`${field.replace(':', '').replace(/\s+/g, '\\s+')}:`, 'gi');
    processed = processed.replace(regex, field);
  });
  
  return processed;
}

/**
 * Process qualification approaches based on user selections
 * @param {Object} businessInfo - Business information
 * @returns {Object} - Processed qualification approaches
 */
function processQualificationApproaches(businessInfo) {
  const approaches = {
    governmentOrders: false,
    supplyChainDisruption: false,
    revenueReduction: false,
    mainApproach: 'governmentOrders' // Default
  };
  
  // Check if supply chain disruption is explicitly selected
  if (businessInfo.includeSupplyChainDisruption === true) {
    approaches.supplyChainDisruption = true;
  }
  
  // Check for revenue reduction
  const hasQualifyingQuarters = businessInfo.qualifyingQuarters && 
                               Array.isArray(businessInfo.qualifyingQuarters) && 
                               businessInfo.qualifyingQuarters.length > 0;
  
  if (hasQualifyingQuarters && businessInfo.includeRevenueSection !== false) {
    approaches.revenueReduction = true;
  }
  
  // Government orders approach is always available
  approaches.governmentOrders = true;
  
  // Determine main approach
  if (approaches.revenueReduction) {
    approaches.mainApproach = 'revenueReduction';
  } else if (approaches.supplyChainDisruption) {
    approaches.mainApproach = 'supplyChainDisruption';
  } else {
    approaches.mainApproach = 'governmentOrders';
  }
  
  return approaches;
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
    
    // Check if we should include revenue section - FIXED: strictly check for false
    const includeRevenueSection = businessInfo.includeRevenueSection !== false;
    console.log('Include revenue section:', includeRevenueSection, 'Value from input:', businessInfo.includeRevenueSection);
    
    if (hasValidRevenueData && includeRevenueSection) {
      console.log('Valid revenue data found for calculation, and includeRevenueSection is true');
    } else {
      console.log('Revenue data will not be included in the document.');
      if (!includeRevenueSection) {
        console.log('Reason: includeRevenueSection is explicitly set to false');
      }
      if (!hasValidRevenueData) {
        console.log('Reason: No valid revenue data found');
      }
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
    
    // Process qualification approaches
    const qualificationApproaches = processQualificationApproaches(businessInfo);
    
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
      // For Form 886-A document - IMPROVED VERSION
      systemPrompt = `You are an expert in creating IRS Form 886-A documents for Employee Retention Credit (ERC) substantiation.
      CRITICAL REQUIREMENT: This is a legal tax document that requires precise, comprehensive information about the business.
      
      You must thoroughly research the business based on the provided information, including NAICS code and website if available.
      Your document must include specific business operations details, not vague statements about information availability.
      
      Each government order must be documented in the EXACT required format with all fields completed.
      
      The Law section must be comprehensive with proper legal citations to statutes, IRS notices, and relevant guidance.
      
      If revenue data is provided, include it accurately. If not, focus exclusively on the government orders approach.`;

      // Adjust prompt based on qualification approaches
      let approachFocusText = '';
      if (qualificationApproaches.mainApproach === 'revenueReduction') {
        approachFocusText = 'primarily the significant decline in gross receipts, with government orders as supporting evidence';
      } else if (qualificationApproaches.mainApproach === 'supplyChainDisruption') {
        approachFocusText = 'both government orders and their substantial supply chain disruption effects, as specified in IRS Notice 2021-20, Q/A #12';
      } else {
        approachFocusText = 'the full or partial suspension caused by government orders';
      }

      // Build the enhanced Form 886-A prompt template
      promptTemplate = `Please create a Form 886-A document for ERC substantiation using the following information:

BUSINESS INFORMATION:
Business Name: ${businessInfo.businessName}
EIN: ${businessInfo.ein}
Location: ${businessInfo.location}
Time Periods: ${timePeriodsFormatted}
Business Type: ${businessInfo.businessType || 'business'}
${businessInfo.businessWebsite ? `Business Website: ${businessInfo.businessWebsite}` : ''}
NAICS Code: ${businessInfo.naicsCode || 'Not provided'}

QUALIFICATION APPROACH: This ERC claim is based on ${approachFocusText}.

DISALLOWANCE REASON:
The ERC claim was disallowed because ${disallowanceReasonText}. Address this specific reason in your response.

${evidenceContent}

COVID-19 RESEARCH DATA:
${covidData}

BUSINESS RESEARCH INSTRUCTIONS:
1. First, use the provided business information to create a detailed Facts section.
2. ${businessInfo.businessWebsite ? `Research the business website (${businessInfo.businessWebsite}) to understand their specific operations.` : 'Research typical operations for a business of this type and NAICS code.'}
3. Provide concrete details about what the business actually does, not vague statements.
4. Avoid phrases like "information is not available" - use industry knowledge for reasonable inferences.

CRITICAL SECTION REQUIREMENTS:

1. FACTS SECTION:
   - Describe the business operations in detail: products/services, size, locations, workflows
   - Explain the industry context for a ${businessInfo.businessType} in ${businessInfo.location}
   - Summarize how COVID-19 affected their operations during the claimed periods

2. LAW SECTION:
   - Include comprehensive analysis of ERC provisions from the CARES Act, Relief Act, and ARP
   - Cite specific sections of IRS Notice 2021-20, 2021-23, and 2021-49
   - Detail the legal tests for "full or partial suspension" and "more than nominal" impact (10% rule)
   - Include analysis of essential business qualification when applicable
   - ${businessInfo.governmentOrdersInfo && businessInfo.governmentOrdersInfo.toLowerCase().includes('supply chain') ? 'Include detailed legal analysis of supply chain disruption qualification from IRS Notice 2021-20, Q/A #12' : ''}

3. ARGUMENT SECTION:
   For each government order, use this EXACT format:

   • Order Name: [Full official name of the order/proclamation]
   • Order Number: [Official number or identifier]
   • Date Enacted: [MM/DD/YYYY]
   • Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
   • Order Summary: [3-4 sentence description quoting the EXACT language of restrictions]
   • Impact on Quarter: [Detailed explanation of how this specifically affected the business]

   - Organize orders chronologically by quarter
   - Ensure each claimed quarter has documented orders
   - ${(timePeriodsFormatted.includes('Q3 2021') || timePeriodsFormatted.includes('3rd Quarter 2021')) ? 'For Q3 2021, ensure you include federal orders like PROCLAMATION 9994, EXECUTIVE ORDER 14017, and CDC Delta variant guidance from July 2021.' : ''}
   ${businessInfo.governmentOrdersInfo && businessInfo.governmentOrdersInfo.toLowerCase().includes('supply chain') ? `
   - Include a separate Supply Chain Disruption Analysis section detailing:
     * How government orders disrupted the supply chain
     * Which specific critical materials were affected
     * Why alternative suppliers weren't available
     * The direct impact on business operations` : ''}

4. CONCLUSION SECTION:
   - Clearly state that the business qualifies for ERC for the claimed periods
   - Summarize the key government orders that caused suspension
   - Directly refute the disallowance reason: ${disallowanceReasonText}
   - Include the standard attestation language

IMPORTANT FORMATTING RULES:
1. Use today's date: ${new Date().toLocaleDateString()}
2. Use CONSISTENT bullet points (•) for all lists
3. Include ALL required fields for EACH government order
4. Format legal citations properly (e.g., "Section 2301(c)(2)(A)" not just "Section 2301")
5. Include the attestation: "Under penalties of perjury, I declare that I submitted this Form 886-A and accompanying documents, and to the best of my personal knowledge and belief, the information stated herein and in accompanying documents is true, correct, and complete."`;

      // Add supply chain disruption instructions if selected
      if (businessInfo.includeSupplyChainDisruption === true) {
        promptTemplate += `\n\nIMPORTANT: This business was significantly affected by SUPPLY CHAIN DISRUPTIONS caused by government orders.
        
1. Your document MUST include a detailed supply chain disruption analysis in the Issue section and the Argument section.
2. Explicitly cite IRS Notice 2021-20, Q/A #12 which states that supply chain disruptions caused by government orders can qualify for ERC.
3. In the Issue section, explicitly mention that this analysis addresses supply chain disruptions.
4. In the Argument section, create a separate "Supply Chain Disruption Analysis" subsection that includes:
   * Which critical materials or components were unavailable due to suppliers being affected by government orders
   * Documentation of specific supplier shutdowns caused by government mandates
   * Why alternative suppliers were not available during the claimed period
   * Quantification of the impact as "more than nominal" (exceeding 10% of operations)
   * Analysis of how these supply chain issues directly caused operational limitations`;
      }
      
      // Add special handling for specific quarters if needed
      const allQuarters = businessInfo.timePeriods || [businessInfo.timePeriod];
      if (allQuarters.some(q => q.includes('Q3 2021') || q.includes('3rd Quarter 2021'))) {
        promptTemplate += `\n\nIMPORTANT: For Q3 2021, you MUST address these specific federal orders:
- PROCLAMATION 9994 - DECLARING A NATIONAL EMERGENCY (03/13/2020 - 04/10/2023)
- EXECUTIVE ORDER 14017 - SECURING AMERICA'S SUPPLY CHAINS (02/24/21 - ongoing)
- CDC MASK CHANGES - DELTA VARIANT (07/27/21 - 02/25/22)`;
      }

      // Ensure the Issue section is always included by adding this to the prompt
      promptTemplate += `\n\nCRITICAL FORMATTING REQUIREMENT: You MUST include the Issue section at the beginning of the document. It should be labeled "1. Issue" and should specifically address the disallowance reason and mention government orders. DO NOT skip or omit this section under any circumstances.`;
      
    } else {
      // Original protest letter prompt construction
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

      // Include supply chain disruption instructions if selected
      if (businessInfo.includeSupplyChainDisruption === true) {
        promptTemplate += `

SUPPLY CHAIN DISRUPTION ANALYSIS:
This protest should emphasize that the business was ALSO affected by supply chain disruptions caused by government orders.

1. Include a dedicated section on supply chain disruption with these components:
   * Cite IRS Notice 2021-20, Question & Answer #12 which specifically covers supply chain disruption qualification
   * Identify which critical materials or components were unavailable due to supplier shutdowns
   * Document specific supplier shutdowns caused by government mandates
   * Explain why alternative suppliers were not available during the claimed period
   * Show how these supply chain issues directly caused operational limitations

2. Begin the supply chain section with this paragraph (modify as needed):
"In addition to the direct impact of government orders, [BUSINESS_NAME] was also substantially affected by supply chain disruptions caused by government orders as described in IRS Notice 2021-20, Q/A #12. This provision states that an employer qualifies for the ERC when 'a supplier of the employer is unable to make deliveries of critical goods or materials due to a governmental order that causes the supplier to suspend its operations.'"

3. Emphasize that these supply chain disruptions were sufficient to qualify for the ERC under this provision.`;
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
6. ${hasValidRevenueData && includeRevenueSection ? 'Present the revenue data in a clear tabular format showing ALL quarters where data is available - do not imply the figures were audited' : 'Focus EXCLUSIVELY on how government orders caused a partial suspension of operations'}
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
    
    let generatedDocument = response.choices[0].message.content.trim();
    
    // Apply post-processing to ensure consistent formatting
    let processedDocument = ensureConsistentFormatting(generatedDocument, businessInfo.documentType);
    
    // Ensure the Issue section exists in the final document for Form 886-A
    if (businessInfo.documentType === 'form886A' && !processedDocument.includes('1. Issue')) {
      console.log('Issue section missing - forcing inclusion');
      
      // Create the Issue section with supply chain text if needed
      let supplyChainText = '';
      if (businessInfo.includeSupplyChainDisruption === true) {
        supplyChainText = ', including the substantial effect of supply chain disruptions caused by these orders as specified in IRS Notice 2021-20, Q/A #12';
      } else {
        supplyChainText = businessInfo.governmentOrdersInfo && 
                         businessInfo.governmentOrdersInfo.toLowerCase().includes('supply chain') 
                         ? ', including the effect of supply chain disruptions caused by these orders (if applicable)'
                         : '';
      }
      
      // Format the Issue section
      const issueSection = `1. Issue  
Determine whether ${businessInfo.businessName} qualifies for the Employee Retention Credit based on the full or partial suspension of its operations due to COVID‑19 government orders over the periods ${businessInfo.allTimePeriods.join(', ')}. This analysis specifically addresses the disallowance reason that ${getDisallowanceReasonText(businessInfo.disallowanceReason, businessInfo.customDisallowanceReason)} by documenting that, in fact, multiple orders were enacted that directly limited business operations${supplyChainText}.

`;

      // Prepend the Issue section to the document
      processedDocument = issueSection + processedDocument;
    }
    
    console.log('Document successfully generated');
    
    return processedDocument;
  } catch (error) {
    console.error('Error generating document:', error);
    throw new Error(`Failed to generate document: ${error.message}`);
  }
}

module.exports = {
  generateCustomPrompt,
  getTemplateContent,
  generateERCDocument,
  generateDocx,
  calculateRevenueDeclines,
  getQualifyingQuarters,
  getDisallowanceReasonText,
  createRevenueTable,
  ensureConsistentFormatting,
  processQualificationApproaches
};