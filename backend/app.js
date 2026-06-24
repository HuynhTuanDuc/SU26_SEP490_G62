require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const routes = require('./routes');
const swaggerDocument = require('./config/swagger');
const { initNotificationGateway } = require('./services/notificationGateway');
const { initCronJobs }           = require('./cron/debtCron');

const app = express();
const port = process.env.PORT || 9999;
const server = http.createServer(app);
initNotificationGateway(server);
initCronJobs();

// Middleware
app.use(express.json());
app.use(cors({
    origin: true,
    credentials: true,
}));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Backend up and running' });
});

// API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
    },
    customSiteTitle: 'G62 Logistics API',
}));

// Routes
app.use('/', routes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Start server
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

module.exports = app;
