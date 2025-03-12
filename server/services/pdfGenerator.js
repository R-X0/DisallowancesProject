// server/services/pdfGenerator.js

const puppeteer = require('puppeteer');

/**
 * Generate a PDF version of the letter with enhanced formatting
 * @param {string} text - The text content to convert to PDF
 * @param {string} outputPath - The path to save the PDF file
 * @returns {string} - The path to the generated PDF
 */
async function generatePdf(text, outputPath) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    const page = await browser.newPage();
    
    // Split the text into lines for processing
    const lines = text.split('\n');
    let htmlContent = '';
    let inList = false;
    let inTableHeader = false;
    let inTableBody = false;
    let inTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) {
        // End list if we were in one
        if (inList) {
          htmlContent += '</ul>\n';
          inList = false;
        }
        htmlContent += '<div class="spacer"></div>\n';
        continue;
      }
      
      // Detect headers (dates, addresses, reference info) at the top of the document
      if (i < 20 && (
        line.match(/^\d{2}\/\d{2}\/\d{4}$/) || // Date
        line.match(/^(Internal Revenue Service|EIN:|Taxpayer Name:|RE:|Tax Period:|Claim Amount:)/) ||
        line.match(/^[A-Z][a-zA-Z\s,]+(,\s*[A-Z]{2}\s+\d{5})?$/) // Address with optional zip
      )) {
        htmlContent += `<p class="header-info">${line}</p>\n`;
        continue;
      }
      
      // Detect level 1 headings (main sections)
      if (line.match(/^[A-Z][A-Z\s]+$/) || 
          (line.match(/^[A-Z][a-zA-Z\s]+(:|$)/) && line.length < 60)) {
        // Close any open list
        if (inList) {
          htmlContent += '</ul>\n';
          inList = false;
        }
        htmlContent += `<h2>${line}</h2>\n`;
        continue;
      }

      // Detect the "Dear Appeals Officer," line or similar
      if (line.match(/^Dear [A-Z][a-z]+(\s+[A-Z][a-z]+)?,$/)) {
        htmlContent += `<p class="salutation">${line}</p>\n`;
        continue;
      }
      
      // Detect table-like order summary sections
      if (line.match(/^Order\s+Date\s+Date\s+Operational/i) || 
          line.match(/^[A-Za-z\s]+\s+Enacted\s+Rescinded\s+Impact/i)) {
        inTableHeader = true;
        inTable = true;
        htmlContent += '<div class="order-table">\n<table>\n<thead>\n<tr>\n';
        
        // Split the header into columns
        const headers = line.split(/\s{2,}/).filter(h => h.trim());
        for (const header of headers) {
          htmlContent += `<th>${header.trim()}</th>\n`;
        }
        
        htmlContent += '</tr>\n</thead>\n<tbody>\n';
        continue;
      }
      
      // Process table rows
      if (inTable && !inTableHeader && !line.startsWith('(Source')) {
        const cells = line.split(/\s{2,}/).filter(c => c.trim());
        if (cells.length >= 3) { // At least 3 columns to consider it a table row
          htmlContent += '<tr>\n';
          for (const cell of cells) {
            htmlContent += `<td>${cell.trim()}</td>\n`;
          }
          htmlContent += '</tr>\n';
          continue;
        } else {
          // No longer in table
          if (inTable) {
            htmlContent += '</tbody>\n</table>\n</div>\n';
            inTable = false;
            inTableHeader = false;
          }
        }
      }
      
      // End table if we see a source citation after a table
      if (inTable && line.startsWith('(Source')) {
        htmlContent += '</tbody>\n</table>\n</div>\n';
        htmlContent += `<p class="source">${line}</p>\n`;
        inTable = false;
        inTableHeader = false;
        continue;
      }
      
      // Handle bullet points with "• " prefix
      if (line.startsWith('• ')) {
        if (!inList) {
          htmlContent += '<ul class="bullet-list">\n';
          inList = true;
        }
        
        // Process sub-details in bullet points (like Order Name:, etc.)
        if (line.includes(': ')) {
          const [label, value] = line.substring(2).split(/:\s+/, 2);
          htmlContent += `<li><strong>${label}:</strong> ${value || ''}</li>\n`;
        } else {
          htmlContent += `<li>${line.substring(2)}</li>\n`;
        }
        continue;
      }
      
      // Handle indented bullet points
      if ((line.startsWith('  • ') || line.startsWith('    • '))) {
        if (!inList) {
          htmlContent += '<ul class="bullet-list">\n';
          inList = true;
        }
        
        // Extract the bullet text
        const bulletText = line.trim().substring(2);
        
        // Check if it's a "key: value" format
        if (bulletText.includes(': ')) {
          const [label, value] = bulletText.split(/:\s+/, 2);
          htmlContent += `<li class="nested"><strong>${label}:</strong> ${value || ''}</li>\n`;
        } else {
          htmlContent += `<li class="nested">${bulletText}</li>\n`;
        }
        continue;
      }
      
      // Check if it's letter closing (Sincerely, etc.)
      if (line === 'Sincerely,' || line === 'Attestation:' || line.match(/^Enclosures:/)) {
        if (inList) {
          htmlContent += '</ul>\n';
          inList = false;
        }
        htmlContent += `<p class="closing">${line}</p>\n`;
        continue;
      }
      
      // Regular paragraph, but check for Order Name: type content in paragraphs
      if (line.match(/^(Order|Order Name|Date Enacted|Date Rescinded|Impact on Quarter|Order Summary):/)) {
        // Close any open list first
        if (inList) {
          htmlContent += '</ul>\n';
          inList = false;
        }
        
        const [label, value] = line.split(/:\s+/, 2);
        htmlContent += `<p class="detail-line"><strong>${label}:</strong> ${value || ''}</p>\n`;
      } else {
        // Regular paragraph
        if (inList) {
          htmlContent += '</ul>\n';
          inList = false;
        }
        htmlContent += `<p>${line}</p>\n`;
      }
    }
    
    // Close any open tags
    if (inList) {
      htmlContent += '</ul>\n';
    }
    
    if (inTable) {
      htmlContent += '</tbody>\n</table>\n</div>\n';
    }
    
    // Create HTML with proper formatting
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
            
            body {
              font-family: 'Roboto', Arial, sans-serif;
              font-size: 11pt;
              line-height: 1.4;
              color: #333;
              margin: 1in;
              padding: 0;
            }
            
            p {
              margin: 0.5em 0;
              text-align: justify;
            }
            
            .spacer {
              height: 0.5em;
            }
            
            .header-info {
              margin: 0.15em 0;
              line-height: 1.2;
            }
            
            .salutation {
              margin-top: 1em;
              margin-bottom: 1em;
            }
            
            h2 {
              font-size: 12pt;
              font-weight: bold;
              margin-top: 1em;
              margin-bottom: 0.5em;
              text-transform: uppercase;
            }
            
            .bullet-list {
              margin: 0.5em 0 0.5em 0;
              padding-left: 1.5em;
              list-style-type: disc;
            }
            
            .bullet-list li {
              margin-bottom: 0.4em;
              text-align: justify;
              padding-left: 0.2em;
            }
            
            .bullet-list li.nested {
              margin-left: 1.5em;
            }
            
            .detail-line {
              margin: 0.3em 0;
            }
            
            .closing {
              margin-top: 1.5em;
              margin-bottom: 0.4em;
            }
            
            .source {
              margin-top: 0.5em;
              font-style: italic;
              font-size: 10pt;
            }
            
            .order-table {
              margin: 1em 0;
              width: 100%;
            }
            
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10pt;
            }
            
            th, td {
              border: 1px solid #ddd;
              padding: 6px;
              text-align: left;
              vertical-align: top;
            }
            
            th {
              background-color: #f2f2f2;
              font-weight: bold;
            }
            
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
          </style>
        </head>
        <body>${htmlContent}</body>
      </html>
    `);
    
    // Generate PDF
    await page.pdf({
      path: outputPath,
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: false,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });
    
    return outputPath;
  } finally {
    await browser.close();
  }
}

module.exports = {
  generatePdf
};