// server/db-connection.js
const mongoose = require('mongoose');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    return false;
  }
};

// Define submission schema
const submissionSchema = new mongoose.Schema({
  submissionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  businessName: {
    type: String,
    required: true
  },
  ein: String,
  location: String,
  businessWebsite: String,
  naicsCode: String,
  timePeriods: [String],
  status: {
    type: String,
    default: 'Gathering data',
    enum: ['Gathering data', 'LLM pass #1 complete', 'Links verified', 'PDF done', 'mailed']
  },
  submissionData: {
    type: Object,
    default: {}
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Update the lastUpdated field before each save
submissionSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Create the model if it doesn't exist
const Submission = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);

module.exports = {
  connectDB,
  Submission
};