const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { config } = require('dotenv');   
config(); // Load environment variables from .env file
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'ecell_survey';
const COLLECTION_NAME = 'survey_responses';

let db;
let collection;
// === MongoDB Connection ===
async function connectToMongoDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DATABASE_NAME);
        collection = db.collection(COLLECTION_NAME);
        
        // Create indexes for better performance
        await collection.createIndex({ timestamp: 1 });
        await collection.createIndex({ userType: 1 });
        await collection.createIndex({ id: 1 }, { unique: true });
        
        console.log('✅ Connected to MongoDB successfully');
        console.log(`📊 Database: ${DATABASE_NAME}`);
        console.log(`📋 Collection: ${COLLECTION_NAME}`);
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

// === Middleware ===
app.use(express.json({ limit: '10mb' }));

// Enhanced CORS configuration
app.use(cors({
    origin: ['https://atul-k-m.github.io/ecell-feedback','https://atul-k-m.github.io', 'http://127.0.0.1:5500', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files from current directory
app.use(express.static(__dirname));

// === Serve Static Files ===
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve questions.json if it exists
app.get('/questions.json', async (req, res) => {
    try {
        const fs = require('fs').promises;
        const questionsPath = path.join(__dirname, 'questions.json');
        await fs.access(questionsPath);
        res.sendFile(questionsPath);
    } catch (error) {
        // Return sample questions if file doesn't exist
        const sampleQuestions = {
            stakeholder: {
                year_question: {
                    question: "Which year are you in?",
                    options: ["1st Year", "2nd Year", "3rd Year", "4th Year", "Graduate"]
                },
                role_question: {
                    question: "What is your role with E-Cell?",
                    options: ["Team Member", "Alumni", "Faculty", "Industry Partner", "Investor"]
                },
                rating_questions: [
                    {
                        question: "How satisfied are you with E-Cell's current initiatives?",
                        scale: 5
                    },
                    {
                        question: "How likely are you to recommend E-Cell to others?",
                        scale: 5
                    }
                ],
                open_ended: [
                    {
                        question: "What suggestions do you have for improving E-Cell?"
                    },
                    {
                        question: "What new initiatives would you like to see from E-Cell?"
                    }
                ]
            },
            participant: {
                event_question: {
                    question: "Which E-Cell event did you participate in?",
                    options: ["Workshop", "Seminar", "Competition", "Networking Event", "Startup Pitch", "Other"]
                },
                rating_questions: [
                    {
                        question: "How would you rate your overall experience?",
                        scale: 5
                    },
                    {
                        question: "How valuable was the content presented?",
                        scale: 5
                    }
                ],
                open_ended: [
                    {
                        question: "What did you learn from the E-Cell event?"
                    },
                    {
                        question: "How can we improve future events?"
                    }
                ]
            }
        };
        res.json(sampleQuestions);
    }
});

// === API: Submit Survey ===
app.post('/api/submit-survey', async (req, res) => {
    try {
        console.log('Received survey submission:', req.body);
        
        const surveyData = req.body;

        // Validate required fields
        if (!surveyData.userType) {
            return res.status(400).json({ error: 'User type is required' });
        }

        // Add timestamp if not present
        if (!surveyData.timestamp) {
            surveyData.timestamp = new Date().toISOString();
        }

        // Add unique ID for each response
        surveyData.id = Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Insert into MongoDB
        const result = await collection.insertOne(surveyData);
        console.log('Survey saved to MongoDB:', result.insertedId);

        // Get total count of responses
        const totalResponses = await collection.countDocuments();

        res.status(200).json({ 
            message: 'Survey submitted successfully',
            responseId: surveyData.id,
            mongoId: result.insertedId,
            totalResponses: totalResponses
        });

    } catch (error) {
        console.error('Error saving survey response:', error);
        
        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({ 
                error: 'Duplicate response ID',
                details: 'This response has already been submitted'
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to save survey response',
            details: error.message
        });
    }
});

// === Convert MongoDB Data to CSV Format ===
function convertToCSV(responses) {
    if (responses.length === 0) return '';

    // Get all unique keys from all responses (excluding MongoDB _id)
    const allKeys = new Set();
    responses.forEach(response => {
        Object.keys(response).forEach(key => {
            if (key !== '_id') allKeys.add(key);
        });
    });

    const headers = Array.from(allKeys).sort();
    const csvHeader = headers.map(header => `"${header}"`).join(',');

    const csvRows = responses.map(response => {
        return headers.map(header => {
            const value = response[header] || '';
            // Escape quotes and wrap in quotes
            return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',');
    });

    return [csvHeader, ...csvRows].join('\n');
}

// === API: Get All Responses ===
app.get('/api/responses', async (req, res) => {
    try {
        const responses = await collection.find({}).toArray();
        res.json({
            success: true,
            count: responses.length,
            data: responses
        });
    } catch (error) {
        console.error('Error reading responses:', error);
        res.status(500).json({ 
            error: 'Failed to fetch responses',
            details: error.message
        });
    }
});

// === API: Download CSV ===
app.get('/api/download-csv', async (req, res) => {
    try {
        const responses = await collection.find({}).toArray();
        
        if (responses.length === 0) {
            return res.status(404).json({ 
                error: 'No responses found to export'
            });
        }

        const csvContent = convertToCSV(responses);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="survey_responses.csv"');
        res.send(csvContent);
        
    } catch (error) {
        console.error('Error generating CSV:', error);
        res.status(500).json({ 
            error: 'Failed to generate CSV',
            details: error.message
        });
    }
});

// === API: Response Statistics ===
app.get('/api/stats', async (req, res) => {
    try {
        // Get total count
        const totalResponses = await collection.countDocuments();
        
        // Get counts by user type
        const stakeholderCount = await collection.countDocuments({ userType: 'stakeholder' });
        const participantCount = await collection.countDocuments({ userType: 'participant' });
        
        // Get responses grouped by date
        const responsesByDate = await collection.aggregate([
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: { $dateFromString: { dateString: "$timestamp" } }
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]).toArray();

        // Convert to object format
        const dateCount = {};
        responsesByDate.forEach(item => {
            const date = new Date(item._id).toDateString();
            dateCount[date] = item.count;
        });

        // Get latest response
        const latestResponse = await collection.findOne(
            {}, 
            { sort: { timestamp: -1 }, projection: { timestamp: 1 } }
        );

        const stats = {
            totalResponses,
            stakeholderResponses: stakeholderCount,
            participantResponses: participantCount,
            responsesByDate: dateCount,
            latestResponse: latestResponse ? latestResponse.timestamp : null
        };

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ 
            error: 'Failed to generate statistics',
            details: error.message
        });
    }
});

// === API: Get Responses by User Type ===
app.get('/api/responses/:userType', async (req, res) => {
    try {
        const { userType } = req.params;
        
        if (!['stakeholder', 'participant'].includes(userType)) {
            return res.status(400).json({ 
                error: 'Invalid user type. Must be "stakeholder" or "participant"'
            });
        }

        const responses = await collection.find({ userType }).toArray();
        
        res.json({
            success: true,
            userType,
            count: responses.length,
            data: responses
        });
    } catch (error) {
        console.error('Error fetching responses by user type:', error);
        res.status(500).json({ 
            error: 'Failed to fetch responses',
            details: error.message
        });
    }
});

// === API: Delete Response (Optional - for admin use) ===
app.delete('/api/responses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let result;

        // Try to delete by custom id first, then by MongoDB _id
        try {
            result = await collection.deleteOne({ id: id });
        } catch (error) {
            // If custom id fails, try MongoDB ObjectId
            if (ObjectId.isValid(id)) {
                result = await collection.deleteOne({ _id: new ObjectId(id) });
            } else {
                throw error;
            }
        }

        if (result.deletedCount === 0) {
            return res.status(404).json({ 
                error: 'Response not found'
            });
        }

        res.json({
            success: true,
            message: 'Response deleted successfully',
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Error deleting response:', error);
        res.status(500).json({ 
            error: 'Failed to delete response',
            details: error.message
        });
    }
});

// === Health Check ===
app.get('/api/health', async (req, res) => {
    try {
        // Check MongoDB connection
        await db.admin().ping();
        
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: {
                status: 'Connected',
                name: DATABASE_NAME,
                collection: COLLECTION_NAME
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: {
                status: 'Disconnected',
                error: error.message
            }
        });
    }
});

// === Error Handler ===
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// === 404 Handler ===
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path
    });
});

