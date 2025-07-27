const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// === Middleware ===
app.use(express.json({ limit: '10mb' }));

// Enhanced CORS configuration
app.use(cors({
    origin: ['https://atul-k-m.github.io/ecell-feedback', 'http://127.0.0.1:5500', 'http://localhost:3000'],
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

        // Ensure 'responses' directory exists
        const responsesDir = path.join(__dirname, 'responses');
        try {
            await fs.access(responsesDir);
        } catch {
            await fs.mkdir(responsesDir, { recursive: true });
            console.log('Created responses directory');
        }

        // Read existing responses (if file exists)
        const responsesFile = path.join(responsesDir, 'survey_responses.json');
        let existingResponses = [];

        try {
            const data = await fs.readFile(responsesFile, 'utf8');
            existingResponses = JSON.parse(data);
        } catch (error) {
            console.log('No existing responses file, creating new one');
            existingResponses = [];
        }

        // Add new response
        existingResponses.push(surveyData);

        // Write updated JSON
        await fs.writeFile(responsesFile, JSON.stringify(existingResponses, null, 2));
        console.log('Survey saved to JSON file');

        // Save as CSV
        await saveAsCSV(existingResponses);
        console.log('Survey saved to CSV file');

        res.status(200).json({ 
            message: 'Survey submitted successfully',
            responseId: surveyData.id,
            totalResponses: existingResponses.length
        });

    } catch (error) {
        console.error('Error saving survey response:', error);
        res.status(500).json({ 
            error: 'Failed to save survey response',
            details: error.message
        });
    }
});

// === Convert Responses to CSV ===
async function saveAsCSV(responses) {
    if (responses.length === 0) return;

    // Get all unique keys from all responses
    const allKeys = new Set();
    responses.forEach(response => {
        Object.keys(response).forEach(key => allKeys.add(key));
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

    const csvContent = [csvHeader, ...csvRows].join('\n');

    const csvFile = path.join(__dirname, 'responses', 'survey_responses.csv');
    await fs.writeFile(csvFile, csvContent);
}

// === API: Get All Responses ===
app.get('/api/responses', async (req, res) => {
    try {
        const responsesFile = path.join(__dirname, 'responses', 'survey_responses.json');
        const data = await fs.readFile(responsesFile, 'utf8');
        const responses = JSON.parse(data);
        res.json({
            success: true,
            count: responses.length,
            data: responses
        });
    } catch (error) {
        console.error('Error reading responses:', error);
        res.status(404).json({ 
            error: 'No responses found',
            details: error.message
        });
    }
});

// === API: Download CSV ===
app.get('/api/download-csv', async (req, res) => {
    try {
        const csvFile = path.join(__dirname, 'responses', 'survey_responses.csv');
        await fs.access(csvFile);
        res.download(csvFile, 'survey_responses.csv');
    } catch (error) {
        console.error('Error downloading CSV:', error);
        res.status(404).json({ 
            error: 'CSV file not found',
            details: error.message
        });
    }
});

// === API: Response Statistics ===
app.get('/api/stats', async (req, res) => {
    try {
        const responsesFile = path.join(__dirname, 'responses', 'survey_responses.json');
        const data = await fs.readFile(responsesFile, 'utf8');
        const responses = JSON.parse(data);

        const stats = {
            totalResponses: responses.length,
            stakeholderResponses: responses.filter(r => r.userType === 'stakeholder').length,
            participantResponses: responses.filter(r => r.userType === 'participant').length,
            responsesByDate: getResponsesByDate(responses),
            latestResponse: responses.length > 0 ? responses[responses.length - 1].timestamp : null
        };

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(404).json({ 
            error: 'No responses found',
            details: error.message
        });
    }
});

function getResponsesByDate(responses) {
    const dateCount = {};
    responses.forEach(response => {
        const date = new Date(response.timestamp).toDateString();
        dateCount[date] = (dateCount[date] || 0) + 1;
    });
    return dateCount;
}

// === Health Check ===
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
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

// === Start Server ===
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Visit: http://localhost:${PORT}`);
    console.log(`📊 API Health: http://localhost:${PORT}/api/health`);
    console.log(`📈 API Stats: http://localhost:${PORT}/api/stats`);
});
// === Every‑13‑Minute Cron Job ===
cron.schedule('*/13 * * * *', async () => {
  try {
    console.log('⏱️ Cron running at', new Date().toISOString());
    // TODO: put your task here—e.g. re-export CSV, clean old data, ping an endpoint, etc.
    // await saveAsCSV(...);
    // await cleanupOldResponses(...);
  } catch (err) {
    console.error('❌ Error in 13‑min cron job:', err);
  }
});

// === Graceful Shutdown ===
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});