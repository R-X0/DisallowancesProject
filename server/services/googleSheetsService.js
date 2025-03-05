// server/services/googleSheetsService.js
const { google } = require('googleapis');
const path = require('path');

class GoogleSheetsService {
  constructor() {
    this.initialized = false;
    this.sheets = null;
    
    // TEMPORARY FIX: Hardcoded spreadsheet ID
    // In production, this should come from process.env.GOOGLE_SHEET_ID
    this.spreadsheetId = '13zhAc2uKW5DOyW_LJuDiUxA7gV3rD_9yLFTveW9aRtM';
    
    console.log('GoogleSheetsService constructor - Using spreadsheetId:', this.spreadsheetId);
  }

  async initialize() {
    try {
      console.log('Initializing Google Sheets service...');
      
      const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, '../config/google-credentials.json'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      
      const client = await auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: client });
      
      // Double-check spreadsheet ID is set
      if (!this.spreadsheetId) {
        console.log('No spreadsheetId found in env vars, using hardcoded value');
        this.spreadsheetId = '13zhAc2uKW5DOyW_LJuDiUxA7gV3rD_9yLFTveW9aRtM';
      }
      
      this.initialized = true;
      console.log('Google Sheets service initialized successfully with spreadsheetId:', this.spreadsheetId);
      