// === Every-13-Minute Cron Job ===
cron.schedule('*/13 * * * *', async () => {
    try {
        console.log('⏱️ Cron running at', new Date().toISOString());
        
        // Example tasks you can implement:
        
        // 1. Clean up old responses (older than 1 year)
        // const oneYearAgo = new Date();
        // oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        // await collection.deleteMany({ 
        //     timestamp: { $lt: oneYearAgo.toISOString() }
        // });
        
        // 2. Generate periodic backups
        // const responses = await collection.find({}).toArray();
        // const csvContent = convertToCSV(responses);
        // // Save to file or cloud storage
        
        // 3. Send periodic statistics
        // const totalCount = await collection.countDocuments();
        // console.log(`📊 Total responses: ${totalCount}`);
        
        // 4. Update aggregated statistics collection
        // await updateStatisticsCollection();
        
        console.log('✅ Cron job completed successfully');
    } catch (err) {
        console.error('❌ Error in 13-min cron job:', err);
    }
});

// === Graceful Shutdown ===
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    if (db) {
        await db.client.close();
        console.log('MongoDB connection closed');
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    if (db) {
        await db.client.close();
        console.log('MongoDB connection closed');
    }
    process.exit(0);
});

// === Start Server ===
async function startServer() {
    try {
        // Connect to MongoDB first
        await connectToMongoDB();
        
        // Start Express server
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🌐 Visit: http://localhost:${PORT}`);
            console.log(`📊 API Health: http://localhost:${PORT}/api/health`);
            console.log(`📈 API Stats: http://localhost:${PORT}/api/stats`);
            console.log(`📋 API Responses: http://localhost:${PORT}/api/responses`);
            console.log(`📥 Download CSV: http://localhost:${PORT}/api/download-csv`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the application
startServer();