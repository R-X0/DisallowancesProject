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
    
    // Check if we have any revenue data
    const hasAnyRevenueData = 
      businessInfo.q1_2019 || businessInfo.q2_2019 || businessInfo.q3_2019 || businessInfo.q4_2019 ||
      businessInfo.q1_2020 || businessInfo.q2_2020 || businessInfo.q3_2020 || businessInfo.q4_2020 ||
      businessInfo.q1_2021 || businessInfo.q2_2021 || businessInfo.q3_2021;
    
    // Process revenue data if available
    let revenueDeclines = [];
    let qualifyingQuarters = [];
    let approachFocus = businessInfo.approachFocus || 'governmentOrders';
    
    // If revenue data is sent directly from client, use it
    if (businessInfo.revenueDeclines && Array.isArray(businessInfo.revenueDeclines) && businessInfo.revenueDeclines.length > 0) {
      console.log('Using pre-calculated revenue declines from client');
      revenueDeclines = businessInfo.revenueDeclines;
      if (businessInfo.qualifyingQuarters && Array.isArray(businessInfo.qualifyingQuarters)) {
        qualifyingQuarters = businessInfo.qualifyingQuarters;
      }
    } else if (hasAnyRevenueData) {
      // Otherwise calculate from individual quarter data if we have some
      console.log('Calculating revenue declines from individual quarter data');
      revenueDeclines = calculateRevenueDeclines(businessInfo);
      qualifyingQuarters = getQualifyingQuarters(revenueDeclines);
    } else {
      console.log('No revenue data available, skipping revenue decline calculations');
    }
    
    console.log('Calculated revenue declines:', revenueDeclines);
    console.log('Qualifying quarters:', qualifyingQuarters);
    
    // Check what evidence we have available
    const hasRevenueDeclines = revenueDeclines.length > 0;
    const hasQualifyingQuarters = qualifyingQuarters.length > 0;

    // Check for government orders info
    const hasGovernmentOrdersInfo = 
      (businessInfo.timePeriods && businessInfo.timePeriods.length > 0) || 
      (businessInfo.governmentOrdersInfo && businessInfo.governmentOrdersInfo.trim().length > 0);

    // Build content that includes ALL available evidence
    let evidenceContent = '';

    // Include revenue data in the evidence content ONLY if we have qualifying quarters
    // or if we at least have some revenue data to show
    if (hasRevenueDeclines) {
      // Create a detailed revenue section with exact figures
      evidenceContent += `
REVENUE REDUCTION INFORMATION - AUDIT-CRITICAL DATA (MUST REPRODUCE EXACTLY):

${revenueDeclines.map(d => {
  const quarterKey = d.quarter.toLowerCase().replace(' ', '_');
  const baseQuarterKey = d.baseQuarter.toLowerCase().replace(' ', '_');
  return `• ${d.quarter}: EXACTLY $${businessInfo[quarterKey]} compared to ${d.baseQuarter}: EXACTLY $${businessInfo[baseQuarterKey]} = EXACTLY ${d.percentDecline} decline ${d.qualifies ? '(Qualifies for ERC)' : '(Does not meet threshold)'}`;
}).join('\n')}

${hasQualifyingQuarters ? 
  `Based on revenue decline thresholds (50%+ for 2020, 20%+ for 2021), the following quarters qualify for ERC: ${qualifyingQuarters.join(', ')}` : 
  'None of the quarters meet the ERC revenue decline thresholds (50%+ for 2020, 20%+ for 2021).'}
`;

      // Only add this stronger phrasing if we have qualifying quarters
      if (hasQualifyingQuarters) {
        evidenceContent += `
CRITICAL AUDIT REQUIREMENT: The above figures MUST appear VERBATIM in a dedicated "REVENUE DECLINE DATA" section in the document. These exact dollar amounts and percentages are required by the IRS for audit purposes. Do not paraphrase or summarize them.
`;
      }
      
      // Add any additional context provided by the user
      if (businessInfo.revenueReductionInfo) {
        evidenceContent += `\nAdditional context about revenue reduction: ${businessInfo.revenueReductionInfo}\n`;
      }
      
      // Only add the narrative format instructions if we have actual revenue data
      if (revenueDeclines.length > 0) {
        // Get the primary time period being protested (first in the list if multiple)
        const primaryTimePeriod = Array.isArray(allTimePeriods) && allTimePeriods.length > 0
          ? allTimePeriods[0]
          : timePeriods;
        
        // Find the decline data for the primary time period, if available
        const primaryDecline = revenueDeclines.find(d => d.quarter.includes(primaryTimePeriod.replace('Q', '')));
        
        evidenceContent += `
FORMAT REVENUE DECLINE DATA AS FOLLOWS:

1. Create a header paragraph that introduces the revenue data:
"In addition to these government orders, we are submitting detailed revenue data that unequivocally demonstrates the qualifying revenue reductions for [BUSINESS_NAME]. The following figures represent precise, dollar-for-dollar comparisons highlighting EXACT revenue amounts and percentage declines without rounding or generalization."

2. If applicable, highlight the specific quarter being protested with a detailed paragraph:
${primaryDecline ? 
  `"For ${primaryDecline.quarter} specifically, [BUSINESS_NAME] recorded EXACTLY $${businessInfo[primaryDecline.baseQuarter.toLowerCase().replace(' ', '_')]} in revenue for the comparable quarter in ${primaryDecline.baseQuarter.split(' ')[1]}. In stark contrast, our ${primaryDecline.quarter} revenue was EXACTLY $${businessInfo[primaryDecline.quarter.toLowerCase().replace(' ', '_')]}, representing a decline of EXACTLY $${(parseFloat(businessInfo[primaryDecline.baseQuarter.toLowerCase().replace(' ', '_')]) - parseFloat(businessInfo[primaryDecline.quarter.toLowerCase().replace(' ', '_')])).toFixed(2)} or EXACTLY ${primaryDecline.percentDecline} decline. This substantial revenue reduction is a direct consequence of the COVID-19-related government orders detailed above and clearly qualifies our business for the ERC."` : 
  `"For [PRIMARY_QUARTER] specifically, provide a detailed paragraph with the exact figures and percentage decline, connecting it directly to the government orders impact."`
}

3. List any additional quarters with bullet points:
"Our other quarters show similar qualifying declines:
${revenueDeclines.filter(d => primaryDecline && d.quarter !== primaryDecline.quarter || !primaryDecline)
  .map(d => {
    const quarterKey = d.quarter.toLowerCase().replace(' ', '_');
    const baseQuarterKey = d.baseQuarter.toLowerCase().replace(' ', '_');
    const declineAmount = (parseFloat(businessInfo[baseQuarterKey]) - parseFloat(businessInfo[quarterKey])).toFixed(2);
    return `• ${d.quarter}: Revenue fell from EXACTLY $${businessInfo[baseQuarterKey]} (${d.baseQuarter.split(' ')[1]}) to EXACTLY $${businessInfo[quarterKey]} (${d.quarter.split(' ')[1]}), a decline of EXACTLY $${declineAmount} or ${d.percentDecline}`;
  }).join('\n')}"

4. Add a concluding sentence:
"All quarters listed above with declines exceeding the applicable thresholds (50%+ for 2020, 20%+ for 2021) qualify for ERC. These substantial revenue reductions, in conjunction with the governmental order-induced partial suspension of operations, provide strong substantiation for [BUSINESS_NAME]'s ERC claim."

DO NOT USE A TABLE FORMAT FOR THIS DATA. The narrative format above is required for better letter flow while still maintaining all exact figures needed for audit purposes.
`;

        // If we have qualifying quarters, add a special instruction to emphasize this
        if (hasQualifyingQuarters) {
          evidenceContent += `
IMPORTANT: Since this business has qualifying revenue reductions, this MUST be clearly stated in the document as a basis for ERC qualification. The exact figures MUST be included in the document using the narrative format described above.
`;
        }
      }
    }

    // Also include government orders info if we have it
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

- Order Name: [Full Name of Order]
- Order Number: [Official Number/Identifier]
- Date Enacted: [MM/DD/YYYY]
- Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
- Order Summary: [2-3 sentence detailed description of what the order mandated]
- Impact on Quarter: [Specific explanation of how this affected the business operations]

IMPORTANT: Each order must be listed individually with ALL six fields above. Do not abbreviate or simplify this format, even for minor orders.`;

      // If we have revenue decline data, add instructions on how to present it
      if (hasRevenueDeclines) {
        promptTemplate += `

REVENUE DECLINE PRESENTATION FORMAT:
When including revenue decline information, it MUST be presented using the narrative format specified above. Avoid tables and maintain a narrative flow while including all EXACT dollar figures and percentages.`;
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
6. You MUST reproduce the EXACT revenue figures and percentages in a dedicated section - this is a non-negotiable legal requirement
7. DO NOT create a table for revenue figures - use the narrative format as instructed above`;
    
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

- Order Name: [Full Name of Order]
- Order Number: [Official Number/Identifier]
- Date Enacted: [MM/DD/YYYY]
- Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
- Order Summary: [2-3 sentence detailed description of what the order mandated]
- Impact on Quarter: [Specific explanation of how this affected the business operations]

IMPORTANT: Each order must be listed individually with ALL six fields above. Do not abbreviate or simplify this format, even for minor orders.`;

      // If we have revenue decline data, add instructions on how to present it
      if (hasRevenueDeclines) {
        promptTemplate += `

REVENUE DECLINE PRESENTATION FORMAT - LEGAL AUDIT REQUIREMENT:
You MUST include a dedicated section titled "REVENUE DECLINE DATA" containing the EXACT revenue figures in a narrative format (NOT A TABLE):

1. Start with an introductory paragraph explaining the purpose of this section
2. For the main quarter being protested, include a detailed paragraph with:
   • EXACT revenue amounts for the current quarter and comparison quarter
   • EXACT dollar amount of decline
   • EXACT percentage decline
   • Clear statement of qualification based on threshold

3. For any additional quarters, use bullet points with the same EXACT figures
4. End with a brief conclusion connecting revenue decline to ERC qualification

This is a LEGAL REQUIREMENT - the letter will be rejected without these specific figures presented clearly.`;
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
6. You MUST include EXACT revenue figures and percentages exactly as provided above - this is a legal and audit requirement
7. For revenue figures, create a narrative format with paragraph and bullet points - DO NOT USE TABLES`;
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