      // Ensure headers exist on initialization
      await this.ensureHeadersExist();
    } catch (error) {
      console.error('Failed to initialize Google Sheets service:', error);
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // Make sure the sheet has the correct headers
  async ensureHeadersExist() {
    try {
      // Check if headers already exist
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'ERC Tracking!A1:N1',
      });
      
      if (!response.data.values || response.data.values.length === 0) {
        // No headers, add them
        console.log("No headers found, adding headers row");
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: 'ERC Tracking!A1:N1',
          valueInputOption: 'RAW',
          resource: {
            values: [[
              "Tracking ID", 
              "Business Name", 
              "EIN", 
              "Location", 
              "Business Website", 
              "NAICS Code", 
              "Time Period", 
              "Additional Info", 
              "Status", 
              "Timestamp", 
              "Protest Letter Path", 
              "ZIP Path", 
              "Tracking Number", 
              "Google Drive Link"
            ]]
          }
        });
        console.log("Headers added successfully");
      } else {
        // Headers exist but might need updating
        const headers = response.data.values[0];
        if (headers.length < 14) {
          console.log("Headers row exists but is incomplete, updating headers");
          // Missing some headers, update them
          const completeHeaders = [
            "Tracking ID", 
            "Business Name", 
            "EIN", 
            "Location", 
            "Business Website", 
            "NAICS Code", 
            "Time Period", 
            "Additional Info", 
            "Status", 
            "Timestamp", 
            "Protest Letter Path", 
            "ZIP Path", 
            "Tracking Number", 
            "Google Drive Link"
          ];
          
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: 'ERC Tracking!A1:N1',
            valueInputOption: 'RAW',
            resource: { values: [completeHeaders] }
          });
          console.log("Headers updated successfully");
        }
      }
    } catch (error) {
      console.error("Error ensuring headers exist:", error);
      // Continue anyway, this shouldn't block the main operation
    }
  }

  async addSubmission(submissionData) {
    await this.ensureInitialized();
    
    const {
      trackingId,
      businessName,
      ein,                  // Added fields
      location,             
      businessWebsite,      
      naicsCode,            
      timePeriod,
      additionalInfo,       // Added field
      status = 'Gathering data',
      timestamp = new Date().toISOString(),
      protestLetterPath = '',
      zipPath = '',
      trackingNumber = '',
      googleDriveLink = ''
    } = submissionData;

    try {
      console.log('Adding submission to Google Sheet with ID:', this.spreadsheetId);
      console.log('Adding data:', { trackingId, businessName, ein, location, timePeriod });
      
      // First, check if the header row exists, and create it if not
      await this.ensureHeadersExist();
      
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'ERC Tracking!A:N', // Expanded range to include all fields
        valueInputOption: 'RAW',
        resource: {
          values: [
            [
              trackingId,
              businessName,
              ein,                // Added
              location,           // Added
              businessWebsite,    // Added
              naicsCode,          // Added
              timePeriod,
              additionalInfo,     // Added
              status,
              timestamp,
              protestLetterPath,
              zipPath,
              trackingNumber,
              googleDriveLink     // Make sure this is in the last column
            ]
          ]
        }
      });

      console.log('Added submission to Google Sheet:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error adding submission to Google Sheet:', error);
      
      // Retry once with sheet initialization
      try {
        console.log('Retrying with sheet initialization...');
        await this.initialize();
        
        const response = await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: 'ERC Tracking!A:N', // Expanded range
          valueInputOption: 'RAW',
          resource: {
            values: [
              [
                trackingId,
                businessName,
                ein,
                location,
                businessWebsite,
                naicsCode,
                timePeriod,
                additionalInfo,
                status,
                timestamp,
                protestLetterPath,
                zipPath,
                trackingNumber,
                googleDriveLink
              ]
            ]
          }
        });
        
        console.log('Added submission to Google Sheet on retry:', response.data);
        return response.data;
      } catch (retryError) {
        console.error('Error adding submission to Google Sheet after retry:', retryError);
        throw retryError;
      }
    }
  }

  async updateSubmission(trackingId, updateData) {
    await this.ensureInitialized();
    
    try {
      // First, find the row with the matching tracking ID
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'ERC Tracking!A:A',
      });
      
      const rows = response.data.values || [];
      let rowIndex = -1;
      
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === trackingId) {
          rowIndex = i + 1; // +1 because sheets are 1-indexed
          break;
        }
      }
      
      if (rowIndex === -1) {
        throw new Error(`Submission with tracking ID ${trackingId} not found`);
      }
      
      console.log(`Found submission ${trackingId} at row ${rowIndex}`);
      
      // Now we know which row to update
      const {
        status,
        timestamp = new Date().toISOString(),
        protestLetterPath,
        zipPath,
        trackingNumber,
        googleDriveLink
      } = updateData;

      // Log the update data for debugging
      console.log('Updating submission with data:', {
        status,
        timestamp,
        protestLetterPath,
        zipPath,
        trackingNumber,
        googleDriveLink
      });
      
      // Create update data, only including fields that are provided
      if (status !== undefined) {
        // Status is now in column I (index 8)
        console.log(`Updating status to "${status}" in cell I${rowIndex}`);
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `ERC Tracking!I${rowIndex}`,
          valueInputOption: 'RAW',
          resource: { values: [[status]] },
        });
      }
      
      // Always update timestamp (now column J)
      console.log(`Updating timestamp to "${timestamp}" in cell J${rowIndex}`);
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `ERC Tracking!J${rowIndex}`,
        valueInputOption: 'RAW',
        resource: { values: [[timestamp]] },
      });
      
      if (protestLetterPath !== undefined) {
        // Protest Letter Path is now column K
        console.log(`Updating protest letter path to "${protestLetterPath}" in cell K${rowIndex}`);
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `ERC Tracking!K${rowIndex}`,
          valueInputOption: 'RAW',
          resource: { values: [[protestLetterPath]] },
        });
      }
      
      if (zipPath !== undefined) {
        // ZIP Path is now column L
        console.log(`Updating ZIP path to "${zipPath}" in cell L${rowIndex}`);
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `ERC Tracking!L${rowIndex}`,
          valueInputOption: 'RAW',
          resource: { values: [[zipPath]] },
        });
      }
      
      if (trackingNumber !== undefined) {
        // Tracking Number is now column M
        console.log(`Updating tracking number to "${trackingNumber}" in cell M${rowIndex}`);
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `ERC Tracking!M${rowIndex}`,
          valueInputOption: 'RAW',
          resource: { values: [[trackingNumber]] },
        });
      }
      
      if (googleDriveLink !== undefined) {
        // Google Drive Link is now column N
        console.log(`Updating Google Drive link to "${googleDriveLink}" in cell N${rowIndex}`);
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `ERC Tracking!N${rowIndex}`,
          valueInputOption: 'RAW',
          resource: { values: [[googleDriveLink]] },
        });
      }
      
      console.log(`Updated submission ${trackingId} in Google Sheet`);
      return { success: true, rowIndex };
    } catch (error) {
      console.error(`Error updating submission ${trackingId} in Google Sheet:`, error);
      throw error;
    }
  }

  async getAllSubmissions() {
    await this.ensureInitialized();
    
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'ERC Tracking!A2:N', // Update to include all columns
      });
      
      const rows = response.data.values || [];
      
      const submissions = rows.map(row => {
        // Ensure we have at least the required fields
        while (row.length < 14) row.push('');
        
        return {
          trackingId: row[0] || '',
          businessName: row[1] || '',
          ein: row[2] || '',
          location: row[3] || '',
          businessWebsite: row[4] || '',
          naicsCode: row[5] || '',
          timePeriod: row[6] || '',
          additionalInfo: row[7] || '',
          status: row[8] || '',
          timestamp: row[9] || '',
          protestLetterPath: row[10] || '',
          zipPath: row[11] || '',
          trackingNumber: row[12] || '',
          googleDriveLink: row[13] || ''
        };
      });
      
      return submissions;
    } catch (error) {
      console.error('Error fetching submissions from Google Sheet:', error);
      throw error;
    }
  }
}

// Singleton instance
const sheetsService = new GoogleSheetsService();

module.exports = sheetsService;