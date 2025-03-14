// server/services/documentGenerator.js

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const OpenAI = require('openai').default;

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
 * Generate an ERC document (protest letter or Form 886-A)
 * @param {Object} businessInfo - Business information
 * @param {string} covidData - Sanitized ChatGPT conversation containing COVID research
 * @param {string} templateContent - Template content for the document
 * @returns {string} - The generated document
 */
async function generateERCDocument(businessInfo, covidData, templateContent) {
  try {
    console.log('Generating document using GPT...');
    console.log('Business Info for Revenue Calculation:', {
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
    
    // Handle multiple time periods
    let timePeriods = businessInfo.timePeriod;
    let allTimePeriods = businessInfo.allTimePeriods || [businessInfo.timePeriod];
    
    // Format the time periods for display
    const timePeriodsFormatted = Array.isArray(allTimePeriods) 
      ? allTimePeriods.join(', ') 
      : timePeriods;
    
    // Process revenue data if available
    let revenueDeclines = [];
    let qualifyingQuarters = [];
    let approachFocus = businessInfo.approachFocus || 'governmentOrders';
    
    // If revenue data is sent directly from client, use it
    if (businessInfo.revenueDeclines && Array.isArray(businessInfo.revenueDeclines)) {
      revenueDeclines = businessInfo.revenueDeclines;
      if (businessInfo.qualifyingQuarters && Array.isArray(businessInfo.qualifyingQuarters)) {
        qualifyingQuarters = businessInfo.qualifyingQuarters;
      }
    } else {
      // Otherwise calculate from individual quarter data
      revenueDeclines = calculateRevenueDeclines(businessInfo);
      qualifyingQuarters = getQualifyingQuarters(revenueDeclines);
    }
    
    console.log('Calculated revenue declines:', revenueDeclines);
    console.log('Qualifying quarters:', qualifyingQuarters);
    
    // Check what evidence we have available
    const hasRevenueDeclines = revenueDeclines.length > 0;
    const hasQualifyingQuarters = qualifyingQuarters.length > 0;

    // Check for government orders info
    const hasGovernmentOrders = 
      (businessInfo.timePeriods && businessInfo.timePeriods.length > 0) || 
      (businessInfo.governmentOrdersInfo && businessInfo.governmentOrdersInfo.trim().length > 0);

    // Build content that includes ALL available evidence
    let evidenceContent = '';

    // Always include revenue data if we have it
    if (hasRevenueDeclines) {
      // Create a detailed revenue section with exact figures - FORCE INCLUSION WITH STRONGER LANGUAGE
      evidenceContent += `
REVENUE REDUCTION INFORMATION - AUDIT-CRITICAL DATA (MUST REPRODUCE EXACTLY):

${revenueDeclines.map(d => {
  const quarterKey = d.quarter.toLowerCase().replace(' ', '_');
  const baseQuarterKey = d.baseQuarter.toLowerCase().replace(' ', '_');
  return `• ${d.quarter}: EXACTLY $${businessInfo[quarterKey]} compared to ${d.baseQuarter}: EXACTLY $${businessInfo[baseQuarterKey]} = EXACTLY ${d.percentDecline} decline ${d.qualifies ? '(Qualifies for ERC)' : '(Does not meet threshold)'}`;
}).join('\n')}

CRITICAL AUDIT REQUIREMENT: The above figures MUST appear VERBATIM in a dedicated "REVENUE DECLINE DATA" section in the document. These exact dollar amounts and percentages are required by the IRS for audit purposes. Do not paraphrase or summarize them.

${hasQualifyingQuarters ? 
      `Based on revenue decline thresholds (50%+ for 2020, 20%+ for 2021), the following quarters qualify for ERC: ${qualifyingQuarters.join(', ')}` : 
      'None of the quarters meet the ERC revenue decline thresholds (50%+ for 2020, 20%+ for 2021).'}

${businessInfo.revenueReductionInfo ? `\nAdditional context about revenue reduction: ${businessInfo.revenueReductionInfo}` : ''}

CREATE A TABLE IN THE DOCUMENT THAT SHOWS:
Quarter | 2019 Revenue | 2020/2021 Revenue | Decline $ | Decline % | Qualifies?
`;

      // Add a row for each quarter with data
      for (const decline of revenueDeclines) {
        const quarterKey = decline.quarter.toLowerCase().replace(' ', '_');
        const baseQuarterKey = decline.baseQuarter.toLowerCase().replace(' ', '_');
        const declineAmount = parseFloat(businessInfo[baseQuarterKey]) - parseFloat(businessInfo[quarterKey]);
        
        evidenceContent += `${decline.quarter} | $${businessInfo[baseQuarterKey]} | $${businessInfo[quarterKey]} | $${declineAmount.toFixed(2)} | ${decline.percentDecline} | ${decline.qualifies ? 'Yes' : 'No'}\n`;
      }

      // If we have qualifying quarters, add a special instruction to emphasize this
      if (hasQualifyingQuarters) {
        evidenceContent += `
IMPORTANT: Since this business has qualifying revenue reductions, this MUST be clearly stated in the document as a basis for ERC qualification. The above table with EXACT figures MUST be included in the document.
`;
      }
    }

    // Also include government orders info if we have it
    if (hasGovernmentOrders) {
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
      CRITICAL REQUIREMENT: This is a legal tax document that MUST include EXACT revenue figures provided, without rounding or generalizing.
      Create a comprehensive Form 886-A document with sections for Issue, Facts, Law, Argument, and Conclusion based on the specific business information and COVID-19 research data provided.`;
      
      promptTemplate = `CRITICAL LEGAL REQUIREMENT: This document MUST include the EXACT revenue figures provided below. Do not round, generalize, or summarize these numbers. They are required for IRS audit purposes.

Please create a Form 886-A document for ERC substantiation using the following information:

BUSINESS INFORMATION:
Business Name: ${businessInfo.businessName}
EIN: ${businessInfo.ein}
Location: ${businessInfo.location}
Time Periods: ${timePeriodsFormatted}
Business Type: ${businessInfo.businessType || 'business'}

${evidenceContent}

COVID-19 RESEARCH DATA:
${covidData}

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT include direct links or URLs in the document - they will be processed separately and added as attachments
2. Instead of URLs, reference orders and sources by their names and dates
3. Use CONSISTENT formatting throughout - use bullet points (•) for all lists, not dashes or mixed formats
4. Include ALL relevant ERC qualification evidence available - revenue decline AND/OR government orders
5. If revenue decline data shows qualifying quarters, make this a PROMINENT part of the document

SPECIFIC FORMAT REQUIREMENTS FOR GOVERNMENT ORDERS:
For each government order mentioned, you MUST use this EXACT detailed format:

• Order Name: [Full Name of Order]
• Order Number: [Official Number/Identifier]
• Date Enacted: [MM/DD/YYYY]
• Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
• Order Summary: [2-3 sentence detailed description of what the order mandated]
• Impact on Quarter: [Specific explanation of how this affected the business operations]

IMPORTANT: Each order must be listed individually with ALL six fields above. Do not abbreviate or simplify this format, even for minor orders.`;

      // If we have revenue decline data, add instructions on how to present it
      if (hasRevenueDeclines) {
        promptTemplate += `

REVENUE DECLINE PRESENTATION FORMAT:
When including revenue decline information, it MUST be presented in this format:

1. Create a dedicated section with a clear heading "REVENUE DECLINE DATA" that includes:
   • The table format shown above with the EXACT dollar amounts and percentages
   • For each relevant quarter, clearly show:
     - Original revenue figures for both comparison quarters (EXACT DOLLAR AMOUNTS as provided above)
     - Percentage decline calculations (EXACT PERCENTAGES as calculated above)
     - Clear indication of which quarters qualify based on thresholds (50% for 2020, 20% for 2021)

2. In the appropriate sections:
   • Reference both revenue decline and government orders as qualification methods when both apply
   • Clearly state which quarters qualify under which method`;
      }

      promptTemplate += `

FORMAT: Create a comprehensive Form 886-A document with the following structure:
1. Issue - Define the question of whether the business qualifies for ERC based on ALL available evidence
2. Facts - Detail the business operations and include ALL relevant evidence (revenue decline data AND/OR government orders)
3. Law - Explain the ERC provisions, IRS Notice 2021-20, and other relevant guidance for ALL qualification methods
4. Argument - Present the case for why the business qualifies based on ALL available evidence
5. Conclusion - Summarize the eligibility determination using ALL qualification methods

Use today's date: ${new Date().toLocaleDateString()}

FINAL CRITICAL INSTRUCTION:
1. Include ALL available qualification evidence in the document
2. MAINTAIN the exact format for government orders specified above - this format is REQUIRED
3. Do not abbreviate or simplify the government order format, even for minor orders
4. If both revenue reduction and government orders information is available, include BOTH
5. Format each government order with all six required fields (Name, Number, Dates, Summary, Impact)
6. You MUST reproduce the EXACT revenue figures and percentages in a dedicated "REVENUE DECLINE DATA" section - this is a non-negotiable legal requirement`;
    
    } else {
      // Default to protest letter (original functionality)
      systemPrompt = `You are an expert in creating IRS Employee Retention Credit (ERC) protest letters.
      CRITICAL REQUIREMENT: This is a legal tax document that MUST include EXACT revenue figures provided, without rounding or generalizing.
      Create a formal protest letter following the exact format and style of the example letter provided,
      using the specific business information and COVID-19 research data provided.`;
      
      promptTemplate = `CRITICAL LEGAL REQUIREMENT: This document MUST include the EXACT revenue figures provided below. Do not round, generalize, or summarize these numbers. They are required for IRS audit purposes.

Please create an ERC protest letter using the following information:

BUSINESS INFORMATION:
Business Name: ${businessInfo.businessName}
EIN: ${businessInfo.ein}
Location: ${businessInfo.location}
Time Period: ${timePeriods}
Business Type: ${businessInfo.businessType || 'business'}

${evidenceContent}

COVID-19 RESEARCH DATA FROM CHATGPT:
${covidData}

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT include direct links or URLs in the letter body - they will be processed separately and added as attachments
2. Instead of URLs, reference orders and sources by their names and dates
3. Use CONSISTENT formatting throughout - use bullet points (•) for all lists, not dashes or mixed formats
4. Include ALL relevant ERC qualification evidence available - revenue decline AND/OR government orders
5. If revenue decline data shows qualifying quarters, make this a PROMINENT part of the document

SPECIFIC FORMAT REQUIREMENTS FOR GOVERNMENT ORDERS:
For each government order mentioned, you MUST use this EXACT detailed format:

• Order Name: [Full Name of Order]
• Order Number: [Official Number/Identifier]
• Date Enacted: [MM/DD/YYYY]
• Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
• Order Summary: [2-3 sentence detailed description of what the order mandated]
• Impact on Quarter: [Specific explanation of how this affected the business operations]

IMPORTANT: Each order must be listed individually with ALL six fields above. Do not abbreviate or simplify this format, even for minor orders.`;

      // If we have revenue decline data, add instructions on how to present it
      if (hasRevenueDeclines) {
        promptTemplate += `

REVENUE DECLINE PRESENTATION FORMAT - LEGAL AUDIT REQUIREMENT:
You MUST include a dedicated section titled "REVENUE DECLINE DATA" containing:

1. The EXACT table format shown above with:
   • EXACT revenue figures for each quarter (not rounded or generalized)
   • Dollar-for-dollar comparison between quarters
   • EXACT percentage calculations
   • Clear indication of qualifying quarters

2. This section MUST include a paragraph explicitly stating:
   • The EXACT revenue amounts for each relevant quarter
   • The EXACT percentage decline for each quarter
   • Which quarters qualify based on thresholds (50% for 2020, 20% for 2021)

This is a LEGAL REQUIREMENT - the letter will be rejected without these specific figures.`;
      }

      promptTemplate += `

FORMAT EXAMPLE (FOLLOW THIS GENERAL STRUCTURE BUT INCLUDE ALL QUALIFICATION EVIDENCE):
${templateContent}

Create a comprehensive protest letter using the business information and ALL available evidence above, following the general format and structure of the example letter. Make it specific to the time period ${timePeriods} and location of the business. Use today's date: ${new Date().toLocaleDateString()}

FINAL CRITICAL INSTRUCTION:
1. Include ALL available qualification evidence in the document
2. MAINTAIN the exact format for government orders specified above - this format is REQUIRED
3. Do not abbreviate or simplify the government order format, even for minor orders
4. If both revenue reduction and government orders information is available, include BOTH
5. Format each government order with all six required fields (Name, Number, Dates, Summary, Impact)
6. You MUST include EXACT revenue figures and percentage declines exactly as provided above - this is a legal and audit requirement
7. Add a separate section titled "REVENUE DECLINE DATA" containing the specific revenue figures and calculations`;
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

module.exports = {
  generateCustomPrompt,
  getTemplateContent,
  generateERCDocument
